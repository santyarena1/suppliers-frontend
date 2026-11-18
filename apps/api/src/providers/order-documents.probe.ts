import { Injectable, Logger, type StreamableFile } from "@nestjs/common";
import { Timeout } from "@nestjs/schedule";
import type { Provider } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";
import { CredentialsService } from "../credentials/credentials.service";
import { TgsAccessService } from "../tgs/tgs.access";
import { analyzeInvoicePdf, mentionedNumbers, type InvoiceAnalysis } from "../orders-api/invoice-analysis";
import { AirAccountService } from "./air-account.service";
import { ElitAccountService } from "./elit-account.service";
import { InvidAccountService } from "./invid-account.service";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { NewTreeAccountService } from "./new-tree-account.service";
import { SolutionBoxAccountService } from "./solution-box-account.service";
import { PolytechClient } from "./polytech-client";
import { AirPortalClient, AIR_COMPROBANTES_URL } from "./air-portal-client";
import { nodoNumbers } from "./order-tracking";

/**
 * PRUEBA EN MODO LECTURA (facturas y remitos desde los portales).
 *
 * Corre una vez, unos minutos después de arrancar, solo para la organización
 * del Sistema TGS. Por cada distribuidor: lee los comprobantes del portal,
 * intenta unirlos a los pedidos de NODO, baja unos pocos PDF a memoria, lee
 * el QR de ARCA y el texto, y deja en el registro una tabla con lo que
 * encontró. No guarda nada en la base ni cambia nada en los portales.
 *
 * `ORDER_DOCS_PROBE=off` la apaga.
 */

const PER_PROVIDER_DOCS = 4;
const ORDER_DAYS = 150;
const TAG = "[facturas-prueba]";

type Kind = "factura" | "remito";

interface Candidate {
  kind: Kind;
  /** Cómo se unió al pedido: «pedido→factura», «remito», «texto del PDF», o null si es una muestra suelta. */
  link: string | null;
  label: string;
  fetch: () => Promise<Buffer>;
}

interface DocResult {
  kind: Kind;
  link: string | null;
  label: string;
  pdf: boolean;
  qr: InvoiceAnalysis["qrFrom"];
  qrCount: number;
  origen: InvoiceAnalysis["origen"];
  campos: string[];
  tipo: string | null;
  cuit: string | null;
  /** Números de pedidos de NODO que aparecen en el texto del PDF. */
  nombraPedidos: number;
  textLen?: number;
  lineas?: string[];
  imagenes?: string[];
  error?: string;
}

interface ProviderReport {
  distribuidor: string;
  cuenta: boolean;
  pedidosNodo: number;
  /** Pedidos de NODO con al menos un comprobante unido por un dato del portal. */
  pedidosUnidos: number;
  comprobantesPortal: number | null;
  docs: DocResult[];
  estructura?: Record<string, unknown>;
  nota?: string;
  error?: string;
}

async function toBuffer(file: StreamableFile): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of file.getStream()) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c as Uint8Array));
  return Buffer.concat(chunks);
}

const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "").replace(/^0+/, "");
const keysOf = (o: unknown): string[] => (o && typeof o === "object" ? Object.keys(o as object).slice(0, 60) : []);

/** Rutas de claves que suenan a factura / remito / PDF dentro de un JSON (para descubrir campos). */
function interestingPaths(o: unknown, prefix = "", out: string[] = [], depth = 0): string[] {
  if (!o || typeof o !== "object" || depth > 5 || out.length > 40) return out;
  for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (/factur|invoice|comprob|remito|packing|dispatch|pdf|cae|voucher|document|file|url/i.test(k)) {
      out.push(`${p}=${v == null ? "null" : Array.isArray(v) ? `[${v.length}]` : typeof v === "object" ? "{…}" : typeof v}`);
    }
    if (Array.isArray(v)) {
      if (v.length) interestingPaths(v[0], `${p}[0]`, out, depth + 1);
    } else if (v && typeof v === "object") interestingPaths(v, p, out, depth + 1);
  }
  return out;
}

