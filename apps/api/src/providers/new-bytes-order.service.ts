import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import {
  asNumber,
  asRecord,
  asString,
  hasNbPortalLogin,
  NewBytesApiClient,
  parseNbCredentials,
  unwrapNbList,
} from "./new-bytes-client";
import {
  extractProcessResult,
  mapPaymentOption,
  type NbPaymentOption,
} from "./new-bytes.mapper";

export interface NewBytesDraftInput {
  items: { code: string; qty: number; name?: string }[];
  medioDePagoId: number;
  addressId?: string;
  medioDeEnvioId?: number;
  notes?: string;
  dropShippingClientName?: string;
  dropShippingClientEmail?: string;
}

interface NbAddress {
  id: string;
  label: string;
  addressLine: string;
  postalCode?: string;
  isDefault: boolean;
  raw: Record<string, unknown>;
}

interface NbShippingQuote {
  id: string;
  label: string;
  plazo?: string;
  total?: number;
}

interface PreparedCart {
  api: NewBytesApiClient;
  items: { code: string; qty: number; name: string; price: number; subtotal: number }[];
  payments: NbPaymentOption[];
  addresses: NbAddress[];
  address?: NbAddress;
  payment?: NbPaymentOption;
  shipping?: NbShippingQuote[];
  datosBultos?: { weightKg: number; sizeCm: string; amount: number };
  subtotales: Record<string, unknown> | null;
  availability: unknown;
  pickup: boolean;
}

function mapAddress(raw: unknown): NbAddress | null {
  const rec = asRecord(raw);
  if (!rec) return null;
  const id = asString(rec.id) || asString(rec.addressId) || asString(rec.idDirCli);
  if (!id) return null;
  const street = asString(rec.direccion) || asString(rec.address) || asString(rec.calle) || "";
  const place = asString(rec.localidad) || asString(rec.place) || asString(rec.placeString) || "";
  const province = asString(rec.provincia) || asString(rec.province) || "";
  const postal = asString(rec.codigoPostal) || asString(rec.postalCode) || asString(rec.cp);
  const label = asString(rec.identificador) || asString(rec.label) || asString(rec.nombre) || street || `Dirección ${id}`;
  return {
    id,
    label,
    addressLine: [street, place, province, postal].filter(Boolean).join(", "),
    postalCode: postal,
    isDefault: rec.predeterminado === true || rec.default === true || rec.favorita === true,
    raw: rec,
  };
}

function cartItemsFromBody(
  body: unknown,
  requested: { code: string; qty: number; name?: string }[]
): PreparedCart["items"] {
  const list = unwrapNbList(body);
  if (list.length === 0) {
    return requested.map((it) => ({
      code: it.code,
      qty: it.qty,
      name: it.name || it.code,
      price: 0,
      subtotal: 0,
    }));
  }
  return list.map((row, i) => {
    const rec = asRecord(row) ?? {};
    const product = asRecord(rec.product) ?? rec;
    const code = asString(rec.productId) || asString(product.id) || requested[i]?.code || "";
    const qty = asNumber(rec.amount) ?? asNumber(rec.qty) ?? requested[i]?.qty ?? 1;
    const name = asString(product.title) || asString(rec.title) || asString(rec.name) || requested[i]?.name || code;
    const priceObj = asRecord(product.price) ?? asRecord(rec.price);
    const price = asNumber(priceObj?.value) ?? asNumber(rec.price) ?? 0;
    const line = asNumber(rec.subtotal) ?? price * qty;
    return { code, qty, name, price, subtotal: line };
  });
}

/**
 * Crea un pedido en NewBytes desde Nodo, por la API oficial de carrito
 * (developers.nb.com.ar + store Vuex `carrito` del sitio).
 *
 * Por defecto se arma como retiro en sucursal (Av. Jujuy 1039, CABA) — el
 * equivalente al borrador RETIRA de Invid. Tarjeta / MercadoPago (ids 11 y 15)
 * se excluyen porque redirigen a un cobro externo.
 */
