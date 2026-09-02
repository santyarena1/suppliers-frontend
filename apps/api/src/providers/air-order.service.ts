import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AIR_DELIVERIES,
  AIR_PAYMENTS,
  AirPortalClient,
  type AirCart,
} from "./air-portal-client";
import { snapshotJson } from "./json-value";
import { mapProviderDraft, orderOwner, pendingCheckoutResponse, runBackgroundDraft, type OrderAuthor } from "./provider-draft";

export interface AirCartItems {
  items: { code: string; qty: number; name?: string }[];
}

export interface AirDraftInput extends AirCartItems {
  sucursal: string;
  vendedor: string;
  pago: string;
  entrega: string;
  transporte?: string;
  notes?: string;
  background?: boolean;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Lo que queda en el total del canasto después de IVA e internos: percepción de la NV. */
export function airPerceptionsFromCart(cart: {
  subtotal: number;
  total: number;
  iva21: number;
  iva105: number;
  ii: number;
}): number {
  const leftover = cart.total - cart.subtotal - cart.iva21 - cart.iva105 - cart.ii;
  return leftover > 0.005 ? round2(leftover) : 0;
}

function publicCart(cart: AirCart) {
  const perceptions = airPerceptionsFromCart(cart);
  return {
    nrocompro: cart.nrocompro,
    sucursal: cart.sucursal,
    vendedor: cart.vendedor,
    pago: cart.pago,
    entrega: cart.entrega,
    transporte: cart.transporte,
    items: cart.items.map((it) => ({
      code: it.codiart,
      qty: it.cantidad,
      name: it.descart || it.codiart,
      price: it.precio,
      subtotal: it.precio * it.cantidad,
      iva: it.ivaNeto,
    })),
    subtotal: cart.subtotal,
    iva21: cart.iva21,
    iva105: cart.iva105,
    ii: cart.ii,
    perceptions,
    total: cart.total,
  };
}

function paymentLabel(value: string) {
  return AIR_PAYMENTS.find((p) => p.value === value)?.label ?? value;
}

function deliveryLabel(value: string, transporte?: string) {
  const base = AIR_DELIVERIES.find((d) => d.value === value)?.label ?? value;
  return value === "03" && transporte ? `${base} · ${transporte}` : base;
}

/**
 * Checkout real del canasto NV de Air (canasto.php). No cobra: deja el
 * pedido para que el vendedor elegido lo cargue, igual que el botón
 * "Enviar el pedido" del portal 2025.
 */
@Injectable()
export class AirOrderService {
  private readonly logger = new Logger(AirOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async checkoutOptions(credentials: Record<string, string>) {
    const api = await AirPortalClient.login(credentials);
    return api.checkoutOptions();
  }

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "AIR" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, tenantId, provider: "AIR" },
    });
    return row ? mapProviderDraft(row) : null;
  }

  private async syncCanasto(api: AirPortalClient, items: AirCartItems["items"]): Promise<AirCart> {
    if (items.length === 0) throw new BadRequestException("No hay productos de Air en el pedido");
    let cart = await api.getPedido("0");
    for (const existing of [...cart.items]) {
      if (existing.renglon) {
        cart = await api.delItem(existing.renglon, cart.nrocompro);
      }
    }
    for (const it of items) {
      cart = await api.addItem(it.code, it.qty, cart.nrocompro);
    }
    return cart;
  }

  async preview(credentials: Record<string, string>, input: AirDraftInput) {
    const api = await AirPortalClient.login(credentials);
    const cart = await this.syncCanasto(api, input.items);
    if (input.sucursal) await api.setPrefer("sucursal", input.sucursal, cart.nrocompro);
    if (input.vendedor) await api.setPrefer("vendedor", input.vendedor, cart.nrocompro);
    if (input.pago) await api.setPrefer("pago", input.pago, cart.nrocompro);
    if (input.entrega) await api.setPrefer("entrega", input.entrega, cart.nrocompro);
    if (input.transporte) await api.setPrefer("transporte", input.transporte, cart.nrocompro);
    if (input.notes) await api.setPrefer("texto", input.notes, cart.nrocompro);
    const refreshed = await api.getPedido(cart.nrocompro);
    return {
      ...publicCart(refreshed),
      options: await api.checkoutOptions(),
      paymentLabel: paymentLabel(input.pago || refreshed.pago),
      deliveryLabel: deliveryLabel(input.entrega || refreshed.entrega, input.transporte || refreshed.transporte),
      stockOk: refreshed.items.length === input.items.length,
      note:
        "Air no cobra desde Nodo: al confirmar, el canasto queda marcado para que el vendedor elegido lo cargue.",
    };
  }

  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: AirDraftInput) {
    if (!input.vendedor) throw new BadRequestException("Elegí un vendedor de Air");
    if (!input.sucursal) throw new BadRequestException("Elegí una sucursal de Air");
    if (input.entrega === "05") {
      throw new BadRequestException(
        "Drop Shipping de Air pide una dirección cargada en el portal. Usá retiro o transporte, o cargá el destino en air-intra.com."
      );
    }
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "AIR",
          status: "PENDING",
          paymentOption: input.pago,
          deliveryOption: input.entrega,
          notes: input.notes,
          items: input.items,
          addressSnapshot: { sucursal: input.sucursal, vendedor: input.vendedor, transporte: input.transporte ?? null },
        },
      });
      runBackgroundDraft(
        this.logger,
        "Air draft background",
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
        "El pedido se está enviando en Air. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(author, credentials, input);
  }

  /** Envía a Air un pedido que estaba esperando la aprobación del dueño del comercio. */
  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: AirDraftInput, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: AirDraftInput,
    existingId?: string
  ) {
    const api = await AirPortalClient.login(credentials);
    let cart = await this.syncCanasto(api, input.items);
    await api.setPrefer("sucursal", input.sucursal, cart.nrocompro);
    await api.setPrefer("vendedor", input.vendedor, cart.nrocompro);
    await api.setPrefer("pago", input.pago, cart.nrocompro);
    await api.setPrefer("entrega", input.entrega, cart.nrocompro);
    if (input.transporte) await api.setPrefer("transporte", input.transporte, cart.nrocompro);
    if (input.notes) await api.setPrefer("texto", input.notes, cart.nrocompro);
    cart = await api.getPedido(cart.nrocompro);

    let sendRaw: unknown;
    try {
      sendRaw = await api.sendPedido(cart.nrocompro);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = {
        status: "FAILED",
        invidOrderNumber: cart.nrocompro,
        paymentOption: input.pago,
        paymentLabel: paymentLabel(input.pago),
        deliveryOption: input.entrega,
        deliveryLabel: deliveryLabel(input.entrega, input.transporte),
        notes: input.notes,
        subtotal: cart.subtotal,
        total: cart.total,
        errorMessage: message.slice(0, 500),
        items: snapshotJson(publicCart(cart).items),
        addressSnapshot: snapshotJson({
          sucursal: input.sucursal,
          vendedor: input.vendedor,
          raw: null,
          iva21: cart.iva21,
          iva105: cart.iva105,
          ii: cart.ii,
          perceptions: airPerceptionsFromCart(cart),
          subtotal: cart.subtotal,
          total: cart.total,
        }),
      };
      const record = existingId
        ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: failed })
        : await this.prisma.providerOrder.create({
            data: { ...orderOwner(author), provider: "AIR", ...failed },
          });
      throw new BadGatewayException(record.errorMessage || "No se pudo enviar el pedido en Air");
    }

    const saved = {
      status: "CREATED",
      invidOrderNumber: cart.nrocompro,
      invidWebOrderNumber: cart.nrocompro,
      paymentOption: input.pago,
      paymentLabel: paymentLabel(input.pago),
      deliveryOption: input.entrega,
      deliveryLabel: deliveryLabel(input.entrega, input.transporte),
      notes: input.notes,
      subtotal: cart.subtotal,
      impuestos: cart.iva21 + cart.iva105 + cart.ii,
      percepciones: airPerceptionsFromCart(cart),
      total: cart.total,
      items: snapshotJson(publicCart(cart).items),
      addressSnapshot: snapshotJson({
        sucursal: input.sucursal,
        vendedor: input.vendedor,
        transporte: input.transporte ?? cart.transporte,
        send: sendRaw,
        iva21: cart.iva21,
        iva105: cart.iva105,
        ii: cart.ii,
        perceptions: airPerceptionsFromCart(cart),
        subtotal: cart.subtotal,
        total: cart.total,
      }),
    };
    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: saved })
      : await this.prisma.providerOrder.create({
          data: { ...orderOwner(author), provider: "AIR", ...saved },
        });

    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: publicCart(cart).items,
      total: cart.total,
      message: `Pedido ${cart.nrocompro} enviado en Air. El vendedor va a cargarlo; no se cobra desde Nodo.`,
    };
  }
}
