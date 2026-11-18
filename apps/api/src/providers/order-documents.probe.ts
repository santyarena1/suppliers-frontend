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
import { parseHtmlTables, stripTags } from "./html-table";

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
  qrCuit?: string | null;
  qrKeys?: string | null;
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
function qrField(url: string | undefined, key: string): string | null {
  try {
    if (!url) return null;
    const p = new URL(url).searchParams.get("p") ?? "";
    const j = JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Record<string, unknown>;
    if (key === "*") return Object.keys(j).join(",");
    return j[key] == null ? null : `${typeof j[key]}:${String(j[key])}`;
  } catch {
    return null;
  }
}

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

  /** La página pública del comprobante de New Bytes (lio.red): scripts y rutas que suenan a PDF o API. */
  private async nbVoucherPage(url: unknown): Promise<Record<string, unknown>> {
    try {
      if (typeof url !== "string" || !url) return { error: "sin url" };
      const page = new URL(url);
      const res = await fetch(page, { redirect: "manual" });
      const html = await res.text();
      const srcs = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/gi)].map((m) => m[1]).slice(0, 15);
      const inline = [...html.matchAll(/["'`](\/?[\w./-]*(?:api|pdf|download|voucher|comprobante)[\w./?=&-]*)["'`]/gi)].map((m) => m[1]).slice(0, 20);
      const hits = new Set<string>();
      for (const src of srcs.filter((x) => /\.js(\?|$)/.test(x)).slice(0, 6)) {
        const js = await fetch(new URL(src, page)).then((r) => r.text()).catch(() => "");
        for (const m of js.slice(0, 3_000_000).matchAll(/["'`]([^"'`\s]{0,80}(?:\/api\/|pdf|download|\/voucher)[^"'`\s]{0,80})["'`]/gi)) {
          hits.add(m[1]);
          if (hits.size >= 30) break;
        }
      }
      return { status: res.status, path: page.pathname.replace(/[0-9a-f]{16,}/gi, "…"), srcs, inline, enJs: [...hits] };
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
    }
  }

  /** Fragmentos de código alrededor de ciertas palabras (para ver cómo un visor pide el PDF). */
  private snippets(js: string, needles: string[], max = 3): string[] {
    const out: string[] = [];
    for (const n of needles) {
      let from = 0;
      for (let k = 0; k < max; k++) {
        const i = js.indexOf(n, from);
        if (i < 0) break;
        out.push(`${n}: ${js.slice(Math.max(0, i - 260), i + 260).replace(/\s+/g, " ")}`);
        from = i + n.length;
      }
    }
    return out;
  }

  private async nbViewerCode(url: unknown): Promise<string[]> {
    try {
      if (typeof url !== "string" || !url) return ["sin url"];
      const page = new URL(url);
      const html = await fetch(page).then((r) => r.text());
      const srcs = [...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 12);
      const out: string[] = [];
      for (const src of srcs) {
        const js = await fetch(new URL(src, page)).then((r) => r.text()).catch(() => "");
        out.push(...this.snippets(js, ["srcPDF=", "Comprobantes-pdf", "baseURL", "lio.red"], 2).map((s) => `${src}: ${s}`));
        if (out.length > 14) break;
      }
      return out.slice(0, 14);
    } catch (err) {
      return [`error: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`];
    }
  }

  /** Cómo pide los datos el visor de New Bytes (createPDF) y qué responde la API de lio.red (solo claves). */
  private nbNumbers: string[] = [];
  private nbMentions(body: string): string {
    return mentionedNumbers(body, this.nbNumbers).length + "/" + this.nbNumbers.length;
  }

  private async nbViewerData(url: unknown): Promise<Record<string, unknown>> {
    try {
      if (typeof url !== "string" || !url) return { error: "sin url" };
      const page = new URL(url);
      const parts = page.pathname.split("/").filter(Boolean); // voucher, F, id, token
      const [, kind, id, token] = parts;
      const html = await fetch(page).then((r) => r.text());
      const srcs = [...new Set([...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]))].slice(0, 12);
      const code: string[] = [];
      for (const src of srcs) {
        const js = await fetch(new URL(src, page)).then((r) => r.text()).catch(() => "");
        code.push(...this.snippets(js, ["createPDF:function", "$axios.$get", "$axios.get", "$get(\""], 2));
        if (code.length > 8) break;
      }
      const api = "https://ms-comprobantes.lio.red/v2";
      const guesses = [`${api}/${kind}/${id}/${token}`, `${api}/voucher/${kind}/${id}/${token}`, `${api}/vouchers/${kind}/${id}/${token}`, `${api}/voucher/${id}/${token}`, `${api}/comprobantes/${kind}/${id}/${token}`];
      const tries: string[] = [];
      for (const g of guesses) {
        const r = await fetch(g, { headers: { Accept: "application/json" } }).catch(() => null);
        if (!r) {
          tries.push(`${g.replace(token, "…")} → error`);
          continue;
        }
        const body = await r.text();
        let keys = "";
        try {
          const j = JSON.parse(body) as Record<string, unknown>;
          const d = (j.data ?? j) as Record<string, unknown>;
          const sub = (o: unknown) => (o && typeof o === "object" ? (Array.isArray(o) ? `[${o.length}] ${Object.keys((o[0] ?? {}) as object).join(",")}` : Object.entries(o as Record<string, unknown>).map(([k, v]) => `${k}:${v == null ? "null" : typeof v === "object" ? "{…}" : typeof v === "string" && v.length > 40 ? `str(${v.slice(0, 40)}…)` : `${typeof v}`}`).join(",")) : String(o));
          const cab = (d.cabecera ?? {}) as Record<string, unknown>;
          keys = `pie: ${sub(d.pie)} || totales: ${sub(d.totales)} || detalle: ${sub(d.detalle)} || cliente: ${Object.keys((d.cliente ?? {}) as object).join(",")} || kits: ${sub(d.kits)} || qr: ${String(((d.recursos ?? {}) as Record<string, unknown>).qr ?? "").slice(0, 70)} || cab: ${["letraComprobante", "codigoComprobante", "tipoComprobante", "numeroComprobante", "numeroPuntoVenta", "fechaComprobante", "cuitEmpresa", "tipoCmp"].map((k) => `${k}=${String(cab[k] ?? "")}`).join(" ")} || nombraPedidos: ${this.nbMentions(body)}`;
        } catch {
          keys = body.slice(0, 80).replace(/\s+/g, " ");
        }
        tries.push(`${g.replace(token, "…")} → ${r.status} ${r.headers.get("content-type") ?? ""} ${keys}`.slice(0, 2500));
        if (r.ok) break;
      }
      return { code: code.slice(0, 8), tries };
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
    }
  }

  private async airViewerCode(creds: Record<string, string>): Promise<string[]> {
    try {
      const api = await AirPortalClient.login(creds);
      const js = await api.getText(new URL("comprobantes.js", `${AIR_COMPROBANTES_URL}`).toString());
      return [`chars ${js.length}`, ...this.snippets(js, ["comprobantes.php?q=", "pdf/index.php?q=", "pdf_lite/index.php?q=", "#tipos", "desde"], 3)].slice(0, 16);
    } catch (err) {
      return [`error: ${(err instanceof Error ? err.message : String(err)).slice(0, 200)}`];
    }
  }

  /** Scripts de la página de comprobantes de Air y las rutas .php que llaman. */
  private async airScripts(creds: Record<string, string>): Promise<Record<string, unknown>> {
    try {
      const api = await AirPortalClient.login(creds);
      const base = `${AIR_COMPROBANTES_URL}?t=250213`;
      const html = await api.getText(base);
      const srcs = [...html.matchAll(/<script\b[^>]*src="([^"]+)"/gi)].map((m) => m[1]).slice(0, 12);
      const inlineJs = [...html.matchAll(/<script\b(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]).join("\n");
      const php = new Set<string>();
      const collect = (js: string) => {
        for (const m of js.matchAll(/["'`]([^"'`\s]{0,100}\.php[^"'`\s]{0,100})["'`]/gi)) php.add(m[1]);
      };
      collect(inlineJs);
      for (const src of srcs.slice(0, 8)) {
        const u = new URL(src, base);
        if (!/air-intra\.com$/i.test(u.hostname)) continue;
        collect(await api.getText(u.toString()).catch(() => ""));
      }
      const opciones = [...html.matchAll(/<option\b[^>]*value="([^"]*)"[^>]*>([^<]*)</gi)].map((m) => `${m[1]}=${m[2].trim()}`).slice(0, 12);
      return { srcs, php: [...php].slice(0, 30), opciones, inlineChars: inlineJs.length };
    } catch (err) {
      return { error: (err instanceof Error ? err.message : String(err)).slice(0, 200) };
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
          visor: await this.nbViewerCode(vouchers[0]?.voucherUrl),
          visorDatos: await ((this.nbNumbers = [...ord.orders, ...pur.orders].flatMap((o) => [o.orderNumber, o.webOrderNumber, o.albNumber]).filter((x): x is string => !!x)), this.nbViewerData(vouchers[0]?.voucherUrl)),
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
          internosQueSonPedidos: st.movements.filter((m) => orderOf([m.internalNumber, m.docNumber])).length,
          ejemploNumerosNodo: [...allNumbers].slice(0, 4),
          ejemploInternos: st.movements.map((m) => m.internalNumber).slice(0, 4),
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
        const api = await AirPortalClient.login(creds);
        const from = new Date(Date.now() - ORDER_DAYS * 86_400_000).toISOString().slice(0, 10);
        const to = new Date().toISOString().slice(0, 10);
        const list = async (q: string) => api.getText(`${AIR_COMPROBANTES_URL}?q=${q}&qd=${from}&qh=${to}`);
        const [fvHtml, resumenHtml] = await Promise.all([list("FV"), list("T").catch(() => "")]);
        const codes = (html: string) => [...new Set([...html.matchAll(/nrocompro="([^"]+)"/gi)].map((m) => m[1]))];
        const fv = codes(fvHtml).filter((c) => /FV/i.test(c));
        const tables = parseHtmlTables(fvHtml);
        const resumenTables = parseHtmlTables(resumenHtml);
        const nodoAir = orders.map((o) => o.invidOrderNumber).filter(Boolean).slice(0, 4);
        let items = "";
        if (fv[0]) items = await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(fv[0])}`).catch((e: Error) => `error ${e.message}`);
        report.comprobantesPortal = fv.length;
        report.estructura = {
          fvChars: fvHtml.length,
          fvCodigos: fv.slice(0, 4),
          fvColumnas: tables.map((t) => t.headers).slice(0, 2),
          fvFila: tables[0]?.rows?.[0] ?? null,
          resumenColumnas: resumenTables.map((t) => t.headers).slice(0, 2),
          resumenCodigos: codes(resumenHtml).slice(0, 8),
          nodoNumeros: nodoAir,
          nodoEnResumen: orders.filter((o) => o.invidOrderNumber && resumenHtml.includes(o.invidOrderNumber)).length,
          nodoEnFacturas: orders.filter((o) => o.invidOrderNumber && fvHtml.includes(o.invidOrderNumber)).length,
          itemsTexto: stripTags(items).replace(/\s+/g, " ").slice(0, 700),
          itemsCodigos: codes(items).slice(0, 8),
          resumenTexto: stripTags(resumenHtml).replace(/\s+/g, " ").slice(0, 900),
          nvItems: await Promise.all(codes(resumenHtml).filter((c) => /NV/i.test(c)).slice(0, 2).map(async (c) => { const t = stripTags(await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(c)}`).catch(() => "")).replace(/\s+/g, " "); return `${c}: ${t.slice(0, 500)} | nodo:${orders.filter((o) => o.invidOrderNumber && t.includes(o.invidOrderNumber)).length}`; })),
        };
        for (const code of fv.slice(0, PER_PROVIDER_DOCS)) {
          cands.push({ kind: "factura", link: null, label: `muestra ${code}`, fetch: async () => (await api.getBuffer(`https://www.air-intra.com/2025/pdf/index.php?q=${encodeURIComponent(code)}`)).buffer });
        }
        const rv = codes(resumenHtml).filter((c) => /RV/i.test(c));
        for (const code of rv.slice(0, 1)) {
          cands.push({ kind: "remito", link: null, label: `muestra ${code}`, fetch: async () => (await api.getBuffer(`https://www.air-intra.com/2025/pdf/index.php?q=${encodeURIComponent(code)}`)).buffer });
        }
        report.nota = "se prueba la consulta FV/RV del portal y su visor de PDF";
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
          qrCuit: qrField(a.qrUrls[0], "cuit"),
          qrKeys: qrField(a.qrUrls[0], "*"),
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
