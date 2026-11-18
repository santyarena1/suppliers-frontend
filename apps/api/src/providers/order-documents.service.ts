import { Injectable, Logger, type StreamableFile } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { cronsAreGloballyEnabled } from "../common/cron-window";
import { CredentialsService } from "../credentials/credentials.service";
import type { FiscalData } from "../orders-api/arca-invoice";
import { DOCUMENT_PROVIDERS } from "../orders-api/document-providers";
import { analyzeInvoicePdf } from "../orders-api/invoice-analysis";
import { addLine, IGNORED_CODES, matchByLines, orderLines, parseAirItems, parseDay, type Lines, type OrderLines } from "../orders-api/invoice-match";
import { airInvoiceLines, elitInvoiceLines, nbInvoiceLines, type InvoiceLines } from "../orders-api/invoice-lines";
import { MAX_PDF_BYTES } from "../orders-api/invoice-pdf";
import { PrismaService } from "../prisma/prisma.service";
import { TgsAccessService } from "../tgs/tgs.access";
import { AirPortalClient, AIR_COMPROBANTES_URL } from "./air-portal-client";
import { ElitAccountService } from "./elit-account.service";
import { stripTags } from "./html-table";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { fetchNbVoucher, nbFiscal, nbLines, renderNbVoucherPdf } from "./new-bytes-voucher";
import { nodoNumbers } from "./order-tracking";
import { SolutionBoxAccountService } from "./solution-box-account.service";

/**
 * Facturas, notas de crédito/débito y remitos de los portales de los
 * distribuidores, guardados en NODO: el PDF como `StoredAsset` privado y los
 * datos fiscales en `ProviderOrderDocument`. Solo lee los portales.
 *
 * Se guardan TODOS los comprobantes de los últimos 120 días, estén o no unidos
 * a un pedido de NODO (el dueño quiere que a AcuStock lleguen igual, 18/11):
 * - Elit: movimientos de cuenta corriente (factura / nota). Se unen al pedido
 *   por la nota de venta, que trae el número de factura; el remito sale de la nota.
 * - Solution Box: la factura de cada pedido del portal; se une si el pedido es de NODO.
 * - New Bytes: comprobantes del listado; sin PDF original, NODO arma uno con los
 *   datos oficiales (lio.red) y el QR. Se unen por productos y cantidades.
 * - Air: facturas de venta (FV) con su PDF; se unen por productos y cantidades.
 *
 * Datos fiscales: QR de ARCA y, lo que no trae, el texto del PDF (o los datos
 * oficiales de New Bytes). Lo que no se lee queda en null.
 *
 * Cada 30 minutos, solo para el comercio del Sistema TGS. `ORDER_DOCS=off` lo apaga.
 */

const DAYS = 120;
/** Descargas por vuelta (cada PDF se lee entero para el QR). */
const MAX_FETCH_PER_RUN = 40;
const PER_PROVIDER_PER_RUN = 15;
/** Un comprobante que falló se reintenta recién después de esto. */
const RETRY_AFTER_MS = 6 * 3_600_000;
const FETCH_TIMEOUT_MS = 60_000;

export type DocumentKind = "FACTURA" | "NOTA_CREDITO" | "NOTA_DEBITO" | "REMITO";

interface Fetched {
  pdf: Buffer;
  /** Datos fiscales ya leídos (New Bytes); si no, se leen del PDF. */
  fiscal?: { data: FiscalData; origen: "qr" | "texto" };
  /** PDF armado por NODO (no es el original del distribuidor). */
  generated?: boolean;
  /** Pedido encontrado al bajar el comprobante (unión por productos). */
  orderId?: string | null;
  link?: string | null;
  /** Renglones reales, si ya se leyeron al bajar el comprobante. */
  lines?: InvoiceLines | null;
}

/** Texto del PDF (se lee solo si hace falta). */
type PdfText = () => Promise<string | null>;

