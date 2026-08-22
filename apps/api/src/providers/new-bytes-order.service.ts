import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
  buildNbProcessBody,
  extractProcessResult,
  filterPaymentsForDelivery,
  mapPaymentOption,
  NB_PICKUP_BRANCH,
  parseNbAvailability,
  parseNbSubtotales,
  parseShippingQuote,
  type NbAvailability,
  type NbDatosBultos,
  type NbDeliveryMode,
  type NbPaymentOption,
  type NbShippingQuote,
  type NbSubtotales,
} from "./new-bytes.mapper";
import { mapProviderDraft } from "./provider-draft";

export interface NewBytesCartItems {
  items: { code: string; qty: number; name?: string }[];
}

export interface NewBytesDraftInput extends NewBytesCartItems {
  delivery: NbDeliveryMode;
  medioDePagoId?: number;
  addressId?: string;
  medioDeEnvioId?: number;
  notes?: string;
  dropShipping?: boolean;
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

interface PreparedCart {
  api: NewBytesApiClient;
  items: { code: string; qty: number; name: string; price: number; subtotal: number }[];
  payments: NbPaymentOption[];
  addresses: NbAddress[];
  subtotales: NbSubtotales;
  availability: NbAvailability;
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

function publicAddress(address: NbAddress) {
  return { id: address.id, label: address.label, addressLine: address.addressLine, postalCode: address.postalCode };
}

function snapshotJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
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
 * Checkout de NewBytes contra la API oficial de carrito
 * (developers.nb.com.ar: POST /carrito/new → POST /carrito/item →
 * GET subtotales/availability/mediosDePago → cotizar envío → POST /carrito/process).
 *
 * No es un borrador tipo Invid: hay que elegir retiro o envío. El retiro es
 * gratis en Av. Jujuy 1039. El envío exige dirección + cotización (mediodeEnvioId).
 * payMethodId 5 (Efectivo Caja) solo vale para retiro. 11 y 15 redirigen y no se
 * cierran desde Nodo.
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

  async getAddresses(credentials: Record<string, string>): Promise<Omit<NbAddress, "raw">[]> {
    const api = await this.login(credentials);
    return unwrapNbList(await api.get("miCuenta/shippingAddress"))
      .map(mapAddress)
      .filter((a): a is NbAddress => a != null)
      .map(({ raw: _raw, ...rest }) => rest);
  }

  async getPayments(credentials: Record<string, string>): Promise<NbPaymentOption[]> {
    const api = await this.login(credentials);
    return unwrapNbList(await api.get("carrito/mediosDePago"))
      .map(mapPaymentOption)
      .filter((p): p is NbPaymentOption => p != null);
  }

