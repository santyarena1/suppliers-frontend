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
      api.getText(AIR_DEBEHABER_URL).catch(() => ""),
      api.getText(`${AIR_COMPROBANTES_URL}?t=250213`).catch(() => ""),
      api.getText(`${AIR_CPT_PENDIENTES_URL}?t=250213`).catch(() => ""),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "AIR" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);

    const movements = flattenTables(debehaber);
    const invoices = flattenTables(comprobantes);
    const pending = flattenTables(pendientes);
    return {
      balance: pickBalance(debehaber) ?? pickBalance(comprobantes),
      movements,
      invoices,
      pending,
      drafts: drafts.map(mapProviderDraft),
      note: "Datos del portal www.air-intra.com (consultas/debehaber y comprobantes).",
    };
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
