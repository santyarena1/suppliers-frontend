import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { mapProviderDraft, orderOwner, pendingCheckoutResponse, runBackgroundDraft, type OrderAuthor } from "./provider-draft";
import { NewTreeWebClient } from "./new-tree-web-client";
import { snapshotJson } from "./json-value";
import { parsePortalNumber } from "./new-tree-account.parser";

export interface NewTreeCartItems {
  items: { code: string; qty: number; name?: string }[];
  /** Texto libre: el portal lo guarda tal cual como dirección de entrega del pedido. */
  deliveryAddress?: string;
  notes?: string;
  background?: boolean;
}

export interface NewTreeCartTotals {
  itemCount: number;
  subtotal: number;
  vat: number;
  total: number;
  interest: number;
  discount: number;
}

export interface NewTreePreviewItem {
  code: string;
  qty: number;
  name: string;
  price: number | null;
  finalPrice: number | null;
  subtotal: number | null;
  error: string | null;
}

/** "code;qty;total;tax;subtotal;interest;discount" de wsNRW_Calculate. */
export function parseCalculate(raw: string): NewTreeCartTotals | null {
  const parts = raw.split(";").map((s) => s.trim());
  if (parts.length < 5 || parts[0] === "-1") return null;
  const num = (i: number) => parsePortalNumber(parts[i] ?? "") ?? 0;
  return {
    itemCount: num(1),
    total: num(2),
    vat: num(3),
    subtotal: num(4),
    interest: num(5),
    discount: num(6),
  };
}

/** "code,msg,…" de wsNRW_AddCart / wsNRW_SaveSaleOrder. code ≤ 0 es error. */
export function parseCodeMessage(raw: string): { code: number; message: string } {
  const [codeRaw, ...rest] = raw.split(",");
  const code = Number((codeRaw ?? "").trim());
  return { code: Number.isFinite(code) ? code : -1, message: rest.join(",").trim() };
}

/**
 * Checkout real de New Tree con los PageMethods del portal:
 * DeleteAllCart → AddCart por ítem → Calculate → SetDeliveryAddress → SaveSaleOrder.
 * El pago y la entrega los coordina el vendedor de New Tree (el portal no ofrece opciones).
 */
@Injectable()
export class NewTreeOrderService {
  private readonly logger = new Logger(NewTreeOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "NEW_TREE" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({ where: { id, tenantId, provider: "NEW_TREE" } });
    return row ? mapProviderDraft(row) : null;
  }

  private async syncCart(api: NewTreeWebClient, items: NewTreeCartItems["items"]) {
    if (items.length === 0) throw new BadRequestException("No hay productos de New Tree en el pedido");
    const guid = api.session.webSiteId;
    await api.pageMethod("wsNRW_DeleteAllCart", { guidWS_Id: guid });
    const errors = new Map<string, string>();
    for (const it of items) {
      const itemId = Number(it.code);
      if (!Number.isInteger(itemId) || itemId <= 0) throw new BadRequestException(`Código New Tree inválido: ${it.code}`);
      const answer = parseCodeMessage(
        await api.pageMethod("wsNRW_AddCart", {
          guidWS_Id: guid,
          intItemId: itemId,
          decItemQTY: it.qty,
          intItemIDEW: -1,
          strExtendedWarrantyAddress: "",
        })
      );
      if (answer.code <= 0) errors.set(it.code, answer.message || "New Tree rechazó el ítem");
    }
    return errors;
  }

  private async calculate(api: NewTreeWebClient): Promise<NewTreeCartTotals> {
    const totals = parseCalculate(
      await api.pageMethod("wsNRW_Calculate", { guidWS_Id: api.session.webSiteId, intFastCalculate: 1 })
    );
    if (!totals) throw new BadGatewayException("New Tree no pudo calcular el carrito");
    return totals;
  }

