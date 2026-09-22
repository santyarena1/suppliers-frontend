import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { mapProviderDraft, orderOwner, pendingCheckoutResponse, runBackgroundDraft, type OrderAuthor } from "./provider-draft";
import { asNumber, snapshotJson } from "./json-value";
import {
  PolytechClient,
  hasPolytechAccess,
  mapPolytechProduct,
  parsePolytechCredentials,
  polytechOrderableQty,
  type PolytechAddress,
  type PolytechCourier,
  type PolytechPerception,
} from "./polytech-client";

export interface PolytechCartItems {
  items: { code: string; qty: number; name?: string }[];
  shippingService?: "delivery" | "pickup";
  addressId?: string;
  courierId?: string;
  paymentMethod?: "mercadopago";
  notes?: string;
  background?: boolean;
}

export interface PolytechPreviewItem {
  code: string;
  qty: number;
  name: string;
  price: number | null;
  finalPrice: number | null;
  currency: string;
  stock: number | null;
  ivaPercent: number | null;
  subtotal: number | null;
  vat: number;
  priceChanged: boolean;
  stockChanged: boolean;
  error: string | null;
}

type CatalogQuote = {
  name: string;
  price: number | null;
  finalPrice: number | null;
  currency: string | null;
  stock: number | null;
  ivaPercent: number | null;
};

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function money(n: number | null | undefined): number {
  return n == null || !Number.isFinite(n) ? 0 : round4(n);
}

