import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ElitWebClient } from "./elit-web-client";
import {
  applyCatalogVatPercents,
  mapElitSaleNote,
  parseElitCtaRsc,
  parseElitPaymentOptions,
  parseElitPaymentsPayload,
  parseElitPedidosRsc,
  parseElitSaleNotesPayload,
  type ElitRscOrder,
  type ElitRscOrderItem,
} from "./elit-rsc.parser";
import { mapProviderDraft } from "./provider-draft";
import { documentFile } from "./document-file";
import { assertHttpsHost, sniffContentType } from "./safe-url";
import { asRecord } from "./json-value";

const ELIT_CDN_HOSTS = ["cdn.elit.com.ar"];

export interface ElitPaymentOperationInput {
  type?: string;
  bank?: number;
  bankName?: string;
  operationName?: string;
  date?: string;
  amount?: number;
  number?: string;
}

@Injectable()
export class ElitAccountService {
  constructor(private readonly prisma: PrismaService) {}

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const api = await ElitWebClient.login(credentials);
    const [pedidosRsc, cta, drafts, saleNotesApi, paymentsApi] = await Promise.all([
      api.getRsc("/mi-cuenta/pedidos").catch(() => ""),
      api.getRsc("/mi-cuenta/cuenta-corriente").catch(() => ""),
      this.prisma.providerOrder.findMany({
        where: { tenantId, provider: "ELIT" },
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      api.proxyGet("/account/salenotes?limit=50&sortBy=number:desc").catch(() => null),
      api.proxyGet("/account/payments").catch(() => null),
    ]);
    const fromRsc = pedidosRsc ? parseElitPedidosRsc(pedidosRsc) : [];
    const fromApi = saleNotesApi ? parseElitSaleNotesPayload(saleNotesApi) : [];
    const orders = mergeSaleNotes(fromApi, fromRsc);
    await this.fillVatFromCatalog(tenantId, orders);
    const statement = cta ? parseElitCtaRsc(cta) : {
      balance: null,
      balanceUsd: null,
      summary: {
        status: "",
        approved: false,
        creditLimit: null,
        currentAccount: null,
        checks: null,
        pendingOrders: null,
        availableCredit: null,
      },
      usdVouchers: [],
      movements: [],
    };
    const payments = paymentsApi ? parseElitPaymentsPayload(paymentsApi) : { canCreateReport: false, active: null, payments: [] };
    return {
      profile: {
        id: api.session.customerId,
        name: api.session.name,
        exchange: api.session.currentExchange,
      },
      balance: statement.balance,
      balanceUsd: statement.balanceUsd,
      summary: statement.summary,
      usdVouchers: statement.usdVouchers,
      orders,
      movements: statement.movements,
      payments: payments.payments,
      canCreateReport: payments.canCreateReport,
      drafts: drafts.map(mapProviderDraft),
      note: "Pedidos, comprobantes e informes de pago de elit.com.ar. Adjuntar abre banco, tipo, fecha, importe y un archivo.",
    };
  }

  async getSaleNote(tenantId: string, credentials: Record<string, string>, number: string) {
    const api = await ElitWebClient.login(credentials);
    const body = await api.proxyGet(`/account/salenotes/${encodeURIComponent(number)}`);
    const rec = asRecord(body);
    const data = asRecord(rec?.data) ?? rec ?? {};
    const note = mapElitSaleNote(data);
    if (!note.orderNumber) throw new NotFoundException("Nota de venta no encontrada");
    await this.fillVatFromCatalog(tenantId, [note]);
    return note;
  }

  async getDocument(
    credentials: Record<string, string>,
    query: { form?: string; number: string; kind?: string }
  ) {
    const form = (query.form || "").trim();
    const number = query.number.trim();
    const kind = (query.kind || "").trim();
    if (!number) throw new BadRequestException("Falta number");

    const api = await ElitWebClient.login(credentials);
    if (kind === "salenote" || kind === "dispatch" || /nota de venta/i.test(form)) {
      const note = await this.lookupSaleNote(api, number);
      const url = kind === "dispatch" ? note.dispatchNotePdfUrl : note.pdfUrl;
      if (url) {
        assertHttpsHost(url, "https://cdn.elit.com.ar/", ELIT_CDN_HOSTS);
        const file = await api.fetchPublicBuffer(url);
        const filename = kind === "dispatch" ? `remito-${number}` : `nota-venta-${number}`;
        return documentFile(file.buffer, file.contentType, filename);
      }
      if (kind === "dispatch") {
        throw new NotFoundException("Esta nota de venta no tiene remito en PDF");
      }
    }

    if (!form) throw new BadRequestException("Falta form (tipo de comprobante)");
    const path = `/account/myFile?type=${encodeURIComponent(form)}&number=${encodeURIComponent(number)}`;
    const file = await api.proxyGetBuffer(path);
    if (sniffContentType(file.buffer, file.contentType) === "application/octet-stream"
      && file.buffer.toString("utf8", 0, 20).includes("{")) {
      throw new BadGatewayException("Elit no devolvió un PDF para ese comprobante");
    }
    return documentFile(file.buffer, file.contentType, `${form}-${number}`);
  }

  async getPayments(credentials: Record<string, string>) {
    const api = await ElitWebClient.login(credentials);
    return parseElitPaymentsPayload(await api.proxyGet("/account/payments"));
  }

  async getPaymentOptions(credentials: Record<string, string>) {
    const api = await ElitWebClient.login(credentials);
    return parseElitPaymentOptions(await api.proxyGet("/account/payments/options"));
  }

  async createPaymentOperation(credentials: Record<string, string>, input: ElitPaymentOperationInput) {
    const api = await ElitWebClient.login(credentials);
    const body: Record<string, unknown> = {};
    if (input.type != null) body.type = input.type;
    if (input.bank != null) body.bank = input.bank;
    if (input.bankName != null) body.bankName = input.bankName;
    if (input.operationName != null) body.operationName = input.operationName;
    if (input.date != null) body.date = input.date;
    if (input.amount != null) body.amount = input.amount;
    if (input.number != null) body.number = input.number;
    if (Object.keys(body).length === 0) {
      throw new BadRequestException("Mandá al menos un campo de la operación (banco, tipo, fecha, importe)");
    }
    return api.proxyPostJson("/account/payments/operation", body);
  }

  async attachPaymentOperation(
    credentials: Record<string, string>,
    operationId: string,
    file: { filename: string; mimetype: string; buffer: Buffer }
  ) {
    if (!operationId.trim()) throw new BadRequestException("Falta el id de la operación");
    const api = await ElitWebClient.login(credentials);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "application/octet-stream" }), file.filename);
    return api.proxyPostForm(`/account/payments/operation/attach/${encodeURIComponent(operationId)}`, form);
  }

  async finishPayment(credentials: Record<string, string>) {
    const api = await ElitWebClient.login(credentials);
    return api.proxyPostJson("/account/payments/finish", {});
  }

  private async fillVatFromCatalog(tenantId: string, orders: ElitRscOrder[]) {
    const codes = new Set<string>();
    const collect = (items: ElitRscOrderItem[] | undefined) => {
      for (const it of items ?? []) {
        if (it.code) codes.add(it.code);
        if (it.alfaCode) codes.add(it.alfaCode);
        if (it.productCode) codes.add(it.productCode);
        if (it.children) collect(it.children);
      }
    };
    for (const o of orders) collect(o.items);
    if (codes.size === 0) return;
    const list = [...codes];
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: {
        tenantId,
        provider: "ELIT",
        ivaPercent: { not: null },
        OR: [
          { externalId: { in: list } },
          { product: { is: { provider: "ELIT", sku: { in: list } } } },
          { product: { is: { provider: "ELIT", partNumber: { in: list } } } },
        ],
      },
      select: {
        externalId: true,
        ivaPercent: true,
        product: { select: { sku: true, partNumber: true } },
      },
    });
    if (offers.length === 0) return;
    const rates: Record<string, number> = {};
    for (const o of offers) {
      const pct = o.ivaPercent != null ? Number(o.ivaPercent) : NaN;
      if (!Number.isFinite(pct)) continue;
      rates[o.externalId] = pct;
      if (o.product.sku) rates[o.product.sku] = pct;
      if (o.product.partNumber) {
        rates[o.product.partNumber] = pct;
        rates[o.product.partNumber.toUpperCase()] = pct;
      }
    }
    for (const o of orders) applyCatalogVatPercents(o.items, rates);
  }

  private async lookupSaleNote(api: ElitWebClient, number: string): Promise<ElitRscOrder> {
    try {
      const body = await api.proxyGet(`/account/salenotes/${encodeURIComponent(number)}`);
      const rec = asRecord(body);
      const data = asRecord(rec?.data) ?? rec ?? {};
      const note = mapElitSaleNote(data);
      if (note.orderNumber) return note;
    } catch {
      /* list fallback */
    }
    const list = parseElitSaleNotesPayload(
      await api.proxyGet("/account/salenotes?limit=50&sortBy=number:desc")
    );
    const found = list.find((o) => o.orderNumber === number);
    if (!found) throw new NotFoundException("Nota de venta no encontrada");
    return found;
  }
}

function mergeSaleNotes(primary: ElitRscOrder[], fallback: ElitRscOrder[]): ElitRscOrder[] {
  if (primary.length === 0) return fallback;
  const extra = fallback.filter((o) => !primary.some((p) => p.orderNumber === o.orderNumber));
  return [...primary, ...extra];
}
