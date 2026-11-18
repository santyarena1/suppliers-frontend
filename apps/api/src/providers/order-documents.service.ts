import { Injectable, Logger, type StreamableFile } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { cronsAreGloballyEnabled } from "../common/cron-window";
import { CredentialsService } from "../credentials/credentials.service";
import { analyzeInvoicePdf } from "../orders-api/invoice-analysis";
import { MAX_PDF_BYTES } from "../orders-api/invoice-pdf";
import { PrismaService } from "../prisma/prisma.service";
import { TgsAccessService } from "../tgs/tgs.access";
import { ElitAccountService } from "./elit-account.service";
import { nodoNumbers } from "./order-tracking";
import { SolutionBoxAccountService } from "./solution-box-account.service";
import { DOCUMENT_PROVIDERS } from "../orders-api/document-providers";

/**
 * Facturas y remitos de cada pedido, bajados del portal del distribuidor y
 * guardados en NODO (PDF como `StoredAsset` privado + datos fiscales en
 * `ProviderOrderDocument`). Solo lee los portales; nunca escribe en ellos.
 *
 * Distribuidores con todo confirmado en la prueba en modo lectura (18/11):
 * - Elit: la nota de venta trae el número de factura (= número del movimiento
 *   de cuenta corriente) y el PDF del remito.
 * - Solution Box: la factura cuelga del pedido.
 *
 * Los datos fiscales salen del QR de ARCA y, lo que el QR no trae, del texto
 * del PDF. Lo que no se puede leer queda en null.
 *
 * Corre cada 30 minutos para el comercio del Sistema TGS (la API de pedidos
 * es solo para él). `ORDER_DOCS=off` lo apaga.
 */

const ORDER_DAYS = 120;
/** Descargas por vuelta (cada PDF se lee entero para el QR: no conviene juntar muchos). */
const MAX_FETCH_PER_RUN = 25;
/** Un comprobante que falló se reintenta recién después de esto. */
const RETRY_AFTER_MS = 6 * 3_600_000;
const FETCH_TIMEOUT_MS = 60_000;

export type DocumentKind = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "REMITO";

interface Candidate {
  orderId: string;
  kind: DocumentKind;
  /** Clave estable del comprobante en el portal. */
  portalRef: string;
  portalNumber: string | null;
  link: string;
  fetch: () => Promise<Buffer>;
}

type OrderRef = { id: string; tenantId: string; provider: string; invidOrderNumber: string | null; invidWebOrderNumber: string | null };

async function toBuffer(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of file.getStream()) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");

/** Clase del comprobante por el nombre del formulario del portal (si el QR no la da). */
export function kindFromForm(form: string | null | undefined): DocumentKind {
  const f = String(form ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/credito/.test(f)) return "NOTA_CREDITO";
  if (/debito/.test(f)) return "NOTA_DEBITO";
  if (/remito/.test(f)) return "REMITO";
  return "FACTURA";
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: NodeJS.Timeout | undefined;
  return Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error("el portal tardó demasiado")), ms)))]).finally(() => {
    if (t) clearTimeout(t);
  });
}

@Injectable()
export class OrderDocumentsService {
  private readonly log = new Logger(OrderDocumentsService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly tgs: TgsAccessService,
    private readonly elit: ElitAccountService,
    private readonly solutionBox: SolutionBoxAccountService
  ) {}