  async listDrafts(userId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { userId, provider: "NEW_BYTES" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  /** POST /v1/carrito/new — crea y activa el carrito. Si falla, vacía e intenta de nuevo. */
  private async ensureCart(api: NewBytesApiClient) {
    try {
      await api.post("carrito/new");
    } catch (err) {
      this.logger.warn(
        `POST carrito/new falló, vacío el carrito y reintento: ${err instanceof Error ? err.message : String(err)}`
      );
      await api.patch("carrito/empty").catch(() => undefined);
      await api.post("carrito/new").catch((retryErr) => {
        this.logger.warn(
          `Reintento POST carrito/new falló: ${retryErr instanceof Error ? retryErr.message : String(retryErr)}`
        );
      });
    }
  }

  private async prepareCart(credentials: Record<string, string>, items: NewBytesCartItems["items"]): Promise<PreparedCart> {
    if (items.length === 0) throw new BadRequestException("No hay productos de NewBytes en el pedido");
    const api = await this.login(credentials);
    await this.ensureCart(api);

    await api.post(
      "carrito/item",
      items.map((it) => ({
        productId: Number(it.code) || it.code,
        amount: it.qty,
        type: 0,
      }))
    );

    const [cartBody, subtotalesRaw, availabilityRaw, paymentsRaw, addressesRaw] = await Promise.all([
      api.get("carrito"),
      api.get("carrito/subtotales").catch(() => null),
      api.get("carrito/availability").catch(() => null),
      api.get("carrito/mediosDePago").catch(() => []),
      api.get("miCuenta/shippingAddress").catch(() => []),
    ]);

    return {
      api,
      items: cartItemsFromBody(cartBody, items),
      payments: unwrapNbList(paymentsRaw).map(mapPaymentOption).filter((p): p is NbPaymentOption => p != null),
      addresses: unwrapNbList(addressesRaw).map(mapAddress).filter((a): a is NbAddress => a != null),
      subtotales: parseNbSubtotales(subtotalesRaw),
      availability: parseNbAvailability(availabilityRaw),
    };
  }

  private async quoteShipping(
    api: NewBytesApiClient,
    address: NbAddress
  ): Promise<{ quotes: NbShippingQuote[]; datosBultos?: NbDatosBultos }> {
    if (!address.postalCode) {
      throw new BadRequestException("Esa dirección no tiene código postal; NewBytes no puede cotizar el envío");
    }
    const path = `carrito/calcularEnvioPara/${encodeURIComponent(address.postalCode)}/${encodeURIComponent(address.id)}`;
    let body: unknown;
    try {
      body = await api.get(path);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new BadRequestException(`No se pudo cotizar el envío en NewBytes: ${message.slice(0, 240)}`);
    }
    const parsed = parseShippingQuote(body);
    if (parsed.quotes.length === 0) {
      throw new BadRequestException(
        `NewBytes no devolvió cotizaciones para CP ${address.postalCode}. Revisá la dirección en el portal.`
      );
    }
    return parsed;
  }

  private paymentsFor(prepared: PreparedCart, delivery: NbDeliveryMode) {
    return filterPaymentsForDelivery(prepared.payments, delivery);
  }

  private resolvePayment(payments: NbPaymentOption[], medioDePagoId: number | undefined, required: boolean) {
    if (medioDePagoId == null) {
      if (required) throw new BadRequestException("Elegí un medio de pago de NewBytes");
      return undefined;
    }
    const payment = payments.find((p) => p.value === String(medioDePagoId));
    if (!payment) {
      throw new BadRequestException(
        "Ese medio de pago no está disponible para esta entrega (Efectivo Caja es solo retiro; tarjeta y MercadoPago no se cierran desde Nodo)"
      );
    }
    return payment;
  }

  private publicCart(prepared: PreparedCart) {
    return {
      items: prepared.items,
      payments: prepared.payments,
      addresses: prepared.addresses.map(publicAddress),
      subtotales: prepared.subtotales.raw,
      availability: prepared.availability,
      stockOk: prepared.availability.ok,
      subtotal: prepared.subtotales.subtotalUsd ?? prepared.items.reduce((sum, it) => sum + it.subtotal, 0),
      total: prepared.subtotales.totalUsd ?? prepared.subtotales.subtotalUsd,
    };
  }

  /** Arma el carrito en NewBytes (POST /carrito/new + items) y devuelve subtotales reales. */
  async syncCart(credentials: Record<string, string>, input: NewBytesCartItems) {
    const prepared = await this.prepareCart(credentials, input.items);
    return {
      ...this.publicCart(prepared),
      pickup: NB_PICKUP_BRANCH,
      note: "Carrito armado en NewBytes. Falta elegir retiro o envío, medio de pago, y confirmar.",
    };
  }

  /** Cotiza envío sobre el carrito ya armado: GET /carrito/calcularEnvioPara/{cp}/{idDirCli}. */
  async quoteShippingForAddress(credentials: Record<string, string>, input: NewBytesCartItems & { addressId: string }) {
    const prepared = await this.prepareCart(credentials, input.items);
    const address = prepared.addresses.find((a) => a.id === input.addressId);
    if (!address) throw new BadRequestException("Esa dirección no está en tu cuenta de NewBytes");
    const quoted = await this.quoteShipping(prepared.api, address);
    return {
      address: publicAddress(address),
      quotes: quoted.quotes,
      datosBultos: quoted.datosBultos ?? null,
    };
  }

  async preview(credentials: Record<string, string>, input: NewBytesDraftInput) {
    if (input.delivery !== "pickup" && input.delivery !== "shipping") {
      throw new BadRequestException("Elegí retiro en sucursal o envío a domicilio");
    }
    const prepared = await this.prepareCart(credentials, input.items);
    const payments = this.paymentsFor(prepared, input.delivery);
    const payment = this.resolvePayment(payments, input.medioDePagoId, false);

    let address: NbAddress | undefined;
    let quotes: NbShippingQuote[] = [];
    let datosBultos: NbDatosBultos | undefined;
    let selectedQuote: NbShippingQuote | undefined;

    if (input.delivery === "shipping") {
      if (input.dropShipping && !input.addressId) {
        throw new BadRequestException("El dropshipping de NewBytes solo aplica a envíos, con una dirección");
      }
      if (input.addressId) {
        address = prepared.addresses.find((a) => a.id === input.addressId);
        if (!address) throw new BadRequestException("Esa dirección no está en tu cuenta de NewBytes");
        const quoted = await this.quoteShipping(prepared.api, address);
        quotes = quoted.quotes;
        datosBultos = quoted.datosBultos;
        if (input.medioDeEnvioId != null) {
          selectedQuote = quotes.find((q) => q.id === String(input.medioDeEnvioId));
          if (!selectedQuote) {
            throw new BadRequestException("Ese medio de envío no está en la cotización de NewBytes");
          }
        }
      }
    }

    return {
      ...this.publicCart(prepared),
      payments,
      delivery: input.delivery,
      pickup: input.delivery === "pickup" ? NB_PICKUP_BRANCH : null,
      address: address ? publicAddress(address) : null,
      quotes,
      selectedQuote: selectedQuote ?? null,
      datosBultos: datosBultos ?? null,
      shippingTotal: selectedQuote?.total ?? null,
      paymentOption: payment?.value,
      paymentLabel: payment?.label,
      dropShipping: input.delivery === "shipping" && Boolean(input.dropShipping),
      note:
        input.delivery === "pickup"
          ? "Retiro en Av. Jujuy 1039, CABA (gratis). Al confirmar, NewBytes registra la orden en tu cuenta."
          : address
            ? "Envío cotizado por NewBytes. Al confirmar se manda POST /carrito/process con mediodeEnvioId e idDirCli."
            : "Elegí una dirección de tu cuenta NewBytes para cotizar el envío.",
    };
  }

  async submitDraft(userId: string, credentials: Record<string, string>, input: NewBytesDraftInput) {
    if (input.delivery !== "pickup" && input.delivery !== "shipping") {
      throw new BadRequestException("Elegí retiro en sucursal o envío a domicilio");
    }
    if (input.medioDePagoId == null) {
      throw new BadRequestException("Elegí un medio de pago de NewBytes");
    }
    if (input.delivery === "shipping") {
      if (!input.addressId) throw new BadRequestException("Elegí una dirección de envío de tu cuenta NewBytes");
      if (input.medioDeEnvioId == null) throw new BadRequestException("Elegí un medio de envío de la cotización");
    } else if (input.dropShipping) {
      throw new BadRequestException("El dropshipping de NewBytes solo aplica cuando hay envío, no en retiro");
    }

    const prepared = await this.prepareCart(credentials, input.items);
    const payments = this.paymentsFor(prepared, input.delivery);
    const payment = this.resolvePayment(payments, input.medioDePagoId, true);

    let address: NbAddress | undefined;
    let quotes: NbShippingQuote[] = [];
    let datosBultos: NbDatosBultos | undefined;
    let selectedQuote: NbShippingQuote | undefined;

    if (input.delivery === "shipping") {
      address = prepared.addresses.find((a) => a.id === input.addressId);
      if (!address) throw new BadRequestException("Esa dirección no está en tu cuenta de NewBytes");
      const quoted = await this.quoteShipping(prepared.api, address);
      quotes = quoted.quotes;
      datosBultos = quoted.datosBultos;
      selectedQuote = quotes.find((q) => q.id === String(input.medioDeEnvioId));
      if (!selectedQuote) {
        throw new BadRequestException("Ese medio de envío no está en la cotización de NewBytes");
      }
    }

    const processBody = buildNbProcessBody({
      delivery: input.delivery,
      medioDePagoId: input.medioDePagoId,
      notes: input.notes,
      postalCode: address?.postalCode,
      medioDeEnvioId: input.medioDeEnvioId,
      addressId: address?.id,
      datosBultos,
      dropShipping: input.delivery === "shipping" && input.dropShipping,
      dropShippingClientName: input.dropShippingClientName,
      dropShippingClientEmail: input.dropShippingClientEmail,
    });

    const deliveryLabel =
      input.delivery === "pickup"
        ? `${NB_PICKUP_BRANCH.label} — ${NB_PICKUP_BRANCH.addressLine}`
        : selectedQuote
          ? `${selectedQuote.label}${selectedQuote.plazo ? ` (${selectedQuote.plazo})` : ""}`
          : "Envío";

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
          paymentLabel: payment?.label,
          deliveryOption: input.delivery === "pickup" ? "pickup" : String(input.medioDeEnvioId ?? ""),
          deliveryLabel,
          notes: input.notes,
          total: prepared.subtotales.totalUsd ?? prepared.subtotales.subtotalUsd,
          errorMessage: message.slice(0, 500),
          items: prepared.items,
          addressSnapshot: snapshotJson(
            input.delivery === "pickup"
              ? { pickup: true, ...NB_PICKUP_BRANCH }
              : address
                ? { id: address.id, ...address.raw, quote: selectedQuote ?? null, datosBultos: datosBultos ?? null }
                : { shipping: true }
          ),
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
        invidWebOrderNumber:
          processResult.branch && processResult.orderId
            ? `${processResult.branch}-${processResult.orderId}`
            : processResult.branch ?? null,
        paymentOption: String(input.medioDePagoId),
        paymentLabel: payment?.label,
        deliveryOption: input.delivery === "pickup" ? "pickup" : String(input.medioDeEnvioId ?? ""),
        deliveryLabel,
        notes: input.notes,
        subtotal: prepared.subtotales.subtotalUsd,
        total: prepared.subtotales.totalUsd ?? prepared.subtotales.subtotalUsd,
        errorMessage: created ? null : "NewBytes no devolvió número de pedido",
        items: prepared.items,
        addressSnapshot: snapshotJson(
          input.delivery === "pickup"
            ? { pickup: true, ...NB_PICKUP_BRANCH }
            : address
              ? {
                  id: address.id,
                  ...address.raw,
                  quote: selectedQuote ?? null,
                  datosBultos: datosBultos ?? null,
                  dropShipping: input.dropShipping ?? false,
                }
              : { shipping: true }
        ),
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
      message:
        input.delivery === "pickup"
          ? "Pedido creado en NewBytes como retiro en sucursal (Av. Jujuy 1039, CABA). Queda en tu cuenta."
          : input.dropShipping
            ? "Pedido creado en NewBytes con envío dropshipping (marca blanca). Queda en Mis órdenes de compra."
            : "Pedido creado en NewBytes con envío. Queda en Mis órdenes de compra.",
    };
  }
}
