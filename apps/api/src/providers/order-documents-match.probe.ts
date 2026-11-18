import { Injectable, Logger } from "@nestjs/common";
import { Timeout } from "@nestjs/schedule";
import { CredentialsService } from "../credentials/credentials.service";
import { PrismaService } from "../prisma/prisma.service";
import { TgsAccessService } from "../tgs/tgs.access";
import { AirPortalClient, AIR_COMPROBANTES_URL } from "./air-portal-client";
import { stripTags } from "./html-table";
import { NewBytesAccountService } from "./new-bytes-account.service";
import { ElitAccountService } from "./elit-account.service";
import { analyzeInvoicePdf } from "../orders-api/invoice-analysis";
import { nodoNumbers } from "./order-tracking";

/**
 * PRUEBA EN MODO LECTURA: unir facturas de New Bytes y Air a los pedidos de NODO
 * por productos y cantidades (el portal no dice de qué pedido es cada factura).
 *
 * Regla (aprobada por el dueño 18/11): se une solo si la factura tiene
 * exactamente los mismos códigos y cantidades que un pedido de NODO hecho
 * hasta 30 días antes (o 1 día después) de la factura, y ese pedido es el único
 * que calza. Con dos candidatos no se une ninguno.
 *
 * Corre una vez, unos minutos después de arrancar, solo para el Sistema TGS.
 * Solo lee: no guarda nada. Deja en el registro `[facturas-union]` cuántas
 * facturas se unirían, cuántas quedan dudosas y ejemplos de códigos de cada lado
 * (para confirmar que los códigos son los mismos). `ORDER_DOCS_PROBE=off` la apaga.
 */

const TAG = "[facturas-union]";
const DAYS = 120;
const DAY = 86_400_000;

type Lines = Map<string, number>;

interface OrderLines {
  id: string;
  createdAt: Date;
  number: number | null;
  lines: Lines;
}

interface InvoiceLines {
  ref: string;
  date: Date | null;
  lines: Lines;
}

interface MatchReport {
  distribuidor: string;
  pedidosNodo: number;
  facturas: number;
  conRenglones: number;
  unidas: number;
  dudosas: number;
  sinPedido: number;
  /** Facturas cuyos códigos aparecen en algún pedido de NODO (aunque no calcen exacto). */
  codigoEnNodo: number;
  ejemplos: string[];
  parecidos?: string[];
  codigosNodo: string[];
  codigosPortal: string[];
  columnas?: unknown;
  error?: string;
}

const norm = (code: unknown) => String(code ?? "").trim().toUpperCase().replace(/^0+(?=\d)/, "");

function sameLines(a: Lines, b: Lines): boolean {
  if (a.size === 0 || a.size !== b.size) return false;
  for (const [k, v] of a) if (b.get(k) !== v) return false;
  return true;
}

function addLine(m: Lines, code: unknown, qty: unknown) {
  const c = norm(code);
  const q = Number(String(qty ?? "").replace(",", "."));
  if (!c || !Number.isFinite(q) || q <= 0) return;
  m.set(c, (m.get(c) ?? 0) + q);
}

