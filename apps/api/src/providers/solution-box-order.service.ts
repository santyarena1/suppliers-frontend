import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { mapProviderDraft, orderOwner, pendingCheckoutResponse, runBackgroundDraft, type OrderAuthor } from "./provider-draft";
import { SolutionBoxWebClient } from "./solution-box-web-client";
import { mapSolutionBoxProforma, type SolutionBoxProforma } from "./solution-box.parser";
import { asNumber, asRecord, asString, snapshotJson, unwrapList } from "./json-value";

export interface SolutionBoxCartItems {
  items: { code: string; qty: number; name?: string }[];
  paymentCondition?: string;
  deliveryType?: string;
  background?: boolean;
}

/** El sitio solo conoce estos dos tipos de entrega; "ENTREGA" usa la dirección del cliente. */
const DELIVERY_TYPES = [
  { value: "1", label: "Retira en Solution Box" },
  { value: "2", label: "Entrega a domicilio" },
] as const;

function deliveryLabel(code: string, fallback: string | null): string {
  return DELIVERY_TYPES.find((d) => d.value === code)?.label ?? fallback ?? code;
}

/**
 * Checkout real de Solution Box con la API interna del sitio:
 * proforma (cotización con IVA, percepción IIBB y cotización del dólar) →
 * POST /checkout/pedido/success con la proforma y los datos del cliente.
 */
