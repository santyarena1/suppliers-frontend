import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { mapProviderDraft, pendingCheckoutResponse, runBackgroundDraft } from "./provider-draft";
import {
  ElitWebClient,
  elitData,
  mapElitCartDetails,
} from "./elit-web-client";
import { asNumber, asRecord, asString, snapshotJson, unwrapList } from "./json-value";

export interface ElitCartItems {
  items: { code: string; qty: number; name?: string }[];
  warehouse?: number;
  shippingMethod?: number;
  saleCondition?: number;
  shippingAddress?: string;
  background?: boolean;
}

function publicSummary(summary: Record<string, unknown>, requested: ElitCartItems["items"]) {
  const details = mapElitCartDetails(summary.details, requested);
  const saleConditions = unwrapList(summary.saleConditions).map((row) => {
    const rec = asRecord(row) ?? {};
    return {
      value: asString(rec.code) || "",
      label: asString(rec.name) || asString(rec.code) || "",
      surcharge: asNumber(rec.surcharge) ?? 0,
    };
  }).filter((p) => p.value);
  const warehouses = unwrapList(summary.warehouses).map((row) => {
    const rec = asRecord(row) ?? {};
    return { id: asNumber(rec.warehouse) ?? 0, name: asString(rec.name) || "" };
  }).filter((w) => w.id);
  const shippingMethods = unwrapList(summary.shippingMethods).flatMap((wh) => {
    const wrec = asRecord(wh) ?? {};
    const warehouse = asNumber(wrec.warehouse) ?? 0;
    return unwrapList(wrec.shippings).map((row) => {
      const rec = asRecord(row) ?? {};
      return {
        warehouse,
        warehouseName: asString(wrec.name) || "",
        value: asString(rec.code) || "",
        label: asString(rec.name) || asString(rec.code) || "",
        cost: asNumber(rec.cost) ?? 0,
        selected: rec.selected === true,
      };
    });
  });
  const addresses = unwrapList(summary.shippingAddresses).map((row) => {
    const rec = asRecord(row) ?? {};
    const code = asString(rec.code) || "";
    return {
      code,
      label: asString(rec.address) || code,
      addressLine: [asString(rec.address), asString(rec.city), asString(rec.zipCode)].filter(Boolean).join(", "),
      postalCode: asString(rec.zipCode),
    };
  });
  const total = asRecord(summary.total) ?? {};
  const selectedShip = shippingMethods.find((s) => s.selected) ?? shippingMethods[0];
  return {
    items: details,
    warehouses,
    shippingMethods,
    saleConditions,
    addresses,
    warehouse: warehouses[0]?.id ?? selectedShip?.warehouse ?? null,
    shippingMethod: selectedShip?.value ?? null,
    shippingLabel: selectedShip?.label ?? null,
    shippingCost: selectedShip?.cost ?? 0,
    saleCondition: asString(summary.saleCondition) || saleConditions[0]?.value || null,
    shippingAddress: asString(summary.shippingAddress) || addresses[0]?.code || null,
    subtotal: asNumber(total.subtotal) ?? details.reduce((s, it) => s + it.subtotal, 0),
    vat: asNumber(total.vat) ?? 0,
    internalTax: asNumber(total.internalTax) ?? 0,
    perceptions: asNumber(asRecord(total.perceptions)?.total) ?? 0,
    total: asNumber(total.finalTotal) ?? asNumber(total.total) ?? 0,
    exchange: asNumber(summary.currentExchange) ?? null,
    stockOk: details.length === requested.length,
  };
}

/**
 * Checkout real de Elit (API web autenticada con cookie).
 * No clona Invid/NB: add → option (pago/entrega) → process por depósito.
 */
@Injectable()
export class ElitOrderService {
  private readonly logger = new Logger(ElitOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listDrafts(userId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { userId, provider: "ELIT" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(userId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, userId, provider: "ELIT" },
    });
    return row ? mapProviderDraft(row) : null;
  }

  private async syncCart(api: ElitWebClient, items: ElitCartItems["items"]) {
    if (items.length === 0) throw new BadRequestException("No hay productos de Elit en el pedido");
    const current = elitData<Record<string, unknown>>(await api.getJson("cart"));
    for (const row of unwrapList(current.details)) {
      const rec = asRecord(row) ?? {};
      const code = asNumber(rec.code);
      for (const line of unwrapList(rec.cart)) {
        const warehouse = asNumber(asRecord(line)?.warehouse);
        if (code && warehouse) {
          await api.postJson("cart/update", { code, quantity: 0, warehouse });
        }
      }
    }
    for (const it of items) {
      const code = Number(it.code);
      if (!Number.isFinite(code)) throw new BadRequestException(`Código Elit inválido: ${it.code}`);
      await api.postJson("cart/add", { code, quantity: it.qty });
    }
  }