  @Cron("7,37 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled()) return;
    if ((process.env.ORDER_DOCS ?? "").toLowerCase() === "off") return;
    const tenantId = await this.tgs.allowedTenantId().catch(() => null);
    if (!tenantId) return;
    await this.sync(tenantId).catch((err) => this.log.warn(`Facturas: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** Busca en cada portal los comprobantes de los pedidos recientes y guarda los nuevos. */
  async sync(tenantId: string): Promise<{ provider: string; candidates: number; saved: number; errors: number }[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const since = new Date(Date.now() - ORDER_DAYS * 86_400_000);
      const orders = await this.prisma.providerOrder.findMany({
        where: { tenantId, status: "CREATED", provider: { in: [...DOCUMENT_PROVIDERS] }, createdAt: { gte: since } },
        select: { id: true, tenantId: true, provider: true, invidOrderNumber: true, invidWebOrderNumber: true },
        orderBy: { createdAt: "desc" },
      });
      let budget = MAX_FETCH_PER_RUN;
      const out: { provider: string; candidates: number; saved: number; errors: number }[] = [];
      for (const provider of DOCUMENT_PROVIDERS) {
        const list = orders.filter((o) => o.provider === provider);
        if (list.length === 0 || budget <= 0) continue;
        const creds = await this.credentialsFor(tenantId, provider);
        if (!creds) continue;
        const res = { provider, candidates: 0, saved: 0, errors: 0 };
        try {
          const cands = await withTimeout(this.candidates(provider, tenantId, creds, list), 3 * 60_000);
          res.candidates = cands.length;
          const pending = await this.pending(cands);
          for (const c of pending.slice(0, budget)) {
            budget--;
            const ok = await this.store(tenantId, provider, c);
            if (ok) res.saved++;
            else res.errors++;
          }
        } catch (err) {
          res.errors++;
          this.log.warn(`Facturas ${provider}: ${err instanceof Error ? err.message : String(err)}`);
        }
        out.push(res);
        if (res.saved || res.errors) this.log.log(`Facturas ${provider}: ${res.saved} guardados, ${res.errors} con error (${res.candidates} en el portal)`);
      }
      return out;
    } finally {
      this.running = false;
    }
  }

  // ---------- Qué comprobantes hay en cada portal ----------

  private async candidates(provider: string, tenantId: string, creds: Record<string, string>, orders: OrderRef[]): Promise<Candidate[]> {
    const orderOf = (nums: unknown[]) =>
      orders.find((o) => nums.some((n) => n != null && String(n).trim() !== "" && nodoNumbers(o).has(String(n).trim())));
    const out: Candidate[] = [];
    switch (provider) {
      case "ELIT": {
        const acc = await this.elit.getAccount(tenantId, creds);
        const movements = acc.movements.filter((m) => /factura|cr[eé]dito|d[eé]bito/i.test(m.form ?? ""));
        for (const n of acc.orders) {
          const order = orderOf([n.internalNumber, n.orderNumber]);
          if (!order) continue;
          const inv = digits(n.invoiceNumber);
          if (inv) {
            // El número de factura de la nota de venta es el del movimiento de cuenta corriente.
            const mov = movements.find((m) => digits(m.number) === inv);
            const form = mov?.form || "FACTURA A";
            const number = mov?.number || n.invoiceNumber;
            out.push({
              orderId: order.id,
              kind: kindFromForm(form),
              portalRef: `${form}|${number}`,
              portalNumber: String(number),
              link: "nota de venta → factura",
              fetch: async () => toBuffer(await this.elit.getDocument(creds, { form, number: String(number) })),
            });
          }
          // Notas de crédito o débito que el portal ata al mismo remito.
          const remito = digits(n.dispatchNote);
          if (remito) {
            for (const m of movements.filter((x) => digits(x.remito) === remito && digits(x.number) !== inv)) {
              out.push({
                orderId: order.id,
                kind: kindFromForm(m.form),
                portalRef: `${m.form}|${m.number}`,
                portalNumber: m.number,
                link: "remito → comprobante",
                fetch: async () => toBuffer(await this.elit.getDocument(creds, { form: m.form, number: m.number })),
              });
            }
          }
          if (n.dispatchNotePdfUrl) {
            out.push({
              orderId: order.id,
              kind: "REMITO",
              portalRef: `REMITO|${n.dispatchNote || n.orderNumber}`,
              portalNumber: n.dispatchNote || null,
              link: "nota de venta → remito",
              fetch: async () => toBuffer(await this.elit.getDocument(creds, { number: n.orderNumber, kind: "dispatch" })),
            });
          }
        }
        break;
      }
      case "SOLUTION_BOX": {
        const acc = await this.solutionBox.getAccount(tenantId, creds);
        for (const o of acc.orders) {
          if (!o.invoice) continue;
          const order = orderOf([o.number, `${o.number}/${o.extension}`]);
          if (!order) continue;
          const ext = String(o.extension || "01");
          out.push({
            orderId: order.id,
            kind: "FACTURA",
            portalRef: `${o.number}/${ext}|${o.invoice}`,
            portalNumber: o.invoice,
            link: "pedido → factura",
            fetch: async () => toBuffer(await this.solutionBox.getInvoice(creds, String(o.number), ext)),
          });
        }
        break;
      }
    }
    // Sin repetidos (una factura puede aparecer en dos notas de venta del mismo pedido).
    const seen = new Set<string>();
    return out.filter((c) => {
      const k = `${c.orderId}|${c.kind}|${c.portalRef}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Los que faltan guardar: nuevos, o que fallaron hace más de 6 horas. */
  private async pending(cands: Candidate[]): Promise<Candidate[]> {
    if (cands.length === 0) return [];
    const existing = await this.prisma.providerOrderDocument.findMany({
      where: { orderId: { in: [...new Set(cands.map((c) => c.orderId))] } },
      select: { orderId: true, kind: true, portalRef: true, assetId: true, fetchedAt: true },
    });
    const byKey = new Map(existing.map((d) => [`${d.orderId}|${d.portalRef}`, d]));
    const now = Date.now();
    return cands.filter((c) => {
      const d = byKey.get(`${c.orderId}|${c.portalRef}`);
      if (!d) return true;
      if (d.assetId) return false;
      return !d.fetchedAt || now - d.fetchedAt.getTime() > RETRY_AFTER_MS;
    });
  }

  // ---------- Guardar ----------

  /** Baja el PDF, lee los datos fiscales y lo guarda. Devuelve si quedó guardado el PDF. */
  private async store(tenantId: string, provider: string, c: Candidate): Promise<boolean> {
    const base = { tenantId, orderId: c.orderId, provider, kind: c.kind, portalRef: c.portalRef, portalNumber: c.portalNumber, link: c.link };
    let buf: Buffer;
    try {
      buf = await withTimeout(c.fetch(), FETCH_TIMEOUT_MS);
      if (buf.length === 0) throw new Error("el portal devolvió el archivo vacío");
      if (buf.length > MAX_PDF_BYTES) throw new Error("el PDF supera 15 MB");
    } catch (err) {
      const fetchError = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      await this.saveError(base, fetchError);
      return false;
    }

    const a = await analyzeInvoicePdf(buf);
    if (!a.isPdf) {
      const fetchError = `el portal no devolvió un PDF (${buf.length} bytes)`;
      await this.saveError(base, fetchError);
      return false;
    }
    const f = a.fiscal;
    const remito = c.kind === "REMITO";
    // Un remito no tiene datos fiscales: solo se guarda el PDF.
    const fiscal = remito
      ? {}
      : {
          tipo: f.tipo,
          tipoCodigo: f.tipo_codigo,
          puntoVenta: f.punto_venta,
          numero: f.numero,
          fechaEmision: f.fecha_emision,
          cae: f.cae,
          caeVencimiento: f.cae_vencimiento,
          cuitEmisor: f.cuit_emisor,
          importeTotal: f.importe_total != null ? new Prisma.Decimal(f.importe_total) : null,
          moneda: f.moneda,
          cotizacion: f.cotizacion != null ? new Prisma.Decimal(f.cotizacion) : null,
          origen: a.origen,
        };
    // El QR manda sobre el nombre del formulario del portal.
    const kind: DocumentKind = remito
      ? "REMITO"
      : f.clase === "nota_credito"
        ? "NOTA_CREDITO"
        : f.clase === "nota_debito"
          ? "NOTA_DEBITO"
          : c.kind;
    const sha256 = createHash("sha256").update(buf).digest("hex");
    const filename = `${remito ? "remito" : kind === "FACTURA" ? "factura" : kind.toLowerCase().replace("_", "-")}-${provider.toLowerCase()}-${(c.portalNumber || c.portalRef).replace(/[^\w-]+/g, "_").slice(0, 60)}.pdf`;
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.storedAsset.create({
        data: { mimeType: "application/pdf", filename, byteSize: buf.length, data: buf, isPrivate: true, ownerTenantId: tenantId, purpose: "order-document" },
        select: { id: true },
      });
      const data = { ...fiscal, kind, assetId: asset.id, sha256, byteSize: buf.length, fetchedAt: new Date(), fetchError: null };
      const prev = await tx.providerOrderDocument.findFirst({ where: { orderId: c.orderId, portalRef: c.portalRef }, select: { id: true, assetId: true } });
      if (prev) {
        await tx.providerOrderDocument.update({ where: { id: prev.id }, data });
        if (prev.assetId) await tx.storedAsset.deleteMany({ where: { id: prev.assetId } });
      } else {
        await tx.providerOrderDocument.create({ data: { ...base, ...data } });
      }
    });
    return true;
  }

  /** Deja anotado el intento fallido (la clase la puede haber corregido el QR antes: se busca por pedido + comprobante). */
  private async saveError(base: { tenantId: string; orderId: string; provider: string; kind: DocumentKind; portalRef: string; portalNumber: string | null; link: string }, fetchError: string) {
    const prev = await this.prisma.providerOrderDocument.findFirst({ where: { orderId: base.orderId, portalRef: base.portalRef }, select: { id: true } });
    if (prev) await this.prisma.providerOrderDocument.update({ where: { id: prev.id }, data: { fetchedAt: new Date(), fetchError } });
    else await this.prisma.providerOrderDocument.create({ data: { ...base, fetchedAt: new Date(), fetchError } });
  }

  private async credentialsFor(tenantId: string, provider: string): Promise<Record<string, string> | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { mirrorsCommercialFromId: true } });
    const stored = await this.credentials.findByProvider(tenant?.mirrorsCommercialFromId ?? tenantId, provider as never);
    return stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : null;
  }
}