@Injectable()
export class SolutionBoxOrderService {
  private readonly logger = new Logger(SolutionBoxOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { tenantId, provider: "SOLUTION_BOX" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(tenantId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({ where: { id, tenantId, provider: "SOLUTION_BOX" } });
    return row ? mapProviderDraft(row) : null;
  }

  private async catalogPrices(tenantId: string, codes: string[]) {
    const offers = await this.prisma.tenantProductOffer.findMany({
      where: { tenantId, provider: "SOLUTION_BOX", externalId: { in: codes } },
      select: { externalId: true, price: true, currency: true, product: { select: { name: true } } },
    });
    return new Map(
      offers.map((o) => [o.externalId, { price: o.price != null ? Number(o.price) : null, currency: o.currency, name: o.product.name }])
    );
  }

  private async quote(tenantId: string, api: SolutionBoxWebClient, input: SolutionBoxCartItems) {
    if (input.items.length === 0) throw new BadRequestException("No hay productos de Solution Box en el pedido");
    const prices = await this.catalogPrices(tenantId, input.items.map((it) => it.code));
    const missing = input.items.filter((it) => (prices.get(it.code)?.price ?? 0) <= 0);
    if (missing.length) {
      throw new BadRequestException(
        `Sin precio de Solution Box para ${missing.map((it) => it.name || it.code).join(", ")}: sincronizá el catálogo o sacalos del carrito.`
      );
    }
    const customer = api.customer;
    const paymentCode = input.paymentCondition || customer.paymentCondition?.code || "";
    const conditions = await this.paymentConditions(api);
    const payment = conditions.find((c) => c.value === paymentCode) ?? conditions[0] ?? null;
    const deliveryCode = input.deliveryType || customer.deliveryType?.code || "1";
    const delivery = {
      Codigo: deliveryCode,
      Descripcion: deliveryCode === "2" ? "ENTREGA" : customer.deliveryType?.code === deliveryCode ? customer.deliveryType.label : "RETIRA",
    };
    const address =
      delivery.Descripcion === "ENTREGA"
        ? {
            Domicilio: customer.deliveryAddress.street,
            Localidad: customer.deliveryAddress.city,
            codigoPostal: customer.deliveryAddress.postalCode,
            Codigo_Prov: customer.deliveryAddress.provinceCode,
            Pais: customer.deliveryAddress.country,
          }
        : null;
    const precompra = {
      items: input.items.map((it) => {
        const known = prices.get(it.code)!;
        return { Alias: it.code, Precio: known.price, Cantidad: it.qty, Moneda: known.currency === "ARS" ? "$" : "u$s" };
      }),
      cond_pago: payment ? { Codigo: payment.value, Descripcion: payment.label } : null,
      tipo_entrega: delivery,
      Direccion_entrega: address,
    };
    const res = await api.post("/pedidos/proforma", { precompra });
    if (res.status >= 400) {
      const detail = typeof res.data === "string" ? res.data : JSON.stringify(res.data);
      throw new BadGatewayException(`Solution Box rechazó la cotización (${res.status}): ${detail.slice(0, 300)}`);
    }
    const proforma = mapSolutionBoxProforma(res.data);
    return { proforma, prices, conditions, payment, deliveryCode };
  }

  private async paymentConditions(api: SolutionBoxWebClient) {
    const body = await api.get("/pedidos/constantes/condiciones_pago").catch(() => []);
    return unwrapList(body)
      .map((row) => {
        const r = asRecord(row) ?? {};
        return { value: asString(r.Codigo) ?? "", label: asString(r.Descripcion) ?? "" };
      })
      .filter((c) => c.value);
  }

  private publicPreview(
    input: SolutionBoxCartItems,
    q: Awaited<ReturnType<SolutionBoxOrderService["quote"]>>,
    customer: SolutionBoxWebClient["customer"]
  ) {
    const usd = q.proforma.totalsUsd;
    const ars = q.proforma.totalsArs;
    const items = input.items.map((it) => {
      const known = q.prices.get(it.code);
      const line = q.proforma.items.find((p) => p.code === it.code);
      const price = line?.price ?? known?.price ?? 0;
      return { code: it.code, qty: it.qty, name: it.name || known?.name || it.code, price, subtotal: Math.round(price * it.qty * 100) / 100 };
    });
    const perceptionLines = [
      ...(usd && usd.iibb > 0 ? [{ label: "Percepción IIBB", amount: usd.iibb }] : []),
      ...(usd && usd.vatPerception > 0 ? [{ label: "Percepción IVA", amount: usd.vatPerception }] : []),
    ];
    return {
      items,
      paymentConditions: q.conditions,
      paymentCondition: q.payment?.value ?? null,
      paymentLabel: q.payment?.label ?? null,
      deliveryTypes: DELIVERY_TYPES.map((d) => ({ ...d })),
      deliveryType: q.deliveryCode,
      deliveryLabel: deliveryLabel(q.deliveryCode, customer.deliveryType?.label ?? null),
      deliveryAddress: q.deliveryCode === "2" ? `${customer.deliveryAddress.street}, ${customer.deliveryAddress.city}` : null,
      subtotal: usd?.subtotal ?? items.reduce((s, it) => s + it.subtotal, 0),
      vat: usd?.vat ?? 0,
      internalTax: usd?.internalTax ?? 0,
      perceptions: (usd?.iibb ?? 0) + (usd?.vatPerception ?? 0),
      perceptionLines,
      shippingCost: usd?.shipping ?? 0,
      total: usd?.total ?? 0,
      totalArs: ars?.total ?? null,
      exchange: q.proforma.exchange,
      currency: "USD",
      stockOk: true,
      note: "Al confirmar, Solution Box crea el pedido en tu cuenta (POST /checkout/pedido/success) con la cotización de esta proforma. No se puede deshacer desde Nodo.",
    };
  }

  async preview(tenantId: string, credentials: Record<string, string>, input: SolutionBoxCartItems) {
    const api = await SolutionBoxWebClient.login(credentials);
    const q = await this.quote(tenantId, api, input);
    return this.publicPreview(input, q, api.customer);
  }

  async submitDraft(author: OrderAuthor, credentials: Record<string, string>, input: SolutionBoxCartItems) {
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          ...orderOwner(author),
          provider: "SOLUTION_BOX",
          status: "PENDING",
          paymentOption: input.paymentCondition ?? "",
          deliveryOption: input.deliveryType ?? "",
          items: input.items,
          addressSnapshot: { deliveryType: input.deliveryType ?? null },
        },
      });
      runBackgroundDraft(
        this.logger,
        "Solution Box draft background",
        pending.id,
        () => this.fulfillDraft(author, credentials, input, pending.id),
        (message) => this.prisma.providerOrder.update({ where: { id: pending.id }, data: { status: "FAILED", errorMessage: message } })
      );
      return pendingCheckoutResponse(
        pending.id,
        input.items,
        "El pedido se está creando en Solution Box. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(author, credentials, input);
  }

  approveDraft(author: OrderAuthor, credentials: Record<string, string>, input: SolutionBoxCartItems, orderId: string) {
    return this.fulfillDraft(author, credentials, input, orderId);
  }

