import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AIR_COMPROBANTES_URL,
  AIR_CPT_PENDIENTES_URL,
  AIR_DEBEHABER_URL,
  AirPortalClient,
} from "./air-portal-client";
import { parseHtmlTables, pickBalance, tableRowsDetailed, type HtmlLink } from "./html-table";
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

@Injectable()
export class AirAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const api = await AirPortalClient.login(credentials);
    const [debehaber, comprobantes, pendientes, drafts] = await Promise.all([
      this.fetchSection(api, "Debe/Haber", AIR_DEBEHABER_URL),
      this.fetchSection(api, "Comprobantes", `${AIR_COMPROBANTES_URL}?t=250213`),
      this.fetchSection(api, "Pendientes", `${AIR_CPT_PENDIENTES_URL}?t=250213`),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "AIR" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    return {
      balance: pickBalance(debehaber.html) ?? pickBalance(comprobantes.html),
      movements: debehaber.rows,
      invoices: comprobantes.rows,
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