@Injectable()
export class PolytechOrderService {
  private readonly logger = new Logger(PolytechOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "POLYTECH" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, tenantId, provider: "POLYTECH" },
    });
    return row ? mapProviderDraft(row) : null;
  }

  async getAccount(tenantId: string, credentials: Record<string, string>) {
    const drafts = await this.listDrafts(tenantId);
    const creds = parsePolytechCredentials(credentials);
    if (!hasPolytechAccess(creds)) {
      return {
        profile: null,
        addresses: [] as PolytechAddress[],
        couriers: [] as PolytechCourier[],
        perceptions: [] as PolytechPerception[],
        orders: [],
        drafts,
        exchangeRate: null as number | null,
        note: "Cargá usuario y contraseña del portal de Polytech para ver cuenta, direcciones y pedidos.",
      };
    }
    const api = await PolytechClient.fromCredentials(credentials);
    const [account, orders] = await Promise.all([
      api.account(),
      api.orderHistory().catch(() => []),
    ]);
    return {
      profile: {
        legalName: account.legalName,
        userName: account.userName,
        email: account.email,
        phone: account.phone,
        showsVat: account.showsVat,
      },
      addresses: account.addresses,
      couriers: account.couriers,
      perceptions: account.perceptions,
      exchangeRate: account.exchangeRate,
      orders,
      drafts,
      note: "Precios en USD. El envío no se cotiza en la API: lo define el transporte que elijas. Los pedidos del portal aparecen aparte de los creados desde Nodo.",
    };
  }

  async getOrderDetail(credentials: Record<string, string>, input: { stateId?: string; salesOrderId?: string }) {
    const api = await PolytechClient.fromCredentials(credentials);
    const items = await api.orderDetail(input);
    return { items };
  }

  async preview(tenantId: string, credentials: Record<string, string>, input: PolytechCartItems) {
    const api = await PolytechClient.fromCredentials(credentials);
    const account = await api.account();
    const catalog = await this.catalogRows(tenantId, input.items.map((it) => it.code));
    const shippingService: "delivery" | "pickup" = input.shippingService === "pickup" ? "pickup" : "delivery";
    const addressId = input.addressId || account.addresses[0]?.id || null;
    const courierId = input.courierId || account.couriers[0]?.id || null;

    const items: PolytechPreviewItem[] = [];
    for (const req of input.items) {
      const known = catalog.get(req.code);
      let live: ReturnType<typeof mapPolytechProduct> = null;
      let error: string | null = null;
      try {
        const raw = await api.findBySourceId(req.code, req.name);
        live = raw ? mapPolytechProduct(raw) : null;
        if (!live && !known) error = "Polytech no encontró este producto";
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      items.push(this.quoteItem(req, known, live, error));
    }

    const subtotal = round4(items.reduce((s, it) => s + money(it.subtotal), 0));
    const vat = round4(items.reduce((s, it) => s + it.vat, 0));
    const perceptionLines = account.perceptions.map((p) => ({
      label: p.description,
      amount: round4(subtotal * (p.percent / 100)),
    }));
    const perceptions = round4(perceptionLines.reduce((s, line) => s + line.amount, 0));
    const rejected = items.filter((it) => it.error);

    return {
      items,
      addresses: account.addresses,
      couriers: account.couriers,
      perceptions: account.perceptions,
      shippingService,
      addressId: shippingService === "delivery" ? addressId : null,
      courierId: shippingService === "delivery" ? courierId : null,
      paymentMethod: input.paymentMethod ?? null,
      subtotal,
      vat,
      perceptionsAmount: perceptions,
      perceptionLines,
      total: round4(subtotal + vat + perceptions),
      currency: "USD",
      exchangeRate: account.exchangeRate,
      stockOk: rejected.length === 0,
      hasChanges: items.some((it) => it.priceChanged || it.stockChanged),
      note: "Al confirmar, Polytech crea el pedido real (POST /orders/create). No se puede deshacer desde Nodo. El precio es neto en USD y se refresca antes de enviar.",
    };
  }

  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: PolytechCartItems) {
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "POLYTECH",
          status: "PENDING",
          paymentOption: input.paymentMethod ?? "cuenta",
          deliveryOption: input.shippingService ?? "delivery",
          notes: input.notes ?? null,
          items: input.items,
          addressSnapshot: snapshotJson({
            addressId: input.addressId ?? null,
            courierId: input.courierId ?? null,
            shippingService: input.shippingService ?? "delivery",
          }),
        },
      });
      runBackgroundDraft(
        this.logger,
        "Polytech draft background",
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
        "El pedido se está creando en Polytech. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(author, credentials, input);
  }

  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: PolytechCartItems, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: PolytechCartItems,
    existingId?: string
  ) {
    const preview = await this.preview(author.tenantId, credentials, input);
    const blocked = preview.items.filter((it) => it.error);
    if (blocked.length > 0) {
      const detail = blocked.map((it) => `${it.code}: ${it.error}`).join(" · ");
      await this.saveFailed(author, existingId, input, `Polytech rechazó ítems (${detail})`, preview);
      throw new BadGatewayException(`Polytech rechazó ítems del carrito: ${detail}`);
    }
    if (preview.shippingService === "delivery" && (!preview.addressId || !preview.courierId)) {
      const message = "Elegí una dirección y un transporte para el envío.";
      await this.saveFailed(author, existingId, input, message, preview);
      throw new BadRequestException(message);
    }
    const api = await PolytechClient.fromCredentials(credentials);
    let created;
    try {
      created = await api.createOrder({
        items: preview.items.map((it) => ({ sourceId: it.code, quantity: it.qty })),
        shippingService: preview.shippingService,
        addressId: preview.addressId ?? undefined,
        courierId: preview.courierId ?? undefined,
        notes: input.notes,
        paymentMethod: input.paymentMethod,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.saveFailed(author, existingId, input, message, preview);
      throw err instanceof BadGatewayException || err instanceof BadRequestException
        ? err
        : new BadGatewayException(message);
    }

    const address = preview.addresses.find((a) => a.id === preview.addressId);
    const courier = preview.couriers.find((c) => c.id === preview.courierId);
    const deliveryLabel = preview.shippingService === "pickup"
      ? "Retiro"
      : [address?.address, courier?.name].filter(Boolean).join(" · ") || "Envío";
    const saved = {
      status: "CREATED",
      invidOrderNumber: created.orderId,
      invidWebOrderNumber: created.orderId,
      paymentOption: input.paymentMethod ?? "cuenta",
      paymentLabel: input.paymentMethod === "mercadopago" ? "Mercado Pago" : "Cuenta corriente",
      deliveryOption: preview.shippingService,
      deliveryLabel,
      notes: input.notes ?? null,
      subtotal: preview.subtotal,
      impuestos: preview.vat,
      percepciones: preview.perceptionsAmount,
      total: preview.total,
      errorMessage: null,
      items: snapshotJson(preview.items),
      addressSnapshot: snapshotJson({
        address,
        courier,
        shippingService: preview.shippingService,
        mercadopagoUrl: created.mercadopagoUrl,
        exchangeRate: preview.exchangeRate,
      }),
    };
    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: saved })
      : await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "POLYTECH", ...saved } });
    const mp = created.mercadopagoUrl ? ` Link de pago: ${created.mercadopagoUrl}` : "";
    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: preview.items,
      total: record.total,
      mercadopagoUrl: created.mercadopagoUrl,
      message: `Pedido ${created.orderId} creado en Polytech.${mp}`,
    };
  }

  private quoteItem(
    req: { code: string; qty: number; name?: string },
    known: CatalogQuote | undefined,
    live: ReturnType<typeof mapPolytechProduct>,
    fetchError: string | null
  ): PolytechPreviewItem {
    const net = live?.price ?? known?.price ?? null;
    const gross = live?.finalPrice ?? known?.finalPrice ?? null;
    const iva = live?.ivaPercent ?? known?.ivaPercent ?? null;
    const stock = live?.stock ?? known?.stock ?? null;
    const restocking = asNumber(asRecordOffer(live)?.restocking_quantity) ?? 0;
    const orderable = polytechOrderableQty(stock, restocking);
    const name = live?.name || known?.name || req.name || req.code;
    const currency = live?.currency || known?.currency || "USD";
    let error = fetchError;
    if (!error && (net == null || net <= 0)) error = "Polytech no informó precio";
    if (!error && req.qty > orderable) {
      error = orderable > 0 ? `Stock insuficiente (hay ${orderable})` : "Sin stock";
    }
    const subtotal = net != null && !error ? round4(net * req.qty) : null;
    const vat = subtotal != null && iva != null && iva > 0 ? round4(subtotal * (iva / 100)) : 0;
    const priceChanged = known?.price != null && net != null && Math.abs(known.price - net) > 0.0005;
    const stockChanged = known?.stock != null && stock != null && known.stock !== stock;
    return {
      code: req.code,
      qty: req.qty,
      name,
      price: net,
      finalPrice: gross,
      currency,
      stock,
      ivaPercent: iva,
      subtotal,
      vat,
      priceChanged,
      stockChanged,
      error,
    };
  }

  private async catalogRows(tenantId: string, codes: string[]) {
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider: "POLYTECH", externalId: { in: codes } },
      select: {
        externalId: true,
        price: true,
        finalPrice: true,
        currency: true,
        stock: true,
        ivaPercent: true,
      },
    });
    const fichas = await this.prisma.providerSyncCache.findMany({
      where: { provider: "POLYTECH", externalId: { in: codes } },
      select: { externalId: true, name: true },
    });
    const names = new Map(fichas.map((f) => [f.externalId, f.name]));
    const map = new Map<string, CatalogQuote>();
    for (const row of offers) {
      map.set(row.externalId, {
        name: names.get(row.externalId) ?? row.externalId,
        price: row.price != null ? Number(row.price) : null,
        finalPrice: row.finalPrice != null ? Number(row.finalPrice) : null,
        currency: row.currency,
        stock: row.stock,
        ivaPercent: row.ivaPercent != null ? Number(row.ivaPercent) : null,
      });
    }
    return map;
  }

  private async saveFailed(
    author: OrderAuthor,
    existingId: string | undefined,
    input: PolytechCartItems,
    message: string,
    preview?: { subtotal: number; vat: number; perceptionsAmount: number; total: number; items: unknown }
  ) {
    const failed = {
      status: "FAILED",
      paymentOption: input.paymentMethod ?? "cuenta",
      deliveryOption: input.shippingService ?? "delivery",
      notes: input.notes ?? null,
      subtotal: preview?.subtotal ?? null,
      impuestos: preview?.vat ?? null,
      percepciones: preview?.perceptionsAmount ?? null,
      total: preview?.total ?? null,
      errorMessage: message.slice(0, 500),
      items: snapshotJson(preview?.items ?? input.items),
      addressSnapshot: snapshotJson({
        addressId: input.addressId ?? null,
        courierId: input.courierId ?? null,
      }),
    };
    if (existingId) {
      await this.prisma.providerOrder.update({ where: { id: existingId }, data: failed });
    } else {
      await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "POLYTECH", ...failed } });
    }
  }
}

function asRecordOffer(live: ReturnType<typeof mapPolytechProduct>): { restocking_quantity?: unknown } | null {
  if (!live) return null;
  const raw = live.raw;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const offers = (raw as { offers?: unknown }).offers;
  const offer = Array.isArray(offers) ? offers[0] : null;
  return offer && typeof offer === "object" ? (offer as { restocking_quantity?: unknown }) : null;
}