/** Líneas del texto con etiquetas fiscales (sin nombres ni domicilios), para ver cómo viene el PDF. */
function fiscalLines(text: string): string[] {
  return text
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => /CAE|Comp|Punto|Fecha|Factura|FACTURA|Total|COD|C.U.I.T|CUIT|Vto|Moneda|Cotiz/i.test(l))
    .slice(0, 14)
    .map((l) => l.slice(0, 120));
}

@Injectable()
export class OrderDocumentsProbe {
  private readonly log = new Logger(OrderDocumentsProbe.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly tgs: TgsAccessService,
    private readonly air: AirAccountService,
    private readonly elit: ElitAccountService,
    private readonly invid: InvidAccountService,
    private readonly newBytes: NewBytesAccountService,
    private readonly newTree: NewTreeAccountService,
    private readonly solutionBox: SolutionBoxAccountService
  ) {}

  @Timeout(4 * 60_000)
  async runOnce() {
    if ((process.env.ORDER_DOCS_PROBE ?? "").toLowerCase() === "off") return;
    try {
      await this.run();
    } catch (err) {
      this.log.warn(`${TAG} no se pudo correr: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async run(): Promise<ProviderReport[]> {
    const tenantId = await this.tgs.allowedTenantId();
    if (!tenantId) {
      this.log.log(`${TAG} sin organización del Sistema TGS: no corre`);
      return [];
    }
    const since = new Date(Date.now() - ORDER_DAYS * 86_400_000);
    const orders = await this.prisma.providerOrder.findMany({
      where: { tenantId, status: "CREATED", createdAt: { gte: since } },
      select: { id: true, provider: true, invidOrderNumber: true, invidWebOrderNumber: true, trackingInvoice: true },
      orderBy: { createdAt: "desc" },
    });
    const byProvider = new Map<string, typeof orders>();
    for (const o of orders) byProvider.set(o.provider, [...(byProvider.get(o.provider) ?? []), o]);

    const providers: Provider[] = ["SOLUTION_BOX", "NEW_BYTES", "ELIT", "INVID", "NEW_TREE", "AIR", "POLYTECH", "DISTECNA", "GRUPO_NUCLEO"];
    const reports: ProviderReport[] = [];
    this.log.log(`${TAG} empieza: ${orders.length} pedidos de NODO de los últimos ${ORDER_DAYS} días`);
    for (const p of providers) {
      const list = byProvider.get(p) ?? [];
      const report: ProviderReport = { distribuidor: p, cuenta: false, pedidosNodo: list.length, pedidosUnidos: 0, comprobantesPortal: null, docs: [] };
      try {
        const creds = await this.credentialsFor(tenantId, p);
        report.cuenta = !!creds;
        if (creds) await this.withTimeout(this.probeProvider(tenantId, p, creds, list, report), 4 * 60_000);
      } catch (err) {
        report.error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
      }
      reports.push(report);
      this.log.log(`${TAG} ${JSON.stringify(report)}`);
    }
    this.log.log(`${TAG} resumen\n${this.table(reports)}`);
    return reports;
  }

  /** El HTML de la primera fila «FC» de la cuenta corriente de Invid (solo etiquetas y atributos, sin textos largos). */
  private async invidRow(creds: Record<string, string>): Promise<string | null> {
    try {
      const svc = this.invid as unknown as { login: (u: string, p: string) => Promise<string>; creds: (c: Record<string, string>) => { username: string; password: string } };
      const { username, password } = svc.creds.call(this.invid, creds);
      const cookie = await svc.login.call(this.invid, username, password);
      const res = await fetch("https://www.invidcomputers.com/lista_ctacte_invid.php", { headers: { Cookie: cookie } });
      const html = await res.text();
      const rows = html.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
      const fc = rows.find((r) => />\s*FC\s*</.test(r));
      return fc ? fc.replace(/\s+/g, " ").slice(0, 1500) : `sin fila FC (${rows.length} filas)`;
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    }
  }

  /** Qué devuelve la página de comprobantes de Air (texto visible y campos del formulario), para ver por qué no hay tabla. */
  private async airPage(creds: Record<string, string>): Promise<string> {
    try {
      const api = await AirPortalClient.login(creds);
      const html = await api.getText(`${AIR_COMPROBANTES_URL}?t=250213`);
      const inputs = [...html.matchAll(/<(input|select|form|iframe)\b[^>]*>/gi)].map((m) => m[0].replace(/value="[^"]*"/gi, 'value="-"')).slice(0, 12).join(" ");
      const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      const scripts = [...html.matchAll(/(?:url|fetch|ajax|load)\s*\(?\s*['"]([^'"]{4,120})['"]/gi)].map((m) => m[1]).slice(0, 8).join(" ");
      return `texto: ${text.slice(0, 500)} || campos: ${inputs.slice(0, 900)} || llamadas: ${scripts}`;
    } catch (err) {
      return `error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200);
    }
  }

