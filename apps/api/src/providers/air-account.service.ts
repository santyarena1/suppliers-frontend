import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AIR_COMPROBANTES_URL,
  AIR_CPT_PENDIENTES_URL,
  AIR_DEBEHABER_URL,
  AirPortalClient,
} from "./air-portal-client";
import { parseHtmlTables, pickBalance, tableRowsAsObjects } from "./html-table";

function flattenTables(html: string): Record<string, string>[] {
  return parseHtmlTables(html).flatMap((t) => tableRowsAsObjects(t));
}

/**
 * Lectura de la cuenta de Air (debe/haber y comprobantes del portal 2025).
 * Solo GET. La API JSON v2 no se usa (rate limit 1 req/5 min).
 */
@Injectable()
export class AirAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(userId: string, credentials: Record<string, string>) {
    const api = await AirPortalClient.login(credentials);
    const [debehaber, comprobantes, pendientes, drafts] = await Promise.all([
      api.getText(AIR_DEBEHABER_URL).catch(() => ""),
      api.getText(`${AIR_COMPROBANTES_URL}?t=250213`).catch(() => ""),
      api.getText(`${AIR_CPT_PENDIENTES_URL}?t=250213`).catch(() => ""),
      this.prisma.providerOrder.findMany({
        where: { userId, provider: "AIR" },
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
      drafts,
      note: "Datos del portal www.air-intra.com (consultas/debehaber y comprobantes). Solo lectura.",
    };
  }
}