/** dd-mm-aaaa, dd/mm/aaaa o aaaa-mm-dd. */
function parseDay(raw: unknown): Date | null {
  const s = String(raw ?? "");
  let m = /(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T12:00:00-03:00`);
  m = /(\d{1,2})[-/](\d{1,2})[-/](\d{4})/.exec(s);
  if (m) return new Date(`${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}T12:00:00-03:00`);
  return null;
}

/**
 * Renglones de un comprobante de Air (`q=r`), del texto de la página:
 * «54211 UPS HIKVISION DS 3000VA 1 0 311,471.04 311,471.04 SUC06».
 * Código, descripción, cantidad, cantidad pendiente, precio, total y sucursal.
 */
export function parseAirItems(text: string): { code: string; qty: number }[] {
  const t = text.replace(/\s+/g, " ");
  const out: { code: string; qty: number }[] = [];
  for (const m of t.matchAll(/(?:^|\s)(\d{2,7}) (.+?) (\d+) \d+ [\d.,]+ [\d.,]+ SUC\d+/g)) out.push({ code: m[1], qty: Number(m[3]) });
  return out;
}

function orderLinesOf(items: unknown): Lines {
  const m: Lines = new Map();
  for (const raw of Array.isArray(items) ? items : []) {
    const it = (raw ?? {}) as Record<string, unknown>;
    addLine(m, it.externalId ?? it.code, it.qty ?? it.quantity);
  }
  return m;
}

/** El pedido de NODO que calza (o por qué no). */
export function matchInvoice(inv: InvoiceLines, orders: OrderLines[]): { order: OrderLines | null; candidates: number } {
  const cands = orders.filter((o) => {
    if (!sameLines(inv.lines, o.lines)) return false;
    if (!inv.date) return true;
    const diff = inv.date.getTime() - o.createdAt.getTime();
    return diff >= -DAY && diff <= 30 * DAY;
  });
  return { order: cands.length === 1 ? cands[0] : null, candidates: cands.length };
}

@Injectable()
export class OrderDocumentsMatchProbe {
  private readonly log = new Logger(OrderDocumentsMatchProbe.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly credentials: CredentialsService,
    private readonly tgs: TgsAccessService,
    private readonly newBytes: NewBytesAccountService,
    private readonly elit: ElitAccountService
  ) {}

  @Timeout(6 * 60_000)
  async runOnce() {
    if ((process.env.ORDER_DOCS_PROBE ?? "").toLowerCase() === "off") return;
    const tenantId = await this.tgs.allowedTenantId().catch(() => null);
    if (!tenantId) return;
    for (const provider of ["NEW_BYTES", "AIR"] as const) {
      const report = await this.probe(tenantId, provider).catch((err: Error) => ({ distribuidor: provider, error: err.message.slice(0, 300) }));
      this.log.log(`${TAG} ${JSON.stringify(report)}`);
    }
    // Pedidos armados en esquema: cómo los factura el distribuidor contra lo que guardó NODO.
    for (const [name, fn] of [["AIR", () => this.airScheme(tenantId)], ["ELIT", () => this.elitScheme(tenantId)]] as const) {
      const out = await fn().catch((err: Error) => [`error: ${err.message.slice(0, 300)}`]);
      for (const line of out) this.log.log(`[facturas-esquema] ${name} ${line}`.slice(0, 6000));
    }
  }

  /** Renglones de NODO de un pedido: código, cantidad, neto unitario, % IVA, total. */
  private nodoLines(items: unknown): string {
    return (Array.isArray(items) ? items : [])
      .map((raw) => {
        const it = (raw ?? {}) as Record<string, unknown>;
        return `${it.externalId ?? it.code} x${it.qty ?? it.quantity} neto ${it.price ?? it.unitNet ?? it.net ?? "?"} iva% ${it.ivaPercent ?? it.vatPercent ?? "?"} iva ${it.vat ?? it.iva ?? "?"}`;
      })
      .join(" | ");
  }

  private async airScheme(tenantId: string): Promise<string[]> {
    const creds = await this.credentialsFor(tenantId, "AIR");
    if (!creds) return ["sin cuenta"];
    const api = await AirPortalClient.login(creds);
    const from = new Date(Date.now() - DAYS * DAY).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const orders = await this.prisma.providerOrder.findMany({ where: { tenantId, provider: "AIR", status: "CREATED", createdAt: { gte: new Date(Date.now() - DAYS * DAY) } }, select: { number: true, items: true, createdAt: true, subtotal: true, impuestos: true, total: true, addressSnapshot: true } });
    const out: string[] = [];
    for (const q of ["FV", "T"]) {
      const html = await api.getText(`${AIR_COMPROBANTES_URL}?q=${q}&qd=${from}&qh=${to}`);
      const codes = [...new Set([...html.matchAll(/nrocompro="([^"]+)"/gi)].map((m) => m[1]))].filter((c) => (q === "FV" ? /FV/i : /NV/i).test(c));
      let shown = 0;
      for (const code of codes) {
        if (shown >= 2) break;
        const text = stripTags(await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(code)}`).catch(() => "")).replace(/\s+/g, " ");
        if (!/\b42369\b/.test(text)) continue;
        shown++;
        const lines: Lines = new Map();
        for (const it of parseAirItems(text)) addLine(lines, it.code, it.qty);
        let best: { o: (typeof orders)[number]; common: number } | null = null;
        for (const o of orders) {
          const ol = orderLinesOf(o.items);
          const common = [...lines.keys()].filter((c) => ol.has(c)).length;
          if (common > 0 && (!best || common > best.common)) best = { o, common };
        }
        out.push(`${code} renglones: ${text.slice(0, 1500)}`);
        if (q === "FV") {
          const pdf = await api.getBuffer(`https://www.air-intra.com/2025/pdf/index.php?q=${encodeURIComponent(code)}`).catch(() => null);
          if (pdf) {
            const a = await analyzeInvoicePdf(pdf.buffer);
            const fiscal = a.text.split(/\n/).map((l) => l.trim()).filter((l) => /IVA|Neto|NETO|Subtotal|SUBTOTAL|Desc|Bonif|Total|TOTAL|10[,.]5|21[,.]0|Percep|Impuesto|Internos/i.test(l)).slice(0, 30);
            out.push(`${code} PDF importes: ${fiscal.join(" ‖ ")}`);
            out.push(`${code} PDF texto: ${a.text.replace(/\s+/g, " ").slice(0, 2500)}`);
          }
        }
        if (best) {
          const s = (best.o.addressSnapshot ?? {}) as Record<string, unknown>;
          out.push(`${code} pedido NODO-${best.o.number} (${best.o.createdAt.toISOString().slice(0, 10)}, ${best.common} en común) subtotal ${best.o.subtotal} impuestos ${best.o.impuestos} total ${best.o.total} iva21 ${s.iva21} iva105 ${s.iva105} ii ${s.ii}: ${this.nodoLines(best.o.items)}`);
        }
      }
    }
    return out;
  }

  private async elitScheme(tenantId: string): Promise<string[]> {
    const creds = await this.credentialsFor(tenantId, "ELIT");
    if (!creds) return ["sin cuenta"];
    const acc = await this.elit.getAccount(tenantId, creds);
    const orders = await this.prisma.providerOrder.findMany({ where: { tenantId, provider: "ELIT", status: "CREATED", createdAt: { gte: new Date(Date.now() - DAYS * DAY) } }, select: { number: true, items: true, invidOrderNumber: true, invidWebOrderNumber: true, subtotal: true, impuestos: true, total: true, addressSnapshot: true } });
    const out: string[] = [];
    // El listado puede venir sin renglones: se abre el detalle de las notas de pedidos de NODO.
    const notes = [...acc.orders];
    const linked = notes.filter((n) => orders.some((o) => [n.internalNumber, n.orderNumber].some((x) => x && nodoNumbers(o).has(String(x)))));
    out.push();
    for (let i = 0; i < Math.min(linked.length, 12); i++) {
      if (linked[i].items?.length) continue;
      const full = await this.elit.getSaleNote(tenantId, creds, linked[i].orderNumber).catch(() => null);
      if (full) Object.assign(linked[i], { items: full.items, summary: full.summary });
    }
    const kitNotes = notes.filter((n) => (n.items ?? []).some((i) => i.kit || /esquema|armad|actualiz/i.test(String(i.name ?? ""))));
    out.push(`notas con kit/esquema: ${kitNotes.length} de ${acc.orders.length}`);
    for (const n of kitNotes.slice(0, 3)) {
      const item = (i: (typeof kitNotes)[number]["items"] extends (infer T)[] | undefined ? T : never): string =>
        `${i.code ?? i.alfaCode}${i.kit ? " [KIT]" : ""} «${String(i.name ?? "").slice(0, 40)}» x${i.quantity} precio ${i.price} neto ${i.net} iva% ${i.vatPercent} iva ${i.vat} ii ${i.internalTax} total ${i.total}${i.children?.length ? ` hijos: {${i.children.map((c) => item(c)).join(" ; ")}}` : ""}`;
      out.push(`nota ${n.orderNumber} (factura ${n.invoiceNumber || "-"}) resumen ${JSON.stringify(n.summary ?? {})}: ${(n.items ?? []).map(item).join(" | ")}`);
      const nodo = orders.find((o) => [n.internalNumber, n.orderNumber].some((x) => x && nodoNumbers(o).has(String(x))));
      if (nodo) {
        const s = (nodo.addressSnapshot ?? {}) as Record<string, unknown>;
        out.push(`nota ${n.orderNumber} pedido NODO-${nodo.number} subtotal ${nodo.subtotal} impuestos ${nodo.impuestos} total ${nodo.total} vat ${s.vat}: ${this.nodoLines(nodo.items)}`);
      } else out.push(`nota ${n.orderNumber}: no es un pedido de NODO`);
    }
    return out;
  }

  private async probe(tenantId: string, provider: "NEW_BYTES" | "AIR"): Promise<MatchReport> {
    const since = new Date(Date.now() - DAYS * DAY);
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider, status: "CREATED", createdAt: { gte: since } },
      select: { id: true, number: true, createdAt: true, items: true },
    });
    const orders: OrderLines[] = rows.map((r) => {
      const lines: Lines = new Map();
      for (const raw of Array.isArray(r.items) ? r.items : []) {
        const it = (raw ?? {}) as Record<string, unknown>;
        addLine(lines, it.externalId ?? it.code ?? it.codigo ?? it.sku, it.qty ?? it.quantity ?? it.cantidad);
      }
      return { id: r.id, number: r.number, createdAt: r.createdAt, lines };
    });
    const report: MatchReport = {
      distribuidor: provider,
      pedidosNodo: orders.length,
      facturas: 0,
      conRenglones: 0,
      unidas: 0,
      dudosas: 0,
      sinPedido: 0,
      codigoEnNodo: 0,
      ejemplos: [],
      codigosNodo: [...new Set(orders.flatMap((o) => [...o.lines.keys()]))].slice(0, 8),
      codigosPortal: [],
    };
    const creds = await this.credentialsFor(tenantId, provider);
    if (!creds) return { ...report, error: "sin cuenta conectada" };
    const invoices = provider === "NEW_BYTES" ? await this.nbInvoices(creds, since, report) : await this.airInvoices(creds, since, report);
    report.facturas = invoices.length;
    const nodoCodes = new Set(orders.flatMap((o) => [...o.lines.keys()]));
    report.codigosPortal = [...new Set(invoices.flatMap((i) => [...i.lines.keys()]))].slice(0, 8);
    for (const inv of invoices) {
      if (inv.lines.size === 0) continue;
      report.conRenglones++;
      if ([...inv.lines.keys()].some((c) => nodoCodes.has(c))) report.codigoEnNodo++;
      const m = matchInvoice(inv, orders);
      if (m.order) report.unidas++;
      else if (m.candidates > 1) report.dudosas++;
      else report.sinPedido++;
      if (report.ejemplos.length < 6 && (m.order || m.candidates > 1)) {
        report.ejemplos.push(`${inv.ref} ${inv.date?.toISOString().slice(0, 10) ?? "?"} → ${m.order ? `NODO-${m.order.number ?? "?"} (${m.order.createdAt.toISOString().slice(0, 10)})` : `${m.candidates} candidatos`}`);
      }
      // Diagnóstico: el pedido que más se parece y en qué difiere (solo cantidades, sin nombres).
      if (!m.order && (report.parecidos?.length ?? 0) < 25) {
        let best: { o: OrderLines; common: number } | null = null;
        for (const o of orders) {
          const common = [...inv.lines.keys()].filter((c) => o.lines.has(c)).length;
          if (common > 0 && (!best || common > best.common)) best = { o, common };
        }
        if (best) {
          const sameQty = [...inv.lines].filter(([c, q]) => best!.o.lines.get(c) === q).length;
          const days = inv.date ? Math.round((inv.date.getTime() - best.o.createdAt.getTime()) / DAY) : null;
          const extraInv = [...inv.lines.keys()].filter((c) => !best!.o.lines.has(c)).slice(0, 4);
          const extraOrd = [...best.o.lines.keys()].filter((c) => !inv.lines.has(c)).slice(0, 4);
          (report.parecidos ??= []).push(`fac ${inv.lines.size} / ped ${best.o.lines.size} / comunes ${best.common} / igual cant ${sameQty} / días ${days} / solo fac [${extraInv}] / solo ped [${extraOrd}]`);
        }
      }
    }
    return report;
  }

  /** New Bytes: cada comprobante del listado → sus datos oficiales en lio.red (renglones con sku y cantidad). */
  private async nbInvoices(creds: Record<string, string>, since: Date, report: MatchReport): Promise<InvoiceLines[]> {
    const st = await this.newBytes.getAccountStatement(creds);
    const out: InvoiceLines[] = [];
    for (const v of st.movements) {
      if (!v.voucherUrl || !/factura/i.test(String(v.invoiceLabel ?? v.invoiceType ?? ""))) continue;
      const listed = parseDay(v.invoiceDate);
      if (listed && listed < since) continue;
      const data = await this.nbVoucherData(String(v.voucherUrl)).catch(() => null);
      const lines: Lines = new Map();
      const d = (data ?? {}) as Record<string, unknown>;
      for (const raw of Array.isArray(d.detalle) ? d.detalle : []) {
        const it = (raw ?? {}) as Record<string, unknown>;
        // `id` es el código interno de New Bytes (el mismo que usa NODO); `sku` es el part number.
        addLine(lines, it.id ?? it.sku, it.cantidad);
      }
      if (!report.columnas && Array.isArray(d.detalle) && d.detalle[0]) report.columnas = { detalle0: Object.fromEntries(Object.entries(d.detalle[0] as Record<string, unknown>).filter(([k]) => ["sku", "cantidad", "kitId", "id"].includes(k))) };
      const cab = (d.cabecera ?? {}) as Record<string, unknown>;
      out.push({ ref: `${cab.letraComprobante ?? ""} ${cab.numeroPuntoVenta ?? ""}-${cab.numeroComprobante ?? v.invoiceNumber ?? ""}`.trim(), date: parseDay(cab.fechaComprobante) ?? listed, lines });
    }
    return out;
  }

  private async nbVoucherData(voucherUrl: string): Promise<unknown> {
    const u = new URL(voucherUrl);
    if (u.protocol !== "https:" || !/(^|\.)comprobantes\.lio\.red$/i.test(u.hostname)) return null;
    const [, kind, id, token] = u.pathname.split("/").filter(Boolean);
    if (!kind || !id || !token) return null;
    const res = await fetch(`https://ms-comprobantes.lio.red/v2/${encodeURIComponent(kind)}/${encodeURIComponent(id)}/${encodeURIComponent(token)}`, { headers: { Accept: "application/json" }, redirect: "manual" });
    if (!res.ok) return null;
    const j = (await res.json()) as Record<string, unknown>;
    return j.data ?? j;
  }

  /** Air: facturas de venta (FV) del período y los renglones de cada una (`q=r`). */
  private async airInvoices(creds: Record<string, string>, since: Date, report: MatchReport): Promise<InvoiceLines[]> {
    const api = await AirPortalClient.login(creds);
    const from = since.toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    const html = await api.getText(`${AIR_COMPROBANTES_URL}?q=FV&qd=${from}&qh=${to}`);
    // El listado no es una tabla: cada comprobante es un bloque con `nrocompro="…"` y su fecha cerca.
    const dateOf = new Map<string, Date | null>();
    for (const m of html.matchAll(/nrocompro="([^"]+)"/gi)) {
      const code = m[1];
      if (!/FV/i.test(code) || dateOf.has(code)) continue;
      const near = stripTags(html.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 600));
      dateOf.set(code, parseDay(near));
    }
    const out: InvoiceLines[] = [];
    for (const [code, date] of [...dateOf].slice(0, 120)) {
      const itemsHtml = await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(code)}`).catch(() => "");
      const lines: Lines = new Map();
      for (const it of parseAirItems(stripTags(itemsHtml))) addLine(lines, it.code, it.qty);
      if (!report.columnas) report.columnas = { texto: stripTags(itemsHtml).replace(/\s+/g, " ").slice(0, 200), renglones: [...lines] };
      out.push({ ref: code, date, lines });
    }
    return out;
  }

  private async credentialsFor(tenantId: string, provider: string): Promise<Record<string, string> | null> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { mirrorsCommercialFromId: true } });
    const stored = await this.credentials.findByProvider(tenant?.mirrorsCommercialFromId ?? tenantId, provider as never);
    return stored ? (JSON.parse(stored.credentialsJson) as Record<string, string>) : null;
  }
}