  private async fulfillDraft(
    author: OrderAuthor,
    credentials: Record<string, string>,
    input: SolutionBoxCartItems,
    existingId?: string
  ) {
    const api = await SolutionBoxWebClient.login(credentials);
    const q = await this.quote(author.tenantId, api, input);
    const preview = this.publicPreview(input, q, api.customer);
    const c = api.customer;
    const body = {
      precompra: q.proforma.raw,
      cliente: {
        ID_CLIENTE: c.customerId,
        name_: c.name,
        lastname: c.lastName,
        email: c.email,
        dni: c.cuit,
        telefono: c.phone,
        calle: c.billingAddress.street,
        numero: "1",
        localidad: c.billingAddress.city,
        codigoPostal: c.billingAddress.postalCode,
      },
    };

    let res: { status: number; data: unknown };
    try {
      res = await api.post("/checkout/pedido/success", body);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.save(author, existingId, input, preview, q.proforma, { status: "FAILED", errorMessage: message.slice(0, 500) });
      throw new BadGatewayException(message);
    }
    const orderNumber = res.status < 300 ? orderNumberFrom(res.data) : null;
    if (!orderNumber) {
      const detail = typeof res.data === "string" ? res.data : JSON.stringify(res.data ?? "");
      const message = res.status >= 300
        ? `Solution Box no aceptó el pedido (HTTP ${res.status}): ${detail.slice(0, 300)}`
        : `Solution Box respondió sin número de pedido: ${detail.slice(0, 300)}`;
      const record = await this.save(author, existingId, input, preview, q.proforma, {
        status: res.status < 300 ? "CREATED" : "FAILED",
        errorMessage: message.slice(0, 500),
        raw: res.data,
      });
      if (res.status >= 300) throw new BadGatewayException(message);
      return this.result(record, preview, "Pedido enviado a Solution Box. Revisá el número en tu cuenta de solutionbox.com.ar.");
    }
    const record = await this.save(author, existingId, input, preview, q.proforma, {
      status: "CREATED",
      orderNumber,
      raw: res.data,
    });
    return this.result(record, preview, `Pedido ${orderNumber} creado en Solution Box. Queda en tu cuenta de solutionbox.com.ar.`);
  }

  private async save(
    author: OrderAuthor,
    existingId: string | undefined,
    input: SolutionBoxCartItems,
    preview: ReturnType<SolutionBoxOrderService["publicPreview"]>,
    proforma: SolutionBoxProforma,
    outcome: { status: string; orderNumber?: string | null; errorMessage?: string | null; raw?: unknown }
  ) {
    const data = {
      status: outcome.status,
      invidOrderNumber: outcome.orderNumber ?? null,
      invidWebOrderNumber: outcome.orderNumber ?? null,
      paymentOption: preview.paymentCondition ?? "",
      paymentLabel: preview.paymentLabel,
      deliveryOption: preview.deliveryType,
      deliveryLabel: preview.deliveryLabel,
      subtotal: preview.subtotal,
      impuestos: preview.vat + preview.internalTax + preview.perceptions,
      percepciones: preview.perceptions,
      total: preview.total,
      errorMessage: outcome.errorMessage ?? null,
      items: snapshotJson(preview.items),
      addressSnapshot: snapshotJson({
        deliveryAddress: preview.deliveryAddress,
        exchange: preview.exchange,
        totalArs: preview.totalArs,
        vat: preview.vat,
        perceptions: preview.perceptions,
        perceptionLines: preview.perceptionLines,
        proformaNumber: proforma.number,
        raw: outcome.raw ?? null,
      }),
    };
    return existingId
      ? this.prisma.providerOrder.update({ where: { id: existingId }, data })
      : this.prisma.providerOrder.create({ data: { ...orderOwner(author), provider: "SOLUTION_BOX", ...data } });
  }

  private result(
    record: { id: string; status: string; invidOrderNumber: string | null; invidWebOrderNumber: string | null; paymentLabel: string | null; deliveryLabel: string | null; total: unknown },
    preview: ReturnType<SolutionBoxOrderService["publicPreview"]>,
    message: string
  ) {
    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: preview.items,
      total: record.total,
      message,
    };
  }
}

/** El sitio navega a /success con la respuesta; se busca el número de pedido en lo que venga. */
export function orderNumberFrom(data: unknown): string | null {
  const rec = asRecord(data);
  if (!rec) {
    if (typeof data === "number") return String(data);
    if (typeof data === "string" && /^\d{3,}$/.test(data.trim())) return data.trim();
    return null;
  }
  const candidates = [
    rec.Pedido_Nro, rec.Numero, rec.numero, rec.pedido, rec.Pedido, rec.nroPedido, rec.orderNumber, rec.id,
    asRecord(rec.pedido)?.Pedido_Nro, asRecord(rec.pedido)?.Numero, asRecord(rec.data)?.Pedido_Nro, asRecord(rec.data)?.Numero,
  ];
  for (const c of candidates) {
    const n = asNumber(c);
    if (n != null && n > 0) return String(Math.trunc(n));
    const s = asString(c)?.trim();
    if (s && /^\d{3,}(\/\d{2})?$/.test(s)) return s;
  }
  return null;
}
