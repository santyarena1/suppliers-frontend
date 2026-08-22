import { BadGatewayException, BadRequestException, Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { GrupoNucleoApiClient } from "./grupo-nucleo-client";
import { asNumber, asRecord, asString, snapshotJson, unwrapList } from "./json-value";
import { mapProviderDraft, pendingCheckoutResponse, runBackgroundDraft } from "./provider-draft";
import { GN_DOC_TYPES, GN_PROVINCE_CODES } from "./dto/grupo-nucleo-checkout.dto";

export const GN_PROVINCES: { value: number; label: string }[] = [
  { value: 0, label: "CABA" },
  { value: 1, label: "Buenos Aires" },
  { value: 2, label: "Catamarca" },
  { value: 3, label: "Córdoba" },
  { value: 4, label: "Corrientes" },
  { value: 5, label: "Entre Ríos" },
  { value: 6, label: "Jujuy" },
  { value: 7, label: "Mendoza" },
  { value: 8, label: "La Rioja" },
  { value: 9, label: "Salta" },
  { value: 10, label: "San Juan" },
  { value: 11, label: "San Luis" },
  { value: 12, label: "Santa Fe" },
  { value: 13, label: "Santiago del Estero" },
  { value: 14, label: "Tucumán" },
  { value: 16, label: "Chaco" },
  { value: 17, label: "Chubut" },
  { value: 18, label: "Formosa" },
  { value: 19, label: "Misiones" },
  { value: 20, label: "Neuquén" },
  { value: 21, label: "La Pampa" },
  { value: 22, label: "Río Negro" },
  { value: 23, label: "Santa Cruz" },
  { value: 24, label: "Tierra del Fuego" },
];

export const GN_DOCUMENT_TYPES: { value: number; label: string }[] = [
  { value: 80, label: "CUIT" },
  { value: 86, label: "CUIL" },
  { value: 96, label: "DNI" },
];

export interface GnCartItem {
  code: string;
  qty: number;
  name?: string;
}

export interface GnCustomer {
  nombre: string;
  documento: string;
  tipoDocumento: number;
  direccion: string;
  codigoPostal: string;
  ciudad: string;
  codProvincia: number;
  email: string;
  tel: string;
}

export interface GnDraftInput {
  items: GnCartItem[];
  notes?: string;
  customerSale?: boolean;
  customer?: GnCustomer;
  background?: boolean;
}

export interface GnTax {
  desc: string;
  percent: number;
}

export interface GnPreviewItem {
  code: string;
  qty: number;
  name: string;
  priceUsd: number;
  taxes: GnTax[];
  taxPercent: number;
  stockMdp: number;
  stockCaba: number;
  stock: number;
  stockOk: boolean;
}

export interface GnSalePedido {
  pedido: string;
  centroDistribucion: string;
  articulos: { item_id: string; qty: number; precioNeto: number; moneda: string }[];
}

function sumTaxPercent(taxes: GnTax[]): number {
  return taxes.reduce((s, t) => s + (Number.isFinite(t.percent) ? t.percent : 0), 0);
}

function mapTaxes(raw: unknown): GnTax[] {
  return unwrapList(raw).map((row) => {
    const rec = asRecord(row) ?? {};
    return {
      desc: asString(rec.imp_desc) || asString(rec.desc) || "Impuesto",
      percent: asNumber(rec.imp_porcentaje) ?? asNumber(rec.percent) ?? 0,
    };
  }).filter((t) => t.percent !== 0 || t.desc !== "Impuesto");
}

function mapPreviewItem(raw: unknown, requested: GnCartItem): GnPreviewItem {
  const rec = asRecord(raw) ?? {};
  const code = asString(rec.item_id) || requested.code;
  const qty = requested.qty;
  const priceUsd = asNumber(rec.precioNeto_USD) ?? 0;
  const taxes = mapTaxes(rec.impuestos);
  const stockMdp = asNumber(rec.stock_mdp) ?? 0;
  const stockCaba = asNumber(rec.stock_caba) ?? 0;
  const stock = stockMdp + stockCaba;
  return {
    code,
    qty,
    name: requested.name || code,
    priceUsd,
    taxes,
    taxPercent: sumTaxPercent(taxes),
    stockMdp,
    stockCaba,
    stock,
    stockOk: stock >= qty,
  };
}

function mapSaleResponse(body: unknown): {
  error: number;
  errorDesc: string;
  pedidos: GnSalePedido[];
  faltantes: unknown[];
  idClienteGN?: number;
} {
  const rec = asRecord(body) ?? {};
  const pedidos = unwrapList(rec.pedidos).map((row) => {
    const p = asRecord(row) ?? {};
    const articulos = unwrapList(p.articulos).map((art) => {
      const a = asRecord(art) ?? {};
      return {
        item_id: asString(a.item_id) || "",
        qty: asNumber(a.item_qty) ?? 0,
        precioNeto: asNumber(a.precioNeto) ?? 0,
        moneda: asString(a.moneda) || "ARS",
      };
    });
    return {
      pedido: asString(p.pedido) || "",
      centroDistribucion: asString(p.centroDistribucion) || "",
      articulos,
    };
  });
  return {
    error: asNumber(rec.error) ?? -1,
    errorDesc: asString(rec.error_desc) || asString(rec.errorDesc) || "",
    pedidos,
    faltantes: unwrapList(rec.faltantes),
    idClienteGN: asNumber(rec.idClienteGN),
  };
}

function arsFromUsd(usd: number, fx: number): number {
  return Math.ceil(usd * fx * 100) / 100;
}

/**
 * Pedidos de Grupo Núcleo contra la API oficial:
 * POST /API_V1/CheckoutConfirm (preview stock/precio) y
 * POST /API_V1_SSO/NewSelfSaleOrder (a mi nombre) o
 * POST /API_V1_CSO/NewCustomerSaleOrder (factura al cliente final).
 * La API no documenta historial ni cta cte.
 */
@Injectable()
export class GrupoNucleoOrderService {
  private readonly logger = new Logger(GrupoNucleoOrderService.name);

  constructor(private readonly prisma: PrismaService) {}

  checkoutOptions() {
    return {
      documentTypes: GN_DOCUMENT_TYPES,
      provinces: GN_PROVINCES,
      note:
        "Grupo Núcleo crea un pedido por centro de distribución. El envío se pacta aparte (retiro en CD o ítem de flete acordado). La API no cotiza flete.",
    };
  }

  async listDrafts(userId: string) {
    const rows = await this.prisma.providerOrder.findMany({
      where: { userId, provider: "GRUPO_NUCLEO" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return rows.map(mapProviderDraft);
  }

  async getDraft(userId: string, id: string) {
    const row = await this.prisma.providerOrder.findFirst({
      where: { id, userId, provider: "GRUPO_NUCLEO" },
    });
    return row ? mapProviderDraft(row) : null;
  }

  /** La API de GN no expone pedidos históricos ni cta cte — devolvemos copias de Nodo. */
  async getAccount(userId: string) {
    const drafts = await this.listDrafts(userId);
    return {
      orders: [],
      movements: [],
      balance: null,
      drafts,
      note:
        "La API de Grupo Núcleo no publica historial de pedidos ni cuenta corriente. Acá están solo los pedidos creados desde Nodo. No hay descarga de factura; la API solo permite informar una etiqueta con POST /API_V1/UpdateSaleOrderDeliveryLabel.",
    };
  }

  private itemIds(items: GnCartItem[]): number[] {
    if (items.length === 0) throw new BadRequestException("No hay productos de Grupo Núcleo en el pedido");
    return items.map((it) => {
      const id = Number(it.code);
      if (!Number.isInteger(id) || id <= 0) {
        throw new BadRequestException(`item_id inválido para Grupo Núcleo: ${it.code}`);
      }
      return id;
    });
  }

  async preview(credentials: Record<string, string>, input: GnDraftInput) {
    const api = await GrupoNucleoApiClient.login(credentials);
    const ids = this.itemIds(input.items);
    const [confirmRaw, fxRaw] = await Promise.all([
      api.post("API_V1/CheckoutConfirm", ids),
      api.get("API_V1/GetUSDExchange").catch(() => null),
    ]);
    const confirmed = unwrapList(confirmRaw);
    const byId = new Map<string, unknown>();
    for (const row of confirmed) {
      const rec = asRecord(row);
      const id = asString(rec?.item_id);
      if (id) byId.set(id, row);
    }
    const items = input.items.map((req) => {
      const row = byId.get(req.code);
      if (!row) {
        return {
          code: req.code,
          qty: req.qty,
          name: req.name || req.code,
          priceUsd: 0,
          taxes: [] as GnTax[],
          taxPercent: 0,
          stockMdp: 0,
          stockCaba: 0,
          stock: 0,
          stockOk: false,
        };
      }
      return mapPreviewItem(row, req);
    });
    const fx = asNumber(asRecord(fxRaw)?.cotizacionUSD);
    const subtotalUsd = items.reduce((s, it) => s + it.priceUsd * it.qty, 0);
    const stockOk = items.every((it) => it.stockOk);
    return {
      items,
      stockOk,
      usdExchange: fx ?? null,
      subtotalUsd,
      subtotalArs: fx != null ? arsFromUsd(subtotalUsd, fx) : null,
      customerSale: Boolean(input.customerSale),
      note: input.customerSale
        ? "Al confirmar, la factura sale a nombre del cliente final (NewCustomerSaleOrder). El precio ARS no puede ser menor al catálogo."
        : "Al confirmar se crea el pedido a tu nombre (NewSelfSaleOrder), un pedido por centro de distribución. El envío se pacta con GN aparte.",
    };
  }

  async submitDraft(userId: string, credentials: Record<string, string>, input: GnDraftInput) {
    if (input.customerSale) this.assertCustomer(input.customer);
    if (input.background) {
      const pending = await this.prisma.providerOrder.create({
        data: {
          userId,
          provider: "GRUPO_NUCLEO",
          status: "PENDING",
          paymentOption: input.customerSale ? "customer" : "self",
          paymentLabel: input.customerSale ? "Factura al cliente final" : "A mi nombre",
          deliveryOption: "warehouse",
          notes: input.notes,
          items: snapshotJson(input.items),
          addressSnapshot: snapshotJson({ customerSale: Boolean(input.customerSale), customer: input.customer ?? null }),
        },
      });
      runBackgroundDraft(
        this.logger,
        "GrupoNucleo draft background",
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
        "El pedido se está creando en Grupo Núcleo. Podés seguir usando Nodo; el resultado aparece en el historial."
      );
    }
    return this.fulfillDraft(userId, credentials, input);
  }

  private async fulfillDraft(
    userId: string,
    credentials: Record<string, string>,
    input: GnDraftInput,
    existingId?: string
  ) {
    const preview = await this.preview(credentials, input);
    const api = await GrupoNucleoApiClient.login(credentials);
    const customerSale = Boolean(input.customerSale);
    if (customerSale) {
      this.assertCustomer(input.customer);
    }

    const notes = (input.notes ?? "").trim();
    let raw: unknown;
    try {
      if (customerSale && input.customer) {
        const fx = preview.usdExchange;
        if (fx == null || fx <= 0) {
          throw new BadRequestException("Grupo Núcleo no devolvió cotización USD; no se puede armar el precio ARS del cliente final");
        }
        raw = await api.post("API_V1_CSO/NewCustomerSaleOrder", {
          nota: notes || "Pedido Nodo",
          cliente: {
            nombre: input.customer.nombre,
            documento: input.customer.documento.replace(/\D/g, ""),
            tipoDocumento: input.customer.tipoDocumento,
            direccion: input.customer.direccion,
            codigoPostal: input.customer.codigoPostal,
            ciudad: input.customer.ciudad,
            codProvincia: input.customer.codProvincia,
            email: input.customer.email,
            tel: input.customer.tel,
          },
          items: preview.items.map((it) => ({
            item_id: Number(it.code),
            item_qty: it.qty,
            item_price: arsFromUsd(it.priceUsd, fx),
          })),
        });
      } else {
        raw = await api.post("API_V1_SSO/NewSelfSaleOrder", {
          nota: notes || "Pedido Nodo",
          items: preview.items.map((it) => ({
            item_id: Number(it.code),
            item_qty: it.qty,
          })),
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const record = await this.saveOrder(userId, {
        status: "FAILED",
        input,
        preview,
        customerSale,
        raw: null,
        errorMessage: message,
        existingId,
      });
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en Grupo Núcleo");
    }

    const parsed = mapSaleResponse(raw);
    const created = parsed.error === 0 && parsed.pedidos.some((p) => p.pedido);
    const orderNumbers = parsed.pedidos.map((p) => p.pedido).filter(Boolean);
    const warehouses = parsed.pedidos.map((p) => p.centroDistribucion).filter(Boolean);
    const record = await this.saveOrder(userId, {
      status: created ? "CREATED" : "FAILED",
      input,
      preview,
      customerSale,
      raw: parsed,
      errorMessage: created
        ? (parsed.faltantes.length > 0 ? `Faltantes: ${JSON.stringify(parsed.faltantes).slice(0, 300)}` : null)
        : parsed.errorDesc || "Grupo Núcleo no creó el pedido",
      existingId,
    });

    if (!created) {
      throw new BadGatewayException(record.errorMessage || "No se pudo crear el pedido en Grupo Núcleo");
    }

    return {
      id: record.id,
      status: record.status,
      orderNumber: orderNumbers[0] ?? null,
      webOrderNumber: orderNumbers.join(", ") || null,
      paymentLabel: customerSale ? "Factura al cliente final" : "A mi nombre",
      deliveryLabel: warehouses.join(" · ") || "Centro de distribución GN",
      items: preview.items,
      total: preview.subtotalUsd,
      pedidos: parsed.pedidos,
      faltantes: parsed.faltantes,
      message: customerSale
        ? `Pedido creado en Grupo Núcleo a nombre del cliente final${orderNumbers.length ? `: ${orderNumbers.join(", ")}` : ""}.`
        : `Pedido creado en Grupo Núcleo a tu nombre${orderNumbers.length ? `: ${orderNumbers.join(", ")}` : ""}. El envío se pacta con GN.`,
    };
  }

  private assertCustomer(customer: GnCustomer | undefined): asserts customer is GnCustomer {
    if (!customer) throw new BadRequestException("Completá los datos del cliente final");
    if (!GN_DOC_TYPES.includes(customer.tipoDocumento as typeof GN_DOC_TYPES[number])) {
      throw new BadRequestException("tipoDocumento de AFIP inválido (80 CUIT, 86 CUIL, 96 DNI)");
    }
    if (!GN_PROVINCE_CODES.includes(customer.codProvincia as typeof GN_PROVINCE_CODES[number])) {
      throw new BadRequestException("codProvincia de AFIP inválido");
    }
    if (!customer.documento.replace(/\D/g, "")) {
      throw new BadRequestException("El documento del cliente final es obligatorio");
    }
  }

  private saveOrder(
    userId: string,
    opts: {
      status: string;
      input: GnDraftInput;
      preview: Awaited<ReturnType<GrupoNucleoOrderService["preview"]>>;
      customerSale: boolean;
      raw: unknown;
      errorMessage: string | null;
      existingId?: string;
    }
  ) {
    const orderNumbers = asRecord(opts.raw) && Array.isArray((opts.raw as { pedidos?: { pedido?: string }[] }).pedidos)
      ? ((opts.raw as { pedidos: { pedido?: string }[] }).pedidos.map((p) => p.pedido).filter(Boolean) as string[])
      : [];
    const warehouses = asRecord(opts.raw) && Array.isArray((opts.raw as { pedidos?: { centroDistribucion?: string }[] }).pedidos)
      ? ((opts.raw as { pedidos: { centroDistribucion?: string }[] }).pedidos.map((p) => p.centroDistribucion).filter(Boolean) as string[])
      : [];
    const data = {
      status: opts.status,
      invidOrderNumber: orderNumbers[0] ?? null,
      invidWebOrderNumber: orderNumbers.join(", ") || null,
      paymentOption: opts.customerSale ? "customer" : "self",
      paymentLabel: opts.customerSale ? "Factura al cliente final" : "A mi nombre",
      deliveryOption: "warehouse",
      deliveryLabel: warehouses.join(" · ") || "Centro de distribución GN",
      notes: opts.input.notes,
      subtotal: opts.preview.subtotalUsd,
      total: opts.preview.subtotalUsd,
      errorMessage: opts.errorMessage,
      items: snapshotJson(opts.preview.items),
      addressSnapshot: snapshotJson({
        customerSale: opts.customerSale,
        customer: opts.input.customer ?? null,
        usdExchange: opts.preview.usdExchange,
        raw: opts.raw,
      }),
    };
    if (opts.existingId) {
      return this.prisma.providerOrder.update({
        where: { id: opts.existingId },
        data,
      });
    }
    return this.prisma.providerOrder.create({
      data: {
        userId,
        provider: "GRUPO_NUCLEO",
        ...data,
      },
    });
  }
}
