import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AIR_COMPROBANTES_URL,
  AIR_CPT_PENDIENTES_URL,
  AIR_DEBEHABER_URL,
  AirPortalClient,
} from "./air-portal-client";
import { parseHtmlTables, pickBalance, stripTags, tableRowsDetailed, type HtmlLink } from "./html-table";
import { Logger } from "@nestjs/common";
import { mapProviderDraft } from "./provider-draft";
import { documentFile } from "./document-file";
import { assertHttpsHost } from "./safe-url";

export type AirAccountRow = {
  [key: string]: string | HtmlLink[] | undefined;
  _links?: HtmlLink[];
};

function flattenTables(html: string): AirAccountRow[] {
  return parseHtmlTables(html).flatMap((t) =>
    tableRowsDetailed(t).map((row) => {
      const rec: AirAccountRow = { ...row.values };
      if (row.links.length > 0) rec._links = row.links;
      return rec;
    })
  );
}

const AIR_HOSTS = ["www.air-intra.com", "air-intra.com"];
/**
 * Diagnóstico de una página de Air que vino sin tablas: de dónde trae los datos
 * (URLs .php, llamadas ajax, formularios) y qué atributos usa. Sin importes:
 * los dígitos sueltos se tapan.
 */
export function airPageShape(html: string): string {
  const uniq = (xs: string[]) => [...new Set(xs)].slice(0, 25);
  const urls = uniq([...html.matchAll(/["'`]([^"'`\s<>]*\.php(?:\?[^"'`\s<>]*)?)["'`]/gi)].map((m) => m[1]));
  const calls = uniq([...html.matchAll(/(\$\.(?:ajax|post|get|getJSON)|\.load|fetch|XMLHttpRequest)\s*\(\s*([^)]{0,160})/g)].map((m) => `${m[1]}(${m[2].replace(/\s+/g, " ")})`));
  const forms = uniq([...html.matchAll(/<form\b[^>]*>/gi)].map((m) => m[0]));
  const inputs = uniq([...html.matchAll(/<(?:input|select)\b[^>]*\bname=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]));
  const attrs = uniq([...html.matchAll(/\s([a-z][\w-]{2,30})=["'][^"']*["']/gi)].map((m) => m[1].toLowerCase()).filter((a) => !["class", "style", "href", "src", "type", "name", "value", "id", "rel", "content", "charset", "lang", "width", "height", "alt", "title"].includes(a)));
  const ids = uniq([...html.matchAll(/\bid=["']([^"']+)["']/gi)].map((m) => m[1]));
  const tags = uniq([...html.matchAll(/<([a-z][a-z0-9]*)\b/gi)].map((m) => m[1].toLowerCase()));
  const mask = (s: string) => s.replace(/\d{3,}/g, "#");
  // Segunda vuelta: clases de los bloques, opciones de los filtros y el texto con
  // cada dígito tapado por 9 (se ve el formato de fechas e importes, no los valores).
  const classes = uniq([...html.matchAll(/\bclass=["']([^"']+)["']/gi)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean)).slice(0, 40);
  const options = uniq([...html.matchAll(/<option\b[^>]*value=["']([^"']*)["'][^>]*>([\s\S]*?)<\/option>/gi)].map((m) => `${m[1]}=${stripTags(m[2])}`));
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ");
  const text = stripTags(body).replace(/\d/g, "9").slice(0, 1500);
  const blocks = uniq([...body.matchAll(/<(div|span|label|section)\b[^>]*class=["']([^"']+)["'][^>]*>([^<]{1,60})</gi)].map((m) => `${m[1]}.${m[2]}:${m[3].trim().replace(/\d/g, "9")}`)).slice(0, 25);
  return mask(JSON.stringify({ urls, calls, forms, inputs, attrs, ids, tags, classes, options })) + ` · bloques ${JSON.stringify(blocks)} · texto «${text}»`;
}

export const AIR_PDF_URL ="https://www.air-intra.com/2025/pdf/index.php";

/**
 * Facturas del listado «FV» de Air (el mismo que usa NODO para guardar las
 * facturas): cada una con su PDF. La tabla vieja de comprobantes no trae links.
 */
