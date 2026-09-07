import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { NEW_TREE_SITE, NewTreeWebClient } from "./new-tree-web-client";
import {
  isInvoiceForm,
  parseAccountBalances,
  parseAccountMovements,
  parsePortalOrders,
} from "./new-tree-account.parser";
import { mapProviderDraft } from "./provider-draft";
import { documentFile } from "./document-file";
import { sniffContentType } from "./safe-url";

/** Meses hacia atrás que se piden por defecto (el portal filtra por rango de fechas). */
const DEFAULT_MONTHS_BACK = 24;
/** Token de wfmPrintMyDocument.aspx: base64/url-safe. Nada más entra a la query string. */
const DOCUMENT_TOKEN = /^[A-Za-z0-9+/=%_-]{8,600}$/;

function yyyymmdd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export interface NewTreeAccountRange {
  from?: string;
  to?: string;
}

function resolveRange(range: NewTreeAccountRange): { from: string; to: string } {
  const to = range.to && /^\d{8}$/.test(range.to) ? range.to : yyyymmdd(new Date());
  const fromDefault = new Date();
  fromDefault.setMonth(fromDefault.getMonth() - DEFAULT_MONTHS_BACK);
  const from = range.from && /^\d{8}$/.test(range.from) ? range.from : yyyymmdd(fromDefault);
  if (from > to) throw new BadRequestException("La fecha inicial no puede ser mayor a la final");
  return { from, to };
}

/**
 * Cuenta corriente, facturas y pedidos web de New Tree. Todo sale de páginas
 * HTML del portal con la sesión del cliente:
 * - /CUENTACORRIENTE/FECHAI=yyyymmdd/FECHAF=yyyymmdd/newtree.aspx
 * - /MISPEDIDOS/FECHAI=yyyymmdd/FECHAF=yyyymmdd/newtree.aspx
 * - wfmPrintMyDocument.aspx?<token> descarga el PDF del comprobante.
 */
@Injectable()
export class NewTreeAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(tenantId: string, credentials: Record<string, string>, range: NewTreeAccountRange = {}) {
    const { from, to } = resolveRange(range);
    const api = await NewTreeWebClient.login(credentials);
    const [ctaHtml, ordersHtml, drafts] = await Promise.all([
      api.getHtml(`/CUENTACORRIENTE/FECHAI=${from}/FECHAF=${to}/newtree.aspx`),
      api.getHtml(`/MISPEDIDOS/FECHAI=${from}/FECHAF=${to}/newtree.aspx`).catch(() => ""),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "NEW_TREE" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
    ]);
    const movements = parseAccountMovements(ctaHtml);
    const invoices = movements.filter((m) => isInvoiceForm(m.form));
    return {
      profile: {
        id: api.session.customerId,
        salesTermsId: api.session.salesTermsId || null,
        priceListId: api.session.priceListId || null,
      },
      range: { from, to },
      balance: parseAccountBalances(ctaHtml),
      movements,
      invoices,
      orders: ordersHtml ? parsePortalOrders(ordersHtml) : [],
      drafts: drafts.map(mapProviderDraft),
      note: "Cuenta corriente, comprobantes y pedidos web de newtree.com.ar. Los pedidos cargados por tu vendedor aparecen en la cuenta corriente cuando se facturan.",
    };
  }

  async getDocument(credentials: Record<string, string>, token: string, filename?: string) {
    const clean = (token || "").trim();
    if (!DOCUMENT_TOKEN.test(clean)) throw new BadRequestException("Token de comprobante inválido");
    const api = await NewTreeWebClient.login(credentials);
    const file = await api.getBuffer(`${NEW_TREE_SITE}/wfmPrintMyDocument.aspx?${clean}`);
    const type = sniffContentType(file.buffer, file.contentType);
    if (type === "text/html" || file.buffer.toString("utf8", 0, 200).toLowerCase().includes("<html")) {
      throw new BadGatewayException("New Tree no devolvió el PDF del comprobante (la sesión del portal lo rechazó)");
    }
    return documentFile(file.buffer, file.contentType, filename || "comprobante-newtree");
  }
}
