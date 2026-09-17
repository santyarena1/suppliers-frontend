import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { mapProviderDraft, orderOwner, pendingCheckoutResponse, runBackgroundDraft, type OrderAuthor } from "./provider-draft";
import { asNumber, asRecord, snapshotJson } from "./json-value";
import {
  DistecnaClient,
  distecnaTaxPoints,
  hasDistecnaOrderAccess,
  normalizeDistecnaCurrency,
  parseDistecnaCredentials,
  productTypeFromRaw,
  type DistecnaAddress,
  type DistecnaDetail,
  type DistecnaPaymentTerm,
} from "./distecna-client";

export interface DistecnaCartItems {
  items: { code: string; qty: number; name?: string; type?: string }[];
  paymentTermId?: string;
  deliveryAddressId?: string;
  notes?: string;
  background?: boolean;
}

type CatalogQuote = {
  name: string;
  price: number | null;
  currency: string | null;
  stock: number | null;
  ivaPercent: number | null;
  type: string | undefined;
  iiPercent: number | null;
};

export interface DistecnaPreviewItem {
  code: string;
  type: string | null;
  qty: number;
  name: string;
  price: number | null;
  currency: string;
  stock: number | null;
  ivaPercent: number | null;
  iiPercent: number | null;
  subtotal: number | null;
  vat: number;
  internals: number;
  priceChanged: boolean;
  stockChanged: boolean;
  error: string | null;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function money(n: number | null | undefined): number {
  return n == null || !Number.isFinite(n) ? 0 : round4(n);
}

function taxAmount(net: number, points: number | null | undefined): number {
  if (points == null || !Number.isFinite(points) || points <= 0) return 0;
  return round4(net * (points / 100));
}

/**
 * Checkout de Distecna Camino B: no hay carrito remoto. Se cotiza en Nodo con
 * el catálogo local, se refresca precio/stock just-in-time y se manda POST /v2/Order.
 */
@Injectable()
export class DistecnaOrderService {
  private readonly logger = new Logger(DistecnaOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "DISTECNA" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, tenantId, provider: "DISTECNA" },
    });
    return row ? mapProviderDraft(row) : null;
  }

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const drafts = await this.listDrafts(tenantId);
    const creds = parseDistecnaCredentials(credentials);
    if (!hasDistecnaOrderAccess(creds)) {
      return {
        paymentTerm: null as DistecnaPaymentTerm | null,
        addresses: [] as DistecnaAddress[],
        drafts,
        note: "La API de Distecna no publica historial ni cuenta corriente. Cargá usuario y contraseña de pedidos (Camino B) para condición de pago, direcciones y para confirmar órdenes. Acá están solo los pedidos creados desde Nodo.",
      };
    }
    const api = DistecnaClient.fromCredentials(credentials);
    const [paymentTerm, addresses] = await Promise.all([
      api.paymentTerm().catch(() => null),
      api.deliveryAddresses().catch(() => [] as DistecnaAddress[]),
    ]);
    return {
      paymentTerm,
      addresses,
      drafts,
      note: "Distecna no publica historial de pedidos ni cuenta corriente. Acá ves la condición de pago, las direcciones de entrega y los pedidos creados desde Nodo.",
    };
  }

  private async catalogRows(tenantId: string, codes: string[]) {
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider: "DISTECNA", externalId: { in: codes } },
      select: {
        externalId: true,
        price: true,
        currency: true,
        stock: true,
        ivaPercent: true,
        product: { select: { name: true, raw: true } },
      },
    });
    const map = new Map<string, CatalogQuote>();
    for (const o of offers) {
      const rec = asRecord(o.product.raw);
      const ii = distecnaTaxPoints(asNumber(rec?.ii));
      map.set(o.externalId, {
        name: o.product.name,
        price: o.price != null ? Number(o.price) : null,
        currency: o.currency,
        stock: o.stock != null ? Number(o.stock) : null,
        ivaPercent: o.ivaPercent != null ? Number(o.ivaPercent) : null,
        type: productTypeFromRaw(rec),
        iiPercent: ii ?? null,
      });
    }
    return map;
  }

  private quoteItem(
    req: DistecnaCartItems["items"][number],
    known: CatalogQuote | undefined,
    live: DistecnaDetail | null,
    type: string | undefined,
    error: string | null
  ): DistecnaPreviewItem {
    const livePrice = live ? asNumber(live.price) ?? null : null;
    const liveStock = live ? asNumber(live.stock) ?? null : null;
    const liveIva = live ? distecnaTaxPoints(asNumber(live.iva)) ?? null : null;
    const liveIi = live ? distecnaTaxPoints(asNumber(live.ii)) ?? null : null;
    const price = livePrice ?? known?.price ?? null;
    const stock = liveStock ?? known?.stock ?? null;
    const ivaPercent = liveIva ?? known?.ivaPercent ?? null;
    const iiPercent = liveIi ?? known?.iiPercent ?? null;
    const net = price != null ? round4(price * req.qty) : null;
    const vat = taxAmount(net ?? 0, ivaPercent);
    const internals = taxAmount(net ?? 0, iiPercent);
    const priceChanged = livePrice != null && known?.price != null && Math.abs(livePrice - known.price) > 0.005;
    const stockChanged = liveStock != null && known?.stock != null && liveStock !== known.stock;
    let itemError = error;
    if (!itemError && stock != null && stock < req.qty) {
      itemError = `stock insuficiente: pedido ${req.qty}, disponible ${stock}`;
    }
    if (!itemError && !type) {
      itemError = "Falta el type del producto (necesario para armar el pedido)";
    }
    return {
      code: req.code,
      type: type ?? null,
      qty: req.qty,
      name: live?.name?.trim() || req.name || known?.name || req.code,
      price,
      currency: normalizeDistecnaCurrency(live?.currency) || known?.currency || "USD",
      stock,
      ivaPercent,
      iiPercent,
      subtotal: net,
      vat,
      internals,
      priceChanged,
      stockChanged,
      error: itemError,
    };
  }

  async preview(tenantId: string, credentials: Record<string, string>, input: DistecnaCartItems) {
    if (input.items.length === 0) throw new BadRequestException("No hay productos de Distecna en el pedido");
    const creds = parseDistecnaCredentials(credentials);
    if (!hasDistecnaOrderAccess(creds)) {
      throw new BadRequestException(
        "Para pedir en Distecna cargá usuario y contraseña de la API (Camino B). La API Key solo alcanza para el catálogo."
      );
    }
    const api = DistecnaClient.fromCredentials(credentials);
    const catalog = await this.catalogRows(tenantId, input.items.map((it) => it.code));
    const [paymentTerm, addresses] = await Promise.all([
      api.paymentTerm(),
      api.deliveryAddresses(),
    ]);

    const items: DistecnaPreviewItem[] = [];
    for (const req of input.items) {
      const known = catalog.get(req.code);
      let type = cleanType(req.type) || known?.type;
      let live: DistecnaDetail | null = null;
      let error: string | null = null;
      try {
        if (!type) type = await api.findProductType(req.code);
        if (type) live = await api.getDetail(req.code, type);
        else error = "Distecna no devolvió el type de este código";
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      items.push(this.quoteItem(req, known, live, type, error));
    }

    const paymentTermId = input.paymentTermId || paymentTerm?.id || null;
    const deliveryAddressId = input.deliveryAddressId || addresses[0]?.id || null;
    const subtotal = round4(items.reduce((s, it) => s + money(it.subtotal), 0));
    const vat = round4(items.reduce((s, it) => s + it.vat, 0));
    const internals = round4(items.reduce((s, it) => s + it.internals, 0));
    const rejected = items.filter((it) => it.error);
    const hasChanges = items.some((it) => it.priceChanged || it.stockChanged);

    return {
      items,
      paymentTerm,
      addresses,
      paymentTermId,
      deliveryAddressId,
      subtotal,
      vat,
      internals,
      perceptions: 0,
      perceptionLines: [] as { label: string; amount: number }[],
      total: round4(subtotal + vat + internals),
      currency: items.find((it) => it.currency)?.currency || "USD",
      stockOk: rejected.length === 0,
      hasChanges,
      note: "Al confirmar, Distecna crea el pedido real (POST /v2/Order). No se puede deshacer desde Nodo. Precio y stock se refrescan just-in-time antes de enviar.",
    };
  }

  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: DistecnaCartItems) {
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "DISTECNA",
          status: "PENDING",
          paymentOption: input.paymentTermId ?? "",
          deliveryOption: input.deliveryAddressId ?? "",
          notes: input.notes ?? null,
          items: input.items,
          addressSnapshot: {
            paymentTermId: input.paymentTermId ?? null,
            deliveryAddressId: input.deliveryAddressId ?? null,
          },
        },
      });
      runBackgroundDraft(
        this.logger,
        "Distecna draft background",
        pending.id,
        () => this.fulfillDraft(author, credentials, input, pending.id),
        (message) => this.prisma.providerOrder.update({
          where: { id: pending.id },
          data: { status: "FAILED", errorMessage: message },
        })
      );
      return pendingCheckoutResponse(
        pending.id,
        input.items,
        "El pedido se está creando en Distecna. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(author, credentials, input);
  }

  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: DistecnaCartItems, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: DistecnaCartItems,
    existingId?: string
  ) {
    const preview = await this.preview(author.tenantId, credentials, input);
    const blocked = preview.items.filter((it) => it.error);
    if (blocked.length > 0) {
      const detail = blocked.map((it) => `${it.code}: ${it.error}`).join(" · ");
      await this.saveFailed(author, existingId, input, `Distecna rechazó ítems (${detail})`, preview);
      throw new BadGatewayException(`Distecna rechazó ítems del carrito: ${detail}`);
    }
    const products = preview.items.map((it) => ({
      productCode: it.code,
      productType: it.type as string,
      quantity: it.qty,
    }));
    const api = DistecnaClient.fromCredentials(credentials);
    let result;
    try {
      result = await api.createOrder({
        products,
        ...(preview.paymentTermId ? { paymentTermId: preview.paymentTermId } : {}),
        ...(preview.deliveryAddressId ? { deliveryAddressId: preview.deliveryAddressId } : {}),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.saveFailed(author, existingId, input, message, preview);
      throw err instanceof BadGatewayException ? err : new BadGatewayException(message);
    }
    if (!result.success || !result.salesOrderId) {
      const message = result.message || "Distecna no aceptó el pedido";
      await this.saveFailed(author, existingId, input, message, preview);
      throw new BadGatewayException(message);
    }

    const paymentLabel = preview.paymentTerm?.name || "Condición de la cuenta";
    const deliveryLabel =
      preview.addresses.find((a) => a.id === preview.deliveryAddressId)?.name ||
      (preview.deliveryAddressId ? "Dirección informada" : "Sin dirección asignada");
    const saved = {
      status: "CREATED",
      invidOrderNumber: result.salesOrderId,
      invidWebOrderNumber: result.salesOrderId,
      paymentOption: preview.paymentTermId ?? "",
      paymentLabel,
      deliveryOption: preview.deliveryAddressId ?? "",
      deliveryLabel,
      notes: input.notes ?? null,
      subtotal: preview.subtotal,
      impuestos: round4(preview.vat + preview.internals),
      percepciones: 0,
      total: preview.total,
      errorMessage: null,
      items: snapshotJson(preview.items),
      addressSnapshot: snapshotJson({
        paymentTermId: preview.paymentTermId,
        deliveryAddressId: preview.deliveryAddressId,
        paymentTerm: preview.paymentTerm,
        address: preview.addresses.find((a) => a.id === preview.deliveryAddressId) ?? null,
      }),
    };
    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: saved })
      : await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "DISTECNA", ...saved } });
    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: preview.items,
      total: record.total,
      message: `Pedido ${result.salesOrderId} creado en Distecna.`,
    };
  }

  private async saveFailed(
    author: OrderAuthor,
    existingId: string | undefined,
    input: DistecnaCartItems,
    message: string,
    preview?: { subtotal: number; vat: number; internals: number; total: number; items: unknown }
  ) {
    const failed = {
      status: "FAILED",
      paymentOption: input.paymentTermId ?? "",
      deliveryOption: input.deliveryAddressId ?? "",
      notes: input.notes ?? null,
      subtotal: preview?.subtotal ?? null,
      impuestos: preview ? round4(preview.vat + preview.internals) : null,
      total: preview?.total ?? null,
      errorMessage: message.slice(0, 500),
      items: snapshotJson(preview?.items ?? input.items),
      addressSnapshot: snapshotJson({
        paymentTermId: input.paymentTermId ?? null,
        deliveryAddressId: input.deliveryAddressId ?? null,
      }),
    };
    if (existingId) {
      await this.prisma.providerOrder.update({ where: { id: existingId }, data: failed });
    } else {
      await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "DISTECNA", ...failed } });
    }
  }
}

function cleanType(raw: string | undefined): string | undefined {
  const s = (raw ?? "").trim();
  return s || undefined;
}