interface Candidate {
  /** Pedido de NODO, si el portal lo dice. */
  orderId: string | null;
  kind: DocumentKind;
  /** Clave estable del comprobante en el portal (única por distribuidor). */
  portalRef: string;
  portalNumber: string | null;
  /** Cómo se unió al pedido. */
  link: string | null;
  fetch: () => Promise<Fetched>;
  /** Renglones reales facturados (también para completar los ya guardados). */
  lines?: (pdfText: PdfText) => Promise<InvoiceLines | null>;
}

type OrderRef = {
  id: string;
  provider: string;
  createdAt: Date;
  items: unknown;
  invidOrderNumber: string | null;
  invidWebOrderNumber: string | null;
};

export interface SyncResult {
  provider: string;
  candidates: number;
  saved: number;
  errors: number;
  linked: number;
  /** Comprobantes ya guardados a los que se les completaron los renglones. */
  lines: number;
}

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

const isFiscalForm = (form: string | null | undefined) => /factura|cr[eé]dito|d[eé]bito/i.test(String(form ?? ""));

function linkLabel(how: "exacto" | "parcial" | null): string | null {
  return how === "exacto" ? "mismos productos y cantidades" : how === "parcial" ? "factura parcial del pedido" : null;
}

/** Columnas de los renglones (lo que no se pudo leer queda null, pero queda anotado que se intentó). */
function linesData(lines: InvoiceLines | null) {
  return {
    lines: lines?.renglones.length ? (lines.renglones as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    scheme: lines?.esquema ? (lines.esquema as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    linesFetchedAt: new Date(),
  };
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
    private readonly solutionBox: SolutionBoxAccountService,
    private readonly newBytes: NewBytesAccountService
  ) {}

  @Cron("7,37 * * * *")
  async tick() {
    if (!cronsAreGloballyEnabled()) return;
    if ((process.env.ORDER_DOCS ?? "").toLowerCase() === "off") return;
    const tenantId = await this.tgs.allowedTenantId().catch(() => null);
    if (!tenantId) return;
    await this.sync(tenantId).catch((err) => this.log.warn(`Facturas: ${err instanceof Error ? err.message : String(err)}`));
  }

  /** Busca en cada portal los comprobantes recientes y guarda los nuevos. */
  async sync(tenantId: string, now = new Date()): Promise<SyncResult[]> {
    if (this.running) return [];
    this.running = true;
    try {
      const since = new Date(now.getTime() - DAYS * 86_400_000);
      // Pedidos de NODO para unir (un poco más atrás: la factura puede llegar después).
      const orders = await this.prisma.providerOrder.findMany({
        where: { tenantId, status: "CREATED", provider: { in: [...DOCUMENT_PROVIDERS] }, createdAt: { gte: new Date(since.getTime() - 30 * 86_400_000) } },
        select: { id: true, provider: true, createdAt: true, items: true, invidOrderNumber: true, invidWebOrderNumber: true },
        orderBy: { createdAt: "desc" },
      });
      let budget = MAX_FETCH_PER_RUN;
      const out: SyncResult[] = [];
      for (const provider of DOCUMENT_PROVIDERS) {
        if (budget <= 0) break;
        const creds = await this.credentialsFor(tenantId, provider);
        if (!creds) continue;
        const res: SyncResult = { provider, candidates: 0, saved: 0, errors: 0, linked: 0, lines: 0 };
        try {
          const list = orders.filter((o) => o.provider === provider);
          const cands = await withTimeout(this.candidates(provider, tenantId, creds, list, since), 4 * 60_000);
          res.candidates = cands.length;
          const pending = await this.pending(tenantId, provider, cands);
          // Un tope por distribuidor: la historia de uno no frena al resto.
          let left = Math.min(budget, PER_PROVIDER_PER_RUN);
          for (const item of pending.lines) {
            if (left <= 0) break;
            left--;
            budget--;
            if (await this.fillLines(item)) res.lines++;
          }
          for (const c of pending.fetch.slice(0, Math.max(0, left))) {
            budget--;
            const r = await this.store(tenantId, provider, c);
            if (r === "error") res.errors++;
            else {
              res.saved++;
              if (r === "linked") res.linked++;
            }
          }
        } catch (err) {
          res.errors++;
          this.log.warn(`Facturas ${provider}: ${err instanceof Error ? err.message : String(err)}`);
        }
        out.push(res);
        if (res.saved || res.errors || res.lines) {
          this.log.log(`Facturas ${provider}: ${res.saved} guardados (${res.linked} unidos a un pedido), ${res.errors} con error, ${res.lines} con renglones completados, ${res.candidates} en el portal`);
        }
      }
      return out;
    } finally {
      this.running = false;
    }
  }

  // ---------- Qué comprobantes hay en cada portal ----------

  private async candidates(provider: string, tenantId: string, creds: Record<string, string>, orders: OrderRef[], since: Date): Promise<Candidate[]> {
    const orderOf = (nums: unknown[]) =>
      orders.find((o) => nums.some((n) => n != null && String(n).trim() !== "" && nodoNumbers(o).has(String(n).trim())));
    const byLines: OrderLines[] = orders.map((o) => ({ id: o.id, createdAt: o.createdAt, lines: orderLines(o.items) }));
    const recent = (raw: unknown) => {
      const d = parseDay(raw);
      return !d || d >= since;
    };
    const out: Candidate[] = [];
    switch (provider) {
      case "ELIT": {
        const acc = await this.elit.getAccount(tenantId, creds);
        // Qué pedido de NODO tiene cada factura (la nota de venta trae el número = movimiento de cta. cte.).
        const orderOfInvoice = new Map<string, string>();
        const orderOfRemito = new Map<string, string>();
        const noteOfInvoice = new Map<string, (typeof acc.orders)[number]>();
        for (const n of acc.orders) if (digits(n.invoiceNumber)) noteOfInvoice.set(digits(n.invoiceNumber), n);
        // Renglones de la factura: los de su nota de venta (con el kit del esquema y sus hijos).
        const elitLines = (invoiceNumber: string) => async (): Promise<InvoiceLines | null> => {
          const note = noteOfInvoice.get(digits(invoiceNumber));
          if (!note) return null;
          const items = note.items?.length ? note.items : (await this.elit.getSaleNote(tenantId, creds, note.orderNumber)).items;
          return items?.length ? elitInvoiceLines(items) : null;
        };
        for (const n of acc.orders) {
          const order = orderOf([n.internalNumber, n.orderNumber]);
          if (!order) continue;
          if (digits(n.invoiceNumber)) orderOfInvoice.set(digits(n.invoiceNumber), order.id);
          if (digits(n.dispatchNote)) orderOfRemito.set(digits(n.dispatchNote), order.id);
          if (n.dispatchNotePdfUrl) {
            out.push({
              orderId: order.id,
              kind: "REMITO",
              portalRef: `REMITO|${n.dispatchNote || n.orderNumber}`,
              portalNumber: n.dispatchNote || null,
              link: "nota de venta → remito",
              fetch: async () => ({ pdf: await toBuffer(await this.elit.getDocument(creds, { number: n.orderNumber, kind: "dispatch" })) }),
            });
          }
        }
        for (const m of acc.movements) {
          if (!isFiscalForm(m.form) || !m.number || !recent(m.date)) continue;
          const byInvoice = orderOfInvoice.get(digits(m.number));
          const byRemito = digits(m.remito) ? orderOfRemito.get(digits(m.remito)) : undefined;
          const orderId = byInvoice ?? byRemito ?? null;
          out.push({
            orderId,
            kind: kindFromForm(m.form),
            portalRef: `${m.form}|${m.number}`,
            portalNumber: m.number,
            link: byInvoice ? "nota de venta → factura" : byRemito ? "remito → comprobante" : null,
            fetch: async () => ({ pdf: await toBuffer(await this.elit.getDocument(creds, { form: m.form, number: m.number })) }),
            lines: elitLines(m.number),
          });
        }
        // Una factura de un pedido de NODO que todavía no aparece en la cuenta corriente.
        for (const n of acc.orders) {
          const order = orderOf([n.internalNumber, n.orderNumber]);
          const inv = digits(n.invoiceNumber);
          if (!order || !inv || acc.movements.some((m) => digits(m.number) === inv)) continue;
          out.push({
            orderId: order.id,
            kind: "FACTURA",
            portalRef: `FACTURA A|${n.invoiceNumber}`,
            portalNumber: n.invoiceNumber,
            link: "nota de venta → factura",
            fetch: async () => ({ pdf: await toBuffer(await this.elit.getDocument(creds, { form: "FACTURA A", number: n.invoiceNumber })) }),
            lines: elitLines(n.invoiceNumber),
          });
        }
        break;
      }
      case "SOLUTION_BOX": {
        const acc = await this.solutionBox.getAccount(tenantId, creds);
        for (const o of acc.orders) {
          if (!o.invoice || !recent(o.date)) continue;
          const order = orderOf([o.number, `${o.number}/${o.extension}`]);
          const ext = String(o.extension || "01");
          out.push({
            orderId: order?.id ?? null,
            kind: "FACTURA",
            portalRef: `${o.number}/${ext}|${o.invoice}`,
            portalNumber: o.invoice,
            link: order ? "pedido → factura" : null,
            fetch: async () => ({ pdf: await toBuffer(await this.solutionBox.getInvoice(creds, String(o.number), ext)) }),
          });
        }
        break;
      }
      case "NEW_BYTES": {
        const st = await this.newBytes.getAccountStatement(creds);
        for (const v of st.movements) {
          const label = String(v.invoiceLabel ?? v.invoiceType ?? "");
          if (!v.voucherUrl || v.voucherId == null || !isFiscalForm(label) || !recent(v.invoiceDate)) continue;
          const voucherUrl = String(v.voucherUrl);
          const nbLinesOf = async () => {
            const data = await fetchNbVoucher(voucherUrl);
            return nbInvoiceLines(data.detalle, data.kits, nbFiscal(data).fiscal.moneda);
          };
          out.push({
            orderId: null,
            kind: kindFromForm(label),
            portalRef: `NB|${v.voucherId}`,
            portalNumber: v.invoiceNumber ? String(v.invoiceNumber) : null,
            link: null,
            fetch: async () => {
              const data = await fetchNbVoucher(voucherUrl);
              const { fiscal, qr } = nbFiscal(data);
              const m = matchByLines({ lines: nbLines(data), date: parseDay(fiscal.fecha_emision) }, byLines, { ignore: IGNORED_CODES.NEW_BYTES });
              return {
                pdf: await renderNbVoucherPdf(data, fiscal),
                fiscal: { data: fiscal, origen: qr ? "qr" : "texto" },
                generated: true,
                orderId: m.orderId,
                link: linkLabel(m.how),
                lines: this.noteIgnored("NEW_BYTES", nbInvoiceLines(data.detalle, data.kits, fiscal.moneda)),
              };
            },
            lines: nbLinesOf,
          });
        }
        break;
      }
      case "AIR": {
        const api = await AirPortalClient.login(creds);
        const from = since.toISOString().slice(0, 10);
        const to = new Date().toISOString().slice(0, 10);
        const html = await api.getText(`${AIR_COMPROBANTES_URL}?q=FV&qd=${from}&qh=${to}`);
        const seen = new Set<string>();
        for (const m of html.matchAll(/nrocompro="([^"]+)"/gi)) {
          const code = m[1];
          if (!/^[\w-]{6,40}$/.test(code) || !/FV/i.test(code) || seen.has(code)) continue;
          seen.add(code);
          const near = stripTags(html.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 600));
          const date = parseDay(near);
          let itemsCache: string | null = null;
          const itemsText = async () => (itemsCache ??= await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(code)}`).catch(() => ""));
          out.push({
            orderId: null,
            kind: "FACTURA",
            portalRef: `AIR|${code}`,
            portalNumber: code,
            link: null,
            fetch: async () => {
              const items = await itemsText();
              const lines: Lines = new Map();
              for (const it of parseAirItems(stripTags(items))) addLine(lines, it.code, it.qty);
              const mt = matchByLines({ lines, date }, byLines, { ignore: IGNORED_CODES.AIR });
              const file = await api.getBuffer(`https://www.air-intra.com/2025/pdf/index.php?q=${encodeURIComponent(code)}`);
              return { pdf: file.buffer, orderId: mt.orderId, link: linkLabel(mt.how) };
            },
            lines: async (pdfText) => {
              const items = stripTags(await itemsText());
              return items.trim() ? airInvoiceLines(items, await pdfText()) : null;
            },
          });
        }
        break;
      }
    }
    const seen = new Set<string>();
    return out.filter((c) => (seen.has(c.portalRef) ? false : (seen.add(c.portalRef), true)));
  }

  /**
   * Los que faltan guardar: nuevos, o que fallaron hace más de 6 horas. De paso,
   * une al pedido los ya guardados que ahora el portal sí ata a uno.
   */
  private async pending(tenantId: string, provider: string, cands: Candidate[]): Promise<{ fetch: Candidate[]; lines: { c: Candidate; id: string; assetId: string }[] }> {
    if (cands.length === 0) return { fetch: [], lines: [] };
    const existing = await this.prisma.providerOrderDocument.findMany({
      where: { tenantId, provider, portalRef: { in: cands.map((c) => c.portalRef) } },
      select: { id: true, portalRef: true, orderId: true, assetId: true, fetchedAt: true, linesFetchedAt: true, kind: true },
    });
    const byRef = new Map(existing.map((d) => [d.portalRef, d]));
    const now = Date.now();
    const out: Candidate[] = [];
    const lines: { c: Candidate; id: string; assetId: string }[] = [];
    for (const c of cands) {
      const d = byRef.get(c.portalRef);
      if (!d) {
        out.push(c);
        continue;
      }
      if (c.orderId && !d.orderId) await this.prisma.providerOrderDocument.update({ where: { id: d.id }, data: { orderId: c.orderId, link: c.link } });
      if (!d.assetId && (!d.fetchedAt || now - d.fetchedAt.getTime() > RETRY_AFTER_MS)) out.push(c);
      // Guardado antes de leer renglones: se completan sin volver a bajar el PDF.
      else if (d.assetId && !d.linesFetchedAt && d.kind !== "REMITO" && c.lines) lines.push({ c, id: d.id, assetId: d.assetId });
    }
    return { fetch: out, lines };
  }

  /** Completa los renglones de un comprobante ya guardado (el PDF se lee de NODO, no del portal). */
  private async fillLines(item: { c: Candidate; id: string; assetId: string }): Promise<boolean> {
    try {
      const pdfText: PdfText = async () => {
        const asset = await this.prisma.storedAsset.findUnique({ where: { id: item.assetId }, select: { data: true } });
        return asset ? (await analyzeInvoicePdf(Buffer.from(asset.data))).text || null : null;
      };
      const lines = await withTimeout(item.c.lines!(pdfText), FETCH_TIMEOUT_MS);
      await this.prisma.providerOrderDocument.update({ where: { id: item.id }, data: linesData(lines) });
      return true;
    } catch (err) {
      this.log.warn(`Facturas: renglones de ${item.c.portalRef}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  // ---------- Guardar ----------

  /** Baja el PDF, lee los datos fiscales y lo guarda. */
  private async store(tenantId: string, provider: string, c: Candidate): Promise<"saved" | "linked" | "error"> {
    const base = { tenantId, orderId: c.orderId, provider, kind: c.kind, portalRef: c.portalRef, portalNumber: c.portalNumber, link: c.link };
    let got: Fetched;
    try {
      got = await withTimeout(c.fetch(), FETCH_TIMEOUT_MS);
      if (got.pdf.length === 0) throw new Error("el portal devolvió el archivo vacío");
      if (got.pdf.length > MAX_PDF_BYTES) throw new Error("el PDF supera 15 MB");
    } catch (err) {
      await this.saveError(base, (err instanceof Error ? err.message : String(err)).slice(0, 300));
      return "error";
    }
    const orderId = c.orderId ?? got.orderId ?? null;
    const link = c.orderId ? c.link : (got.link ?? null);

    let f: FiscalData | null = null;
    let origen: string | null = null;
    let pdfTextValue: string | null = null;
    if (got.fiscal) {
      f = got.fiscal.data;
      origen = got.fiscal.origen;
    } else {
      const a = await analyzeInvoicePdf(got.pdf);
      if (!a.isPdf) {
        await this.saveError(base, `el portal no devolvió un PDF (${got.pdf.length} bytes)`);
        return "error";
      }
      f = a.fiscal;
      origen = a.origen;
      pdfTextValue = a.text || null;
    }
    let lines: InvoiceLines | null | undefined = got.lines;
    if (lines === undefined && c.lines && c.kind !== "REMITO") {
      lines = await withTimeout(c.lines(async () => pdfTextValue), FETCH_TIMEOUT_MS).catch(() => null);
    }
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
          origen,
        };
    // El QR manda sobre el nombre del formulario del portal.
    const kind: DocumentKind = remito ? "REMITO" : f.clase === "nota_credito" ? "NOTA_CREDITO" : f.clase === "nota_debito" ? "NOTA_DEBITO" : c.kind;
    const sha256 = createHash("sha256").update(got.pdf).digest("hex");
    const label = remito ? "remito" : kind === "FACTURA" ? "factura" : kind.toLowerCase().replace("_", "-");
    const filename = `${label}-${provider.toLowerCase()}-${(c.portalNumber || c.portalRef).replace(/[^\w-]+/g, "_").slice(0, 60)}.pdf`;
    await this.prisma.$transaction(async (tx) => {
      const asset = await tx.storedAsset.create({
        data: { mimeType: "application/pdf", filename, byteSize: got.pdf.length, data: got.pdf, isPrivate: true, ownerTenantId: tenantId, purpose: "order-document" },
        select: { id: true },
      });
      const data = { ...fiscal, ...(lines !== undefined ? linesData(lines) : {}), kind, orderId, link, generated: !!got.generated, assetId: asset.id, sha256, byteSize: got.pdf.length, fetchedAt: new Date(), fetchError: null };
      const prev = await tx.providerOrderDocument.findFirst({ where: { tenantId, provider, portalRef: c.portalRef }, select: { id: true, assetId: true, orderId: true } });
      if (prev) {
        await tx.providerOrderDocument.update({ where: { id: prev.id }, data: { ...data, orderId: prev.orderId ?? orderId } });
        if (prev.assetId) await tx.storedAsset.deleteMany({ where: { id: prev.assetId } });
      } else {
        await tx.providerOrderDocument.create({ data: { ...base, ...data } });
      }
    });
    return orderId ? "linked" : "saved";
  }

  private noted = new Set<string>();
  /** Una vez por código: qué es el renglón que se ignora al unir (para confirmar que no es un producto). */
  private noteIgnored(provider: string, lines: InvoiceLines): InvoiceLines {
    for (const l of lines.renglones) {
      if (!(IGNORED_CODES[provider] ?? []).includes(l.codigo) || this.noted.has(provider + l.codigo)) continue;
      this.noted.add(provider + l.codigo);
      this.log.log(`Facturas ${provider}: el renglón ${l.codigo} que se ignora al unir es «${l.descripcion ?? "?"}» (${l.cantidad} × ${l.precio_unitario ?? "?"})`);
    }
    return lines;
  }

  /** Deja anotado el intento fallido. */
  private async saveError(base: { tenantId: string; orderId: string | null; provider: string; kind: DocumentKind; portalRef: string; portalNumber: string | null; link: string | null }, fetchError: string) {
    const prev = await this.prisma.providerOrderDocument.findFirst({ where: { tenantId: base.tenantId, provider: base.provider, portalRef: base.portalRef }, select: { id: true } });
    if (prev) await this.prisma.providerOrderDocument.update({ where: { id: prev.id }, data: { fetchedAt: new Date(), fetchError } });
    else await this.prisma.providerOrderDocument.create({ data: { ...base, fetchedAt: new Date(), fetchError } });
  }

  private async credentialsFor(tenantId: string, provider: string): Promise<Record<string, string> | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { mirrorsCommercialFromId: true } });
    const stored = await this.credentials.findByProvider(tenant?.mirrorsCommercialFromId ?? tenantId, provider as never);
    return stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : null;
  }
}