  private async applyOptions(api: ElitWebClient, input: ElitCartItems, summary: Record<string, unknown>) {
    const pub = publicSummary(summary, input.items);
    const warehouse = input.warehouse ?? pub.warehouse;
    const shippingMethod = input.shippingMethod ?? (pub.shippingMethod ? Number(pub.shippingMethod) : undefined);
    const saleCondition = input.saleCondition ?? (pub.saleCondition ? Number(pub.saleCondition) : undefined);
    const shippingAddress = input.shippingAddress ?? pub.shippingAddress ?? undefined;
    if (warehouse == null) return;
    const body: Record<string, unknown> = {};
    if (shippingMethod != null) {
      body.shippingWarehouse = warehouse;
      body.shippingMethod = shippingMethod;
    } else {
      body.warehouse = warehouse;
    }
    if (saleCondition != null) body.saleCondition = saleCondition;
    if (shippingAddress) body.shippingAddress = shippingAddress;
    await api.postJson("cart/option", body);
  }

  async preview(credentials: Record<string, string>, input: ElitCartItems) {
    const api = await ElitWebClient.login(credentials);
    await this.syncCart(api, input.items);
    let summary = elitData<Record<string, unknown>>(await api.getJson("cart/summary"));
    await this.applyOptions(api, input, summary);
    summary = elitData<Record<string, unknown>>(await api.getJson("cart/summary"));
    return {
      ...publicSummary(summary, input.items),
      note: "Al confirmar, Elit crea una nota de venta en tu cuenta (POST /cart/process por depósito). No se puede deshacer desde Nodo.",
    };
  }

  async submitDraft(userId: string, credentials: Record<string, string>, input: ElitCartItems) {
    if (input.warehouse == null) throw new BadRequestException("Elegí el depósito de Elit");
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          userId,
          provider: "ELIT",
          status: "PENDING",
          paymentOption: String(input.saleCondition ?? ""),
          deliveryOption: String(input.shippingMethod ?? ""),
          items: input.items,
          addressSnapshot: { warehouse: input.warehouse, shippingAddress: input.shippingAddress ?? null },
        },
      });
      runBackgroundDraft(
        this.logger,
        "Elit draft background",
        pending.id,
        () => this.fulfillDraft(userId, credentials, input, pending.id),
        (message) => this.prisma.providerOrder.update({
          where: { id: pending.id },
          data: { status: "FAILED", errorMessage: message },
        })
      );
      return pendingCheckoutResponse(
        pending.id,
        input.items,
        "El pedido se está creando en Elit. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(userId, credentials, input);
  }

  private async fulfillDraft(
    userId: string,
    credentials: Record<string, string>,
    input: ElitCartItems,
    existingId?: string
  ) {
    const preview = await this.preview(credentials, input);
    const api = await ElitWebClient.login(credentials);
    await this.syncCart(api, input.items);
    const summary = elitData<Record<string, unknown>>(await api.getJson("cart/summary"));
    await this.applyOptions(api, input, summary);

    let raw: unknown;
    try {
      raw = await api.postJson("cart/process", { warehouse: input.warehouse });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = {
        status: "FAILED",
        paymentOption: String(preview.saleCondition ?? ""),
        paymentLabel: preview.saleConditions.find((p) => p.value === String(preview.saleCondition))?.label,
        deliveryOption: String(preview.shippingMethod ?? ""),
        deliveryLabel: preview.shippingLabel,
        total: preview.total,
        errorMessage: message.slice(0, 500),
        items: snapshotJson(preview.items),
        addressSnapshot: snapshotJson({ warehouse: input.warehouse, shippingAddress: preview.shippingAddress }),
      };
      const record = existingId
        ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: failed })
        : await this.prisma.providerOrder.create({
            data: { userId, provider: "ELIT", ...failed },
          });
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en Elit");
    }

    const rows = unwrapList(elitData(raw)).length ? unwrapList(elitData(raw)) : unwrapList(raw);
    const first = asRecord(rows[0]) ?? asRecord(elitData(raw)) ?? asRecord(raw) ?? {};
    const orderNumber = asString(first.number) || asString(first.internalNumber);
    const saved = {
      status: orderNumber ? "CREATED" : "FAILED",
      invidOrderNumber: orderNumber ?? null,
      invidWebOrderNumber: asString(first.reference) || asString(first.invoiceNumber) || orderNumber || null,
      paymentOption: String(preview.saleCondition ?? ""),
      paymentLabel: preview.saleConditions.find((p) => p.value === String(preview.saleCondition))?.label,
      deliveryOption: String(preview.shippingMethod ?? ""),
      deliveryLabel: preview.shippingLabel,
      subtotal: preview.subtotal,
      impuestos: preview.vat + preview.internalTax + preview.perceptions,
      total: preview.total,
      errorMessage: orderNumber ? null : "Elit no devolvió número de pedido",
      items: snapshotJson(preview.items),
      addressSnapshot: snapshotJson({ warehouse: input.warehouse, shippingAddress: preview.shippingAddress, raw: first }),
    };
    const record = existingId
      ? await this.prisma.providerOrder.update({ where: { id: existingId }, data: saved })
      : await this.prisma.providerOrder.create({
          data: { userId, provider: "ELIT", ...saved },
        });
    if (!orderNumber) {
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en Elit");
    }
    return {
      id: record.id,
      status: record.status,
      orderNumber: record.invidOrderNumber,
      webOrderNumber: record.invidWebOrderNumber,
      paymentLabel: record.paymentLabel,
      deliveryLabel: record.deliveryLabel,
      items: preview.items,
      total: record.total,
      message: `Pedido ${orderNumber} creado en Elit (${preview.shippingLabel ?? "depósito"}). Queda en tu cuenta de elit.com.ar.`,
    };
  }
}
