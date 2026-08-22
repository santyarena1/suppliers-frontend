import { BadGatewayException, BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  AIR_DELIVERIES,
  AIR_PAYMENTS,
  AirPortalClient,
  type AirCart,
} from "./air-portal-client";
import { snapshotJson } from "./json-value";

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
}

function publicCart(cart: AirCart) {
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
  constructor(private readonly prisma: PrismaService) {}

  async checkoutOptions(credentials: Record<string, string>) {
    const api = await AirPortalClient.login(credentials);
    return api.checkoutOptions();
  }

  async listDrafts(userId: string) {
    return this.prisma.providerOrder.findMany({
      where: { userId, provider: "AIR" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
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

  async submitDraft(userId: string, credentials: Record<string, string>, input: AirDraftInput) {
    if (!input.vendedor) throw new BadRequestException("Elegí un vendedor de Air");
    if (!input.sucursal) throw new BadRequestException("Elegí una sucursal de Air");
    if (input.entrega === "05") {
      throw new BadRequestException(
        "Drop Shipping de Air pide una dirección cargada en el portal. Usá retiro o transporte, o cargá el destino en air-intra.com."
      );
    }
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
      const record = await this.prisma.providerOrder.create({
        data: {
          userId,
          provider: "AIR",
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
          addressSnapshot: snapshotJson({ sucursal: input.sucursal, vendedor: input.vendedor, raw: null }),
        },
      });
      throw new BadGatewayException(record.errorMessage || "No se pudo enviar el pedido en Air");
    }

    const record = await this.prisma.providerOrder.create({
      data: {
        userId,
        provider: "AIR",
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
        total: cart.total,
        items: snapshotJson(publicCart(cart).items),
        addressSnapshot: snapshotJson({
          sucursal: input.sucursal,
          vendedor: input.vendedor,
          transporte: input.transporte ?? cart.transporte,
          send: sendRaw,
        }),
      },
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