  private async catalogPrices(tenantId: string, codes: string[]) {
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider: "NEW_TREE", externalId: { in: codes } },
      select: { externalId: true, price: true, finalPrice: true, currency: true, product: { select: { name: true } } },
    });
    const map = new Map<string, { price: number | null; finalPrice: number | null; name: string; currency: string | null }>();
    for (const o of offers) {
      map.set(o.externalId, {
        price: o.price != null ? Number(o.price) : null,
        finalPrice: o.finalPrice != null ? Number(o.finalPrice) : null,
        name: o.product.name,
        currency: o.currency ?? null,
      });
    }
    return map;
  }

  async preview(tenantId: string, credentials: Record<string, string>, input: NewTreeCartItems) {
    const api = await NewTreeWebClient.login(credentials);
    const errors = await this.syncCart(api, input.items);
    const totals = await this.calculate(api);
    const prices = await this.catalogPrices(tenantId, input.items.map((it) => it.code));
    const items: NewTreePreviewItem[] = input.items.map((it) => {
      const known = prices.get(it.code);
      const price = known?.price ?? null;
      return {
        code: it.code,
        qty: it.qty,
        name: it.name || known?.name || it.code,
        price,
        finalPrice: known?.finalPrice ?? null,
        subtotal: price != null ? Math.round(price * it.qty * 100) / 100 : null,
        error: errors.get(it.code) ?? null,
      };
    });
    return {
      items,
      itemCount: totals.itemCount,
      subtotal: totals.subtotal,
      vat: totals.vat,
      interest: totals.interest,
      discount: totals.discount,
      perceptions: 0,
      total: totals.total,
      // El portal no informa moneda en Calculate: se toma la del catálogo sincronizado (USD en todas las tarjetas vistas).
      currency: [...prices.values()].find((p) => p.currency)?.currency ?? "USD",
      deliveryAddress: input.deliveryAddress ?? null,
      stockOk: errors.size === 0 && totals.itemCount > 0,
      note: "Al confirmar, New Tree registra el pedido en tu cuenta (wsNRW_SaveSaleOrder). Pago y entrega los coordina tu vendedor. No se puede deshacer desde Nodo.",
    };
  }

  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: NewTreeCartItems) {
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "NEW_TREE",
          status: "PENDING",
          paymentOption: "",
          deliveryOption: "",
          notes: input.notes ?? null,
          items: input.items,
          addressSnapshot: { deliveryAddress: input.deliveryAddress ?? null },
        },
      });
      runBackgroundDraft(
        this.logger,
        "New Tree draft background",
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
        "El pedido se está creando en New Tree. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(author, credentials, input);
  }

  /** Envía a New Tree un pedido que esperaba la aprobación del dueño del comercio. */
  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: NewTreeCartItems, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: NewTreeCartItems,
    existingId?: string
  ) {
    const api = await NewTreeWebClient.login(credentials);
    const errors = await this.syncCart(api, input.items);
    if (errors.size > 0) {
      const detail = [...errors.entries()].map(([code, msg]) => `${code}: ${msg}`).join(" · ");
      await this.saveFailed(author, existingId, input, `New Tree rechazó ítems del carrito (${detail})`);
      throw new BadGatewayException(`New Tree rechazó ítems del carrito: ${detail}`);
    }
    const totals = await this.calculate(api);
    const prices = await this.catalogPrices(author.tenantId, input.items.map((it) => it.code));
    const items = input.items.map((it) => ({
      code: it.code,
      qty: it.qty,
      name: it.name || prices.get(it.code)?.name || it.code,
      price: prices.get(it.code)?.price ?? null,
    }));
    const guid = api.session.webSiteId;
    if (input.deliveryAddress?.trim()) {
      await api.pageMethod("wsNRW_SetDeliveryAddress", { guidWS_Id: guid, strDeliveryAddress: input.deliveryAddress.trim() });
    }

    let answer: { code: number; message: string };
    try {
      answer = parseCodeMessage(await api.pageMethod("wsNRW_SaveSaleOrder", { guidWS_Id: guid }));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.saveFailed(author, existingId, input, message, totals, items);
      throw new BadGatewayException(message || "No se pudo crear el pedido en New Tree");
    }
    if (answer.code <= 0) {
      const message = answer.message || "New Tree no aceptó el pedido";
      await this.saveFailed(author, existingId, input, message, totals, items);
      throw new BadGatewayException(message);
    }

    const orderNumber = String(answer.code);
    const saved = {
      status: "CREATED",
      invidOrderNumber: orderNumber,
      invidWebOrderNumber: orderNumber,
      paymentOption: "",
      paymentLabel: "A coordinar con el vendedor",
      deliveryOption: "",
      deliveryLabel: input.deliveryAddress?.trim() ? "Entrega a la dirección indicada" : "A coordinar con el vendedor",
      notes: input.notes ?? null,
      subtotal: totals.subtotal,
      impuestos: totals.vat,
      percepciones: 0,
      total: totals.total,
      errorMessage: null,
      items: snapshotJson(items),
      addressSnapshot: snapshotJson({
        deliveryAddress: input.deliveryAddress ?? null,
        portalMessage: answer.message || null,
        interest: totals.interest,
        discount: totals.discount,
      }),
    };
    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: saved })
      : await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "NEW_TREE", ...saved } });
    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items,
      total: record.total,
      message: `Pedido ${orderNumber} creado en New Tree. Queda en tu cuenta de newtree.com.ar; tu vendedor coordina pago y entrega.`,
    };
  }

  private async saveFailed(
    author: OrderAuthor,
    existingId: string | undefined,
    input: NewTreeCartItems,
    message: string,
    totals?: NewTreeCartTotals,
    items?: unknown
  ) {
    const failed = {
      status: "FAILED",
      paymentOption: "",
      deliveryOption: "",
      notes: input.notes ?? null,
      subtotal: totals?.subtotal ?? null,
      impuestos: totals?.vat ?? null,
      total: totals?.total ?? null,
      errorMessage: message.slice(0, 500),
      items: snapshotJson(items ?? input.items),
      addressSnapshot: snapshotJson({ deliveryAddress: input.deliveryAddress ?? null }),
    };
    if (existingId) {
      await this.prisma.providerOrder.update({ where: { id: existingId }, data: failed });
    } else {
      await this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "NEW_TREE", ...failed } });
    }
  }
}