@Injectable()
export class NewBytesOrderService {
  private readonly logger = new Logger(NewBytesOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  private async login(credentials: Record<string, string>): Promise<NewBytesApiClient> {
    const creds = parseNbCredentials(credentials);
    if (!hasNbPortalLogin(creds)) {
      throw new BadGatewayException(
        "Para crear pedidos en NewBytes hace falta user y password del portal"
      );
    }
    return NewBytesApiClient.login(creds.user!, creds.password!);
  }

  async getAddresses(credentials: Record<string, string>): Promise<NbAddress[]> {
    const api = await this.login(credentials);
    return unwrapNbList(await api.get("miCuenta/shippingAddress")).map(mapAddress).filter((a): a is NbAddress => a != null);
  }

  async getPayments(credentials: Record<string, string>): Promise<NbPaymentOption[]> {
    const api = await this.login(credentials);
    return unwrapNbList(await api.get("carrito/mediosDePago")).map(mapPaymentOption).filter((p): p is NbPaymentOption => p != null);
  }

  async listDrafts(userId: string) {
    return this.prisma.providerOrder.findMany({
      where: { userId, provider: "NEW_BYTES" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  private async ensureCart(api: NewBytesApiClient) {
    try {
      await api.patch("carrito/empty");
    } catch (err) {
      this.logger.warn(`PATCH carrito/empty falló, intento POST carrito/new: ${err instanceof Error ? err.message : String(err)}`);
      await api.post("carrito/new").catch(() => undefined);
    }
  }

  private async prepareCart(credentials: Record<string, string>, input: NewBytesDraftInput): Promise<PreparedCart> {
    if (input.items.length === 0) throw new BadRequestException("No hay productos de NewBytes en el pedido");
    const api = await this.login(credentials);
    await this.ensureCart(api);

    const payload = input.items.map((it) => ({
      productId: Number(it.code) || it.code,
      amount: it.qty,
      type: 0,
    }));
    await api.post("carrito/item", payload);

    const [cartBody, subtotales, availability, paymentsRaw, addressesRaw] = await Promise.all([
      api.get("carrito"),
      api.get("carrito/subtotales").catch(() => null),
      api.get("carrito/availability").catch(() => null),
      api.get("carrito/mediosDePago").catch(() => []),
      api.get("miCuenta/shippingAddress").catch(() => []),
    ]);

    const payments = unwrapNbList(paymentsRaw).map(mapPaymentOption).filter((p): p is NbPaymentOption => p != null);
    const addresses = unwrapNbList(addressesRaw).map(mapAddress).filter((a): a is NbAddress => a != null);
    const payment = payments.find((p) => p.value === String(input.medioDePagoId));
    if (!payment) {
      throw new BadRequestException("Esa forma de pago no está disponible (o redirige a tarjeta/MercadoPago, que no se arma desde Nodo)");
    }

    const address = input.addressId ? addresses.find((a) => a.id === input.addressId) : undefined;
    const pickup = !input.medioDeEnvioId;

    let shipping: NbShippingQuote[] | undefined;
    let datosBultos: PreparedCart["datosBultos"];
    if (!pickup && address?.postalCode) {
      const path = address.id
        ? `carrito/calcularEnvioPara/${encodeURIComponent(address.postalCode)}/${encodeURIComponent(address.id)}`
        : `carrito/calcularEnvioPara/${encodeURIComponent(address.postalCode)}`;
      try {
        const quoteBody = asRecord(await api.get(path)) ?? {};
        const cotizacion = unwrapNbList(quoteBody.cotizacion ?? quoteBody);
        shipping = cotizacion.map((row) => {
          const rec = asRecord(row) ?? {};
          return {
            id: asString(rec.id) || "",
            label: asString(rec.description) || asString(rec.descripcion) || `Envío ${rec.id}`,
            plazo: asString(rec.plazoEntrega),
            total: asNumber(rec.total),
          };
        }).filter((s) => s.id);
        const bulto = asRecord(quoteBody.datosBulto) ?? asRecord(quoteBody.datosBultos);
        if (bulto) {
          datosBultos = {
            weightKg: asNumber(bulto.weightKg) ?? 0,
            sizeCm: asString(bulto.sizeCm) || "0x0x0",
            amount: asNumber(bulto.amount) ?? 1,
          };
        }
      } catch (err) {
        this.logger.warn(`calcularEnvioPara falló: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return {
      api,
      items: cartItemsFromBody(cartBody, input.items),
      payments,
      addresses,
      address,
      payment,
      shipping,
      datosBultos,
      subtotales: asRecord(subtotales),
      availability,
      pickup,
    };
  }

  async preview(credentials: Record<string, string>, input: NewBytesDraftInput) {
    const prepared = await this.prepareCart(credentials, input);
    const sub = prepared.subtotales ?? {};
    return {
      items: prepared.items,
      payments: prepared.payments,
      addresses: prepared.addresses.map(({ raw: _raw, ...rest }) => rest),
      address: prepared.address ? { id: prepared.address.id, label: prepared.address.label, addressLine: prepared.address.addressLine, postalCode: prepared.address.postalCode } : null,
      paymentOption: prepared.payment?.value,
      paymentLabel: prepared.payment?.label,
      deliveries: prepared.pickup
        ? [{ value: "pickup", label: "Retiro en New Bytes — Av. Jujuy 1039, CABA" }]
        : (prepared.shipping ?? []).map((s) => ({ value: s.id, label: `${s.label}${s.plazo ? ` (${s.plazo})` : ""}${s.total != null ? ` — $${s.total}` : ""}` })),
      suggestedDelivery: prepared.pickup
        ? { value: "pickup", label: "Retiro en New Bytes — Av. Jujuy 1039, CABA" }
        : prepared.shipping?.[0]
          ? { value: prepared.shipping[0].id, label: prepared.shipping[0].label }
          : undefined,
      stockOk: true,
      subtotal: asNumber(sub.subTotalDollar) ?? prepared.items.reduce((s, i) => s + i.subtotal, 0),
      total: asNumber(sub.subTotalDollarFinal) ?? asNumber(sub.subTotalDollar),
      subtotales: prepared.subtotales,
      availability: prepared.availability,
      note: "Esto todavía no crea el pedido. Al confirmar, NewBytes registra la orden en tu cuenta (retiro en sucursal salvo que elijas un envío).",
    };
  }

  async submitDraft(userId: string, credentials: Record<string, string>, input: NewBytesDraftInput) {
    const prepared = await this.prepareCart(credentials, input);
    const processBody: Record<string, unknown> = {
      note: input.notes ?? "",
      medioDePagoId: input.medioDePagoId,
    };

    if (!prepared.pickup) {
      if (!prepared.address) throw new BadRequestException("Elegí una dirección de envío");
      if (!input.medioDeEnvioId) throw new BadRequestException("Elegí un medio de envío");
      processBody.codigoPostalFavorito = prepared.address.postalCode;
      processBody.mediodeEnvioId = input.medioDeEnvioId;
      processBody.idDirCli = prepared.address.id;
      if (prepared.datosBultos) processBody.datosBultos = prepared.datosBultos;
      if (input.dropShippingClientName || input.dropShippingClientEmail) {
        processBody.dropShipping = true;
        processBody.dpPayload = {
          clientName: input.dropShippingClientName,
          clientEmail: input.dropShippingClientEmail,
        };
      }
    }

    let processResult: { orderId?: string; branch?: string; raw: unknown } = { raw: null };
    try {
      const body = await prepared.api.post("carrito/process", processBody);
      processResult = extractProcessResult(body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const record = await this.prisma.providerOrder.create({
        data: {
          userId,
          provider: "NEW_BYTES",
          status: "FAILED",
          invidOrderNumber: null,
          invidWebOrderNumber: null,
          paymentOption: String(input.medioDePagoId),
          paymentLabel: prepared.payment?.label,
          deliveryOption: prepared.pickup ? "pickup" : String(input.medioDeEnvioId ?? ""),
          deliveryLabel: prepared.pickup ? "Retiro en sucursal" : (prepared.shipping?.find((s) => s.id === String(input.medioDeEnvioId))?.label ?? null),
          notes: input.notes,
          total: asNumber(prepared.subtotales?.subTotalDollarFinal) ?? asNumber(prepared.subtotales?.subTotalDollar),
          errorMessage: message.slice(0, 500),
          items: prepared.items,
          addressSnapshot: prepared.address ? { id: prepared.address.id, ...prepared.address.raw } : { pickup: true },
        },
      });
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en NewBytes");
    }

    const created = Boolean(processResult.orderId || processResult.branch);
    const record = await this.prisma.providerOrder.create({
      data: {
        userId,
        provider: "NEW_BYTES",
        status: created ? "CREATED" : "FAILED",
        invidOrderNumber: processResult.orderId ?? null,
        invidWebOrderNumber: processResult.branch && processResult.orderId
          ? `${processResult.branch}-${processResult.orderId}`
          : processResult.branch ?? null,
        paymentOption: String(input.medioDePagoId),
        paymentLabel: prepared.payment?.label,
        deliveryOption: prepared.pickup ? "pickup" : String(input.medioDeEnvioId ?? ""),
        deliveryLabel: prepared.pickup ? "Retiro en sucursal New Bytes (Av. Jujuy 1039)" : (prepared.shipping?.find((s) => s.id === String(input.medioDeEnvioId))?.label ?? null),
        notes: input.notes,
        subtotal: asNumber(prepared.subtotales?.subTotalDollar),
        total: asNumber(prepared.subtotales?.subTotalDollarFinal) ?? asNumber(prepared.subtotales?.subTotalDollar),
        errorMessage: created ? null : "NewBytes no devolvió número de pedido",
        items: prepared.items,
        addressSnapshot: prepared.address ? { id: prepared.address.id, ...prepared.address.raw } : { pickup: true },
      },
    });

    if (!created) {
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en NewBytes");
    }

    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: prepared.items,
      total: record.total,
      message: prepared.pickup
        ? "Pedido creado en NewBytes como retiro en sucursal (Av. Jujuy 1039, CABA). Queda en tu cuenta; el vendedor lo gestiona desde ahí."
        : "Pedido creado en NewBytes con envío. Queda en tu cuenta (Mis órdenes de compra).",
    };
  }
}
