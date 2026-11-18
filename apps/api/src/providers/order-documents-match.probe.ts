import { Injectable, Logger } from "@nestjs/common";
import { Timeout } from "@nestjs/schedule";
import { CredentialsService } from "../credentials/credentials.service";
import { PrismaService } from "../prisma/prisma.service";
import { TgsAccessService } from "../tgs/tgs.access";
import { AirPortalClient, AIR_COMPROBANTES_URL } from "./air-portal-client";
import { parseHtmlTables, stripTags } from "./html-table";
import { NewBytesAccountService } from "./new-bytes-account.service";

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
    private readonly newBytes: NewBytesAccountService
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
        addLine(lines, it.sku, it.cantidad);
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
    const rows = html.match(/<tr\b[\s\S]*?<\/tr>/gi) ?? [];
    const dateOf = new Map<string, Date | null>();
    for (const r of rows) {
      const code = /nrocompro="([^"]+)"/i.exec(r)?.[1];
      if (code && /FV/i.test(code) && !dateOf.has(code)) dateOf.set(code, parseDay(stripTags(r)));
    }
    const out: InvoiceLines[] = [];
    for (const [code, date] of [...dateOf].slice(0, 120)) {
      const itemsHtml = await api.getText(`${AIR_COMPROBANTES_URL}?q=r&nrocompro=${encodeURIComponent(code)}`).catch(() => "");
      const lines: Lines = new Map();
      const tables = parseHtmlTables(itemsHtml);
      const t = tables.find((x) => x.rows.length > 0);
      if (t) {
        if (!report.columnas) report.columnas = { headers: t.headers, fila: t.rows[0] };
        const h = t.headers.map((x) => x.toLowerCase());
        const ci = h.findIndex((x) => /c[oó]d|art/.test(x));
        const qi = h.findIndex((x) => /cant/.test(x));
        for (const row of t.rows) {
          const cells = row;
          addLine(lines, cells[ci >= 0 ? ci : 0], cells[qi >= 0 ? qi : 2]);
        }
      }
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