  private table(reports: ProviderReport[]): string {
    const rows = reports.map((r) => {
      const docs = r.docs.filter((d) => d.kind === "factura");
      const pdf = docs.filter((d) => d.pdf).length;
      const qr = docs.filter((d) => d.qr).length;
      const campos = [...new Set(docs.flatMap((d) => d.campos))].join(",");
      const remitos = r.docs.filter((d) => d.kind === "remito");
      return [
        r.distribuidor,
        r.cuenta ? "sí" : "no",
        `${r.pedidosUnidos}/${r.pedidosNodo}`,
        r.comprobantesPortal ?? "-",
        `${pdf}/${docs.length}`,
        `${qr}/${docs.length}${docs.find((d) => d.qr)?.qr ? ` (${docs.find((d) => d.qr)?.qr})` : ""}`,
        campos || "-",
        remitos.length ? `${remitos.filter((d) => d.pdf).length}/${remitos.length}` : "-",
        r.error ?? r.nota ?? "",
      ].join(" | ");
    });
    return ["distribuidor | cuenta | unidos/pedidos | comprobantes | pdf | qr | campos | remitos pdf | nota", ...rows].join("\n");
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let t: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([p, new Promise<T>((_, rej) => (t = setTimeout(() => rej(new Error("tardó demasiado")), ms)))]);
    } finally {
      if (t) clearTimeout(t);
    }
  }

  private async credentialsFor(tenantId: string, provider: Provider): Promise<Record<string, string> | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { mirrorsCommercialFromId: true } });
    const stored = await this.credentials.findByProvider(tenant?.mirrorsCommercialFromId ?? tenantId, provider);
    return stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : null;
  }

  private async probeProvider(
    tenantId: string,
    p: Provider,
    creds: Record<string, string>,
    orders: { id: string; invidOrderNumber: string | null; invidWebOrderNumber: string | null; trackingInvoice: string | null }[],
    report: ProviderReport
  ) {
    const allNumbers = new Set(orders.flatMap((o) => [...nodoNumbers(o)]));
    const orderOf = (nums: unknown[]) => orders.find((o) => nums.some((n) => n != null && String(n).trim() && nodoNumbers(o).has(String(n).trim())));
    const cands: Candidate[] = [];
    const linked = new Set<string>();

    switch (p) {
      case "SOLUTION_BOX": {
        const acc = await this.solutionBox.getAccount(tenantId, creds);
        report.comprobantesPortal = acc.invoices.length;
        for (const o of acc.orders) {
          const nodo = orderOf([o.number, `${o.number}/${o.extension}`]);
          if (!nodo || !o.invoice) continue;
          linked.add(nodo.id);
          cands.push({ kind: "factura", link: "pedido→factura", label: `pedido ${o.number}/${o.extension}`, fetch: async () => toBuffer(await this.solutionBox.getInvoice(creds, String(o.number), String(o.extension || "01"))) });
        }
        if (!cands.length) {
          for (const o of acc.invoices.slice(0, 2)) cands.push({ kind: "factura", link: null, label: `muestra ${o.number}`, fetch: async () => toBuffer(await this.solutionBox.getInvoice(creds, String(o.number), String(o.extension || "01"))) });
        }
        break;
      }
      case "NEW_BYTES": {
        const [ord, pur, st] = await Promise.all([this.newBytes.getOrders(creds), this.newBytes.getPurchaseOrders(creds), this.newBytes.getAccountStatement(creds)]);
        const vouchers = st.movements.filter((m) => m.voucherUrl && m.voucherId != null);
        report.comprobantesPortal = st.movements.length;
        report.estructura = {
          comprobanteClaves: keysOf(st.movements[0]),
          pedidoClaves: keysOf(ord.orders[0] ?? pur.orders[0]),
          tiposComprobante: [...new Set(st.movements.map((m) => m.invoiceType))].slice(0, 10),
          voucherHosts: [...new Set(vouchers.map((m) => { try { const u = new URL(String(m.voucherUrl), "https://api.nb.com.ar/v1/"); return u.host + u.pathname.replace(/[0-9a-f-]{8,}/gi, "…").slice(0, 60); } catch { return "?"; } }))].slice(0, 4),
          conCae: st.movements.filter((m) => m.cae).length,
          ejemploComprobantes: st.movements.slice(0, 4).map((m) => `${m.branch ?? ""}|${m.invoiceNumber ?? ""}|${m.invoiceLabel ?? ""}`),
          ejemploFacturaEnPedidos: [...ord.orders, ...pur.orders].map((o) => o.invoice).filter((x) => x && String(x).trim() && String(x).trim() !== "-").slice(0, 6),
          pedidosNodoEnPortal: [...ord.orders, ...pur.orders].filter((o) => orderOf([o.orderNumber, o.webOrderNumber, o.albNumber])).length,
        };
        for (const r of [...ord.orders, ...pur.orders]) {
          const nodo = orderOf([r.orderNumber, r.webOrderNumber, r.albNumber]);
          const inv = digits(r.invoice);
          if (!nodo || !inv) continue;
          const v = vouchers.find((m) => digits(m.invoiceNumber) === inv || digits(m.invoiceNumber).endsWith(inv) || inv.endsWith(digits(m.invoiceNumber)));
          if (!v) continue;
          linked.add(nodo.id);
          cands.push({ kind: "factura", link: "pedido→factura", label: `${v.invoiceType ?? ""} ${v.invoiceNumber ?? ""}`, fetch: async () => toBuffer(await this.newBytes.getDocument(creds, String(v.voucherId))) });
        }
        if (!cands.length) for (const v of vouchers.filter((m) => /factura/i.test(String(m.invoiceLabel ?? ""))).slice(0, PER_PROVIDER_DOCS)) cands.push({ kind: "factura", link: null, label: `muestra ${v.invoiceType ?? ""} ${v.invoiceNumber ?? ""}`, fetch: async () => toBuffer(await this.newBytes.getDocument(creds, String(v.voucherId))) });
        break;
      }
      case "ELIT": {
        const acc = await this.elit.getAccount(tenantId, creds);
        const invoices = acc.movements.filter((m) => /factura/i.test(m.form ?? ""));
        report.comprobantesPortal = invoices.length;
        report.estructura = {
          notaVentaClaves: keysOf(acc.orders[0]),
          movimientoClaves: keysOf(acc.movements[0]),
          movimientosConRemito: acc.movements.filter((m) => digits(m.remito)).length,
          notasConRemito: acc.orders.filter((o) => digits(o.dispatchNote)).length,
          notasNodoEnPortal: acc.orders.filter((o) => orderOf([o.internalNumber, o.orderNumber])).length,
          notasNodoConFactura: acc.orders.filter((o) => orderOf([o.internalNumber, o.orderNumber]) && digits(o.invoiceNumber)).length,
          facturaCtaIgualNota: invoices.filter((m) => acc.orders.some((o) => digits(o.invoiceNumber) && digits(o.invoiceNumber) === digits(m.number))).length,
          formularios: [...new Set(acc.movements.map((m) => m.form))].slice(0, 10),
        };
        for (const n of acc.orders) {
          const nodo = orderOf([n.internalNumber, n.orderNumber]);
          if (!nodo) continue;
          const remito = digits(n.dispatchNote);
          const inv = invoices.find((m) => (remito && digits(m.remito) === remito) || (digits(n.invoiceNumber) && digits(m.number) === digits(n.invoiceNumber)));
          if (!inv && digits(n.invoiceNumber) && cands.filter((c) => c.link === "pedido→factura").length < 2) {
            linked.add(nodo.id);
            cands.push({ kind: "factura", link: "pedido→factura", label: `FACTURA A ${n.invoiceNumber}`, fetch: async () => toBuffer(await this.elit.getDocument(creds, { form: "FACTURA A", number: n.invoiceNumber })) });
          }
          if (inv) {
            linked.add(nodo.id);
            cands.push({ kind: "factura", link: "remito", label: `${inv.form} ${inv.number}`, fetch: async () => toBuffer(await this.elit.getDocument(creds, { form: inv.form, number: inv.number })) });
          }
          if (n.dispatchNotePdfUrl) {
            cands.push({ kind: "remito", link: "pedido→remito", label: `remito ${n.dispatchNote ?? ""}`, fetch: async () => toBuffer(await this.elit.getDocument(creds, { number: n.orderNumber, kind: "dispatch" })) });
          }
        }
        if (!cands.some((c) => c.kind === "factura")) {
          for (const m of invoices.slice(0, 2)) cands.push({ kind: "factura", link: null, label: `muestra ${m.form} ${m.number}`, fetch: async () => toBuffer(await this.elit.getDocument(creds, { form: m.form, number: m.number })) });
        }
        break;
      }
      case "INVID": {
        const [ord, st] = await Promise.all([this.invid.getOrders(creds), this.invid.getAccountStatement(creds)]);
        report.comprobantesPortal = st.movements.length;
        report.estructura = {
          pedidosConLinkFactura: ord.orders.filter((o) => o.invoiceHrefs?.length).length,
          tiposComprobante: [...new Set(st.movements.map((m) => m.docType))].slice(0, 10),
          movimientosConLink: st.movements.filter((m) => m.hrefs.length).length,
          celdasFactura: ord.orders.map((o) => o.invoice).filter(Boolean).slice(0, 6),
          filaFC: await this.invidRow(creds),
        };
        for (const o of ord.orders) {
          const nodo = orderOf([o.webOrderNumber, o.orderNumber]);
          const hrefs = (o.invoiceHrefs ?? []).filter((h) => h !== o.paymentHref && !/adjunt|pago|payment/i.test(h));
          if (!nodo || !hrefs.length) continue;
          linked.add(nodo.id);
          for (const href of hrefs.slice(0, 2)) cands.push({ kind: "factura", link: "pedido→factura", label: `pedido ${o.orderNumber}`, fetch: async () => toBuffer(await this.invid.getDocument(creds, href)) });
        }
        if (!cands.length) {
          for (const m of st.movements.filter((x) => /fact/i.test(x.docType) && x.hrefs.length).slice(0, 2)) {
            cands.push({ kind: "factura", link: null, label: `muestra ${m.docType} ${m.docNumber}`, fetch: async () => toBuffer(await this.invid.getDocument(creds, m.hrefs[0])) });
          }
        }
        break;
      }
      case "NEW_TREE": {
        const from = new Date(Date.now() - ORDER_DAYS * 86_400_000);
        const ymd = `${from.getFullYear()}${String(from.getMonth() + 1).padStart(2, "0")}${String(from.getDate()).padStart(2, "0")}`;
        const acc = await this.newTree.getAccount(tenantId, creds, { from: ymd });
        report.comprobantesPortal = acc.invoices.length;
        report.estructura = { conPdf: acc.invoices.filter((m) => m.documentToken).length, formularios: [...new Set(acc.invoices.map((m) => m.form))] };
        for (const m of acc.invoices.filter((x) => x.documentToken).slice(0, PER_PROVIDER_DOCS)) {
          cands.push({ kind: "factura", link: null, label: `muestra ${m.form} ${m.number}`, fetch: async () => toBuffer(await this.newTree.getDocument(creds, m.documentToken as string)) });
        }
        report.nota = "el portal no une la factura al pedido: se busca el número de pedido en el PDF";
        break;
      }
      case "AIR": {
        const acc = await this.air.getAccount(tenantId, creds);
        report.comprobantesPortal = acc.invoices.length;
        const headers = keysOf(acc.invoices[0]).filter((k) => k !== "_links");
        report.estructura = { pagina: await this.airPage(creds), avisos: acc.warnings, columnas: headers, conLink: acc.invoices.filter((r) => r._links?.length).length, ejemploLinks: (acc.invoices.find((r) => r._links?.length)?._links ?? []).map((l) => l.href.replace(/[?#].*$/, "")).slice(0, 3) };
        for (const r of acc.invoices.filter((x) => x._links?.length).slice(0, PER_PROVIDER_DOCS)) {
          const href = (r._links ?? [])[0].href;
          cands.push({ kind: "factura", link: null, label: `muestra ${headers.slice(0, 3).map((h) => String(r[h] ?? "")).join(" ")}`.slice(0, 80), fetch: async () => toBuffer(await this.air.getDocument(creds, href)) });
        }
        report.nota = "el portal no une la factura al pedido: se busca el número de pedido en el PDF";
        break;
      }
      case "POLYTECH": {
        const api = await PolytechClient.fromCredentials(creds);
        const hist = await api.rawRead("/orders/history");
        const histRec = (hist ?? {}) as Record<string, { id?: unknown }[]>;
        const portalIds = ["shippeds", "in_process", "pendings"].flatMap((k) => (Array.isArray(histRec[k]) ? histRec[k] : []).map((x) => String(x?.id ?? ""))).filter(Boolean);
        const nodoIds = [...orders.map((o) => o.invidOrderNumber).filter((x): x is string => !!x), ...portalIds].slice(0, 2);
        report.comprobantesPortal = portalIds.length;
        const details = await Promise.all(nodoIds.map((id) => api.rawRead("/orders/detail", { sales_order_id: id }).catch((e: Error) => ({ error: e.message }))));
        report.estructura = { historial: interestingPaths(hist), historialClaves: keysOf(hist), detalle: details.map((d) => interestingPaths(d)), detalleClaves: details.map(keysOf) };
        report.nota = "solo se miran los campos que publica la API (no hay PDF conocido)";
        break;
      }
      case "DISTECNA":
      case "GRUPO_NUCLEO":
        report.nota = "la API del distribuidor no publica facturas ni cuenta corriente";
        break;
      default:
        break;
    }

    report.pedidosUnidos = linked.size;
    const facturas = cands.filter((c) => c.kind === "factura").slice(0, PER_PROVIDER_DOCS);
    const remitos = cands.filter((c) => c.kind === "remito").slice(0, 2);
    for (const c of [...facturas, ...remitos]) {
      const res: DocResult = { kind: c.kind, link: c.link, label: c.label.slice(0, 80), pdf: false, qr: null, qrCount: 0, origen: null, campos: [], tipo: null, cuit: null, nombraPedidos: 0 };
      try {
        const buf = await this.withTimeout(c.fetch(), 60_000);
        const a = await analyzeInvoicePdf(buf);
        Object.assign(res, {
          pdf: a.isPdf,
          qr: a.qrFrom,
          qrCount: a.qrCount,
          origen: a.origen,
          campos: a.filled,
          tipo: a.fiscal.tipo,
          cuit: a.fiscal.cuit_emisor,
          nombraPedidos: mentionedNumbers(a.text, allNumbers).length,
          textLen: a.text.length,
          lineas: a.origen === "qr" ? undefined : fiscalLines(a.text),
          imagenes: a.qrFrom ? undefined : a.images.slice(0, 6),
          error: a.error ?? (a.isPdf ? undefined : `no es PDF (${buf.length} bytes, empieza «${buf.toString("utf8", 0, 30).replace(/\s+/g, " ")}»)`),
        });
      } catch (err) {
        res.error = (err instanceof Error ? err.message : String(err)).slice(0, 200);
      }
      report.docs.push(res);
    }
  }
}