export function airInvoiceRows(html: string): AirAccountRow[] {
  const rows: AirAccountRow[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(/nrocompro="([^"]+)"/gi)) {
    const code = m[1];
    if (!/^[\w-]{6,40}$/.test(code) || !/FV/i.test(code) || seen.has(code)) continue;
    seen.add(code);
    const near = stripTags(html.slice(Math.max(0, (m.index ?? 0) - 400), (m.index ?? 0) + 600));
    const date = /\b(\d{1,2}\/\d{1,2}\/\d{4})\b/.exec(near)?.[1] ?? /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(near)?.slice(1).reverse().join("/") ?? "";
    rows.push({
      Fecha: date,
      Comprobante: code,
      _links: [{ href: `${AIR_PDF_URL}?q=${encodeURIComponent(code)}`, label: "PDF" }],
    });
  }
  return rows;
}

@Injectable()
export class AirAccountService {
  private readonly log = new Logger(AirAccountService.name);
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const api = await AirPortalClient.login(credentials);
    const to = new Date();
    const from = new Date(to.getTime() - 365 * 86_400_000);
    const [debehaber, comprobantes, facturas, pendientes, drafts] = await Promise.all([
      this.fetchSection(api, "Debe/Haber", AIR_DEBEHABER_URL),
      this.fetchSection(api, "Comprobantes", `${AIR_COMPROBANTES_URL}?t=250213`),
      api
        .getText(`${AIR_COMPROBANTES_URL}?q=FV&qd=${from.toISOString().slice(0, 10)}&qh=${to.toISOString().slice(0, 10)}`)
        .then(airInvoiceRows)
        .catch(() => [] as AirAccountRow[]),
      this.fetchSection(api, "Pendientes", `${AIR_CPT_PENDIENTES_URL}?t=250213`),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "AIR" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const balance = pickBalance(debehaber.html) ?? pickBalance(comprobantes.html);
    // Solo la forma de lo leído (sin importes): para ver en los logs si el portal cambió.
    this.log.log(
      `Cuenta Air: debe/haber ${debehaber.rows.length} filas [${Object.keys(debehaber.rows[0] ?? {}).filter((k) => k !== "_links").join("|")}], ` +
        `comprobantes ${comprobantes.rows.length}, facturas FV ${facturas.length}, pendientes ${pendientes.rows.length}, saldo ${balance == null ? "no encontrado" : "leído"}`
    );
    return {
      balance,
      movements: debehaber.rows,
      // Las facturas FV traen su PDF; si el listado no respondió, queda la tabla de siempre.
      invoices: facturas.length > 0 ? facturas : comprobantes.rows,
      pending: pendientes.rows,
      drafts: drafts.map(mapProviderDraft),
      // Antes, cualquier fallo del portal se convertía en "" y la pantalla decía
      // "sin movimientos": no había forma de distinguir una cuenta sin actividad
      // de un scraping roto. Ahora el motivo viaja hasta la pantalla.
      warnings: [debehaber, comprobantes, pendientes].flatMap((s) => (s.warning ? [s.warning] : [])),
      note: "Datos del portal www.air-intra.com (debe/haber y comprobantes para ver o descargar). Air no admite adjuntar pagos desde Nodo.",
    };
  }

  /**
   * Una sección del portal, con el motivo cuando no sale nada.
   *
   * Tres desenlaces distintos que antes se veían iguales: la página falló, la
   * página vino pero sin ninguna tabla (el portal cambió y el parser quedó
   * viejo), o la tabla vino vacía porque no hay actividad.
   */
  private async fetchSection(
    api: AirPortalClient,
    label: string,
    url: string
  ): Promise<{ html: string; rows: AirAccountRow[]; warning?: string }> {
    let html: string;
    try {
      html = await api.getText(url);
    } catch (err) {
      const detalle = err instanceof Error ? err.message : String(err);
      return { html: "", rows: [], warning: `${label}: el portal de Air no respondió (${detalle.slice(0, 160)})` };
    }
    const tables = parseHtmlTables(html);
    const rows = flattenTables(html);
    if (rows.length > 0) return { html, rows };
    if (tables.length === 0) {
      this.log.log(`Cuenta Air, forma de «${label}»: ${airPageShape(html)}`);
      return {
        html,
        rows: [],
        warning: `${label}: Air respondió ${html.length} caracteres sin ninguna tabla. Puede haber cambiado la página o caducado la sesión.`,
      };
    }
    return { html, rows: [] };
  }

  async getDocument(credentials: Record<string, string>, href: string) {
    if (!href?.trim()) throw new BadRequestException("Falta href");
    const url = assertHttpsHost(href, "https://www.air-intra.com/2025/consultas/", AIR_HOSTS);
    const api = await AirPortalClient.login(credentials);
    const file = await api.getBuffer(url.toString());
    const filename = url.pathname.split("/").pop() || "comprobante-air";
    return documentFile(file.buffer, file.contentType, filename);
  }
}
