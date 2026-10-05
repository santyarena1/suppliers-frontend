import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { API_ERROR_CODES } from "../../core/api-error";

/**
 * Esquemas de respuesta de /v1 para el documento OpenAPI. Son solo
 * documentación: las respuestas las arman core/projection.ts y los servicios.
 */

export class TaxSchema {
  @ApiProperty({ enum: ["iva", "internal", "perception", "other"], example: "iva" })
  type!: string;
  @ApiProperty({ example: "IVA" })
  label!: string;
  @ApiProperty({ nullable: true, example: 10.5, description: "Alícuota en puntos. `null` si el distribuidor mandó un monto fijo." })
  percent!: number | null;
  @ApiProperty({ example: 31.5, description: "Monto unitario en la moneda de la respuesta." })
  amount!: number;
  @ApiPropertyOptional({ description: "No vino del distribuidor: es la alícuota habitual de tu cuenta." })
  estimated?: boolean;
}

export class CostSchema {
  @ApiProperty({ example: 300, description: "Neto que cobra el distribuidor (con tu descuento de lista, sin margen)." })
  net!: number;
  @ApiPropertyOptional({ type: [TaxSchema] })
  taxes?: TaxSchema[];
  @ApiProperty({ example: 340.5, description: "Lo que te cuesta: neto + impuestos + percepciones." })
  gross!: number;
}

export class SaleSchema {
  @ApiProperty({ example: 360, description: "Neto con tu margen." })
  net!: number;
  @ApiPropertyOptional({ type: [TaxSchema], description: "IVA e internos sobre el neto de venta. Las percepciones no se trasladan." })
  taxes?: TaxSchema[];
  @ApiProperty({ example: 397.8, description: "Precio de venta final (con el redondeo de la key)." })
  gross!: number;
  @ApiProperty({ example: 20 })
  markupPercent!: number;
}

export class PriceSchema {
  @ApiProperty({ enum: ["USD", "ARS"], example: "USD" })
  currency!: string;
  @ApiPropertyOptional({ type: CostSchema })
  cost?: CostSchema;
  @ApiPropertyOptional({ type: SaleSchema })
  sale?: SaleSchema;
  @ApiProperty({ enum: ["api", "list", "base_list"], description: "De dónde sale el precio: integración con el distribuidor, tu lista o la lista base del distribuidor." })
  listSource!: string;
}

export class ProviderRefSchema {
  @ApiProperty({ example: "prv_3kT9xQ2mWvLp0aZr", description: "Id estable del distribuidor para esta organización." })
  id!: string;
  @ApiProperty({ example: "Proveedor 2", description: "Alias si la key oculta la identidad; si no, el nombre real." })
  name!: string;
  @ApiPropertyOptional({ example: "ELIT", description: "Solo con identidad visible." })
  key?: string;
}

export class StockSchema {
  @ApiProperty({ nullable: true, example: 12, description: "`null` = el distribuidor no informa cantidad (hay stock)." })
  quantity!: number | null;
  @ApiProperty({ enum: ["in_stock", "low", "out_of_stock", "unknown"] })
  status!: string;
  @ApiProperty({ example: 2, description: "Tu umbral: con esta cantidad o menos se informa 0." })
  minThresholdApplied!: number;
}

export class FreshnessSchema {
  @ApiProperty({ example: "2026-10-05T12:31:08.000Z", description: "Última vez que se sincronizó esta oferta." })
  syncedAt!: string;
  @ApiProperty({ example: false, description: "`true` si la sincronización de este distribuidor está atrasada." })
  stale!: boolean;
  @ApiProperty({ enum: ["ok", "paused", "error"], description: "Estado de la sincronización del distribuidor." })
  providerSync!: string;
}

export class RefSchema {
  @ApiProperty({ example: "brd_9fK2LqP0aZxT" })
  id!: string;
  @ApiProperty({ example: "ASUS" })
  name!: string;
}

export class CategoryRefSchema extends RefSchema {
  @ApiProperty({ type: [String], example: ["Placas de video"] })
  path!: string[];
}

export class ProductSummarySchema {
  @ApiProperty({ example: "Placa de video ASUS Dual GeForce RTX 4060 OC 8GB" })
  name!: string;
  @ApiProperty({ type: RefSchema, nullable: true })
  brand!: RefSchema | null;
  @ApiProperty({ type: CategoryRefSchema, nullable: true })
  category!: CategoryRefSchema | null;
  @ApiProperty({ nullable: true, example: "4711081976386" })
  ean!: string | null;
  @ApiProperty({ nullable: true, example: "DUAL-RTX4060-O8G" })
  partNumber!: string | null;
  @ApiProperty({ nullable: true, description: "Foto principal." })
  imageUrl!: string | null;
  @ApiProperty({ type: [String], description: "Todas las fotos del producto: la principal primero y después la galería del distribuidor." })
  images!: string[];
}

export class OfferSchema {
  @ApiProperty({ example: "off_7Hq2Zk9LmXwR4tNc1aBv0e" })
  id!: string;
  @ApiProperty({ example: "prd_2Lk9QwE5rTyU8iOp3aSd7f" })
  productId!: string;
  @ApiProperty({ type: ProviderRefSchema })
  provider!: ProviderRefSchema;
  @ApiProperty({ nullable: true, example: "90YV0JC0-M0NA00" })
  sku!: string | null;
  @ApiPropertyOptional({ description: "Código del producto en el distribuidor. Solo con identidad visible." })
  externalId?: string;
  @ApiProperty({ type: StockSchema })
  stock!: StockSchema;
  @ApiProperty({ type: PriceSchema, nullable: true })
  price!: PriceSchema | null;
  @ApiProperty({ type: FreshnessSchema })
  freshness!: FreshnessSchema;
  @ApiProperty({ example: "2026-10-05T12:31:08.000Z" })
  updatedAt!: string;
  @ApiPropertyOptional({ type: ProductSummarySchema, description: "Solo en /v1/offers: los datos básicos del producto." })
  product?: ProductSummarySchema;
}

export class ImageSchema {
  @ApiProperty()
  url!: string;
  @ApiProperty({ enum: ["provider", "ai_suggested"], description: "`ai_suggested`: la eligió la búsqueda de imágenes de NODO." })
  source!: string;
}

export class SpecsSchema {
  @ApiProperty({ nullable: true, example: "36 meses" })
  warranty!: string | null;
  @ApiProperty({ nullable: true, example: { value: 1.2, unit: "kg" } })
  weight!: { value: number; unit: string | null } | null;
  @ApiProperty({ nullable: true, example: { height: 4, width: 12, length: 23, unit: "cm" } })
  dimensions!: { height: number | null; width: number | null; length: number | null; unit: string | null } | null;
  @ApiProperty({ nullable: true })
  volume!: number | null;
}

export class AvailabilitySchema {
  @ApiProperty()
  inStock!: boolean;
  @ApiProperty({ nullable: true, example: 34 })
  totalStock!: number | null;
  @ApiProperty({ example: 3 })
  offers!: number;
}

export class PriceRangeSchema {
  @ApiProperty() min!: number;
  @ApiProperty() max!: number;
  @ApiProperty({ example: "USD" }) currency!: string;
}

export class ProductSchema {
  @ApiProperty({ example: "prd_2Lk9QwE5rTyU8iOp3aSd7f", description: "Mismo producto en varios distribuidores = un id (por EAN o marca + part number)." })
  id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ type: RefSchema, nullable: true }) brand!: RefSchema | null;
  @ApiProperty({ type: CategoryRefSchema, nullable: true }) category!: CategoryRefSchema | null;
  @ApiProperty({ type: CategoryRefSchema, nullable: true }) subcategory!: CategoryRefSchema | null;
  @ApiProperty({ nullable: true }) ean!: string | null;
  @ApiProperty({ nullable: true }) partNumber!: string | null;
  @ApiProperty({ nullable: true }) sku!: string | null;
  @ApiProperty({ nullable: true }) description!: string | null;
  @ApiProperty({ nullable: true }) longDescription!: string | null;
  @ApiProperty({ type: [ImageSchema] }) images!: ImageSchema[];
  @ApiProperty({ type: SpecsSchema }) specs!: SpecsSchema;
  @ApiProperty({ type: [String] }) tags!: string[];
  @ApiProperty({ example: { provider: [] }, description: "Links a la ficha del distribuidor (solo con identidad visible)." })
  links!: { provider: string[] };
  @ApiProperty({ type: AvailabilitySchema }) availability!: AvailabilitySchema;
  @ApiProperty({ type: OfferSchema, nullable: true, description: "Con stock primero y después la más barata." })
  bestOffer!: OfferSchema | null;
  @ApiProperty({ type: PriceRangeSchema, nullable: true }) priceRange!: PriceRangeSchema | null;
  @ApiProperty({ type: [OfferSchema] }) offers!: OfferSchema[];
  @ApiProperty() updatedAt!: string;
}

export class PaginationSchema {
  @ApiProperty({ nullable: true, description: "Pasalo como `cursor` para la página siguiente. `null` = no hay más." })
  nextCursor!: string | null;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty({ example: 100 }) limit!: number;
}

export class FxSchema {
  @ApiProperty({ enum: ["oficial", "blue", "mep", "tarjeta", "fixed"] }) source!: string;
  @ApiProperty({ nullable: true, example: 1450.5, description: "Pesos por dólar (venta)." }) rate!: number | null;
  @ApiProperty({ nullable: true }) at!: string | null;
  @ApiProperty({ description: "`true` si la fuente no responde y se usa la última cotización buena." }) stale!: boolean;
}

export class MetaSchema {
  @ApiProperty({ enum: ["USD", "ARS"] }) currency!: string;
  @ApiProperty({ type: FxSchema }) fx!: FxSchema;
  @ApiProperty() generatedAt!: string;
  @ApiProperty({ description: "Cuándo se armó la foto del catálogo que se está leyendo." }) catalogAt!: string;
}

export class ProductListSchema {
  @ApiProperty({ type: [ProductSchema] }) data!: ProductSchema[];
  @ApiProperty({ type: PaginationSchema }) pagination!: PaginationSchema;
  @ApiProperty({ type: MetaSchema }) meta!: MetaSchema;
}

export class OfferListSchema {
  @ApiProperty({ type: [OfferSchema] }) data!: OfferSchema[];
  @ApiProperty({ type: PaginationSchema }) pagination!: PaginationSchema;
  @ApiProperty({ type: MetaSchema }) meta!: MetaSchema;
}

export class ProductDetailSchema {
  @ApiProperty({ type: ProductSchema }) data!: ProductSchema;
  @ApiProperty({ type: MetaSchema }) meta!: MetaSchema;
}

export class OfferDetailSchema {
  @ApiProperty({ type: OfferSchema }) data!: OfferSchema;
  @ApiProperty({ type: MetaSchema }) meta!: MetaSchema;
}

export class ErrorBodySchema {
  @ApiProperty({ enum: API_ERROR_CODES, example: "invalid_credentials", description: "Código estable para manejar el error en tu sistema." }) code!: string;
  @ApiProperty({ example: "Faltan credenciales o no son válidas." }) message!: string;
  @ApiProperty({ example: "req_4fK9Lm2QwErT8yUi" }) requestId!: string;
  @ApiProperty({ example: "https://nodohub.app/developers#errores" }) docs!: string;
  @ApiPropertyOptional({ type: Object }) details?: Record<string, unknown>;
}

export class ErrorSchema {
  @ApiProperty({ type: ErrorBodySchema }) error!: ErrorBodySchema;
}

export class ChangeSchema {
  @ApiProperty({ example: "18342" }) id!: string;
  @ApiProperty({ enum: ["offer.created", "offer.updated", "offer.removed", "provider.sync_paused", "provider.sync_resumed"] }) type!: string;
  @ApiProperty() at!: string;
  @ApiPropertyOptional({ type: [String], example: ["price", "stock"], description: "En offer.updated: qué cambió (`price`, `stock`, `product`)." })
  changed?: string[];
  @ApiPropertyOptional() offerId?: string;
  @ApiPropertyOptional() productId?: string;
  @ApiPropertyOptional({ type: OfferSchema, description: "La oferta como la ves ahora (created/updated)." }) offer?: OfferSchema;
  @ApiPropertyOptional({ type: ProviderRefSchema }) provider?: ProviderRefSchema;
}

export class ChangesPaginationSchema {
  @ApiProperty({ description: "Guardalo y usalo en la próxima consulta. Siempre viene, aunque no haya cambios." }) nextCursor!: string;
  @ApiProperty() hasMore!: boolean;
  @ApiProperty() limit!: number;
}

export class ChangesSchema {
  @ApiProperty({ type: [ChangeSchema] }) data!: ChangeSchema[];
  @ApiProperty({ type: ChangesPaginationSchema }) pagination!: ChangesPaginationSchema;
  @ApiProperty({ type: Object }) meta!: Record<string, unknown>;
}

export class CountedRefSchema extends RefSchema {
  @ApiProperty({ example: 152, description: "Productos (agrupados) visibles para la key." }) products!: number;
}

export class CategoryNodeSchema extends CountedRefSchema {
  @ApiProperty({ type: [CountedRefSchema] }) subcategories!: CountedRefSchema[];
}

export class BrandsSchema {
  @ApiProperty({ type: [CountedRefSchema] }) data!: CountedRefSchema[];
}

export class CategoriesSchema {
  @ApiProperty({ type: [CategoryNodeSchema] }) data!: CategoryNodeSchema[];
}

export class ProviderStatusSchema extends ProviderRefSchema {
  @ApiProperty({ example: 1834, description: "Ofertas visibles para la key." }) offers!: number;
  @ApiProperty({ nullable: true }) lastSyncedAt!: string | null;
  @ApiProperty({ enum: ["ok", "paused", "error"] }) status!: string;
  @ApiProperty() stale!: boolean;
}

export class ProvidersSchema {
  @ApiProperty({ type: [ProviderStatusSchema] }) data!: ProviderStatusSchema[];
}

export class PriceHistoryPointSchema {
  @ApiProperty() at!: string;
  @ApiProperty({ nullable: true, description: "Costo neto en la moneda de la key (convertido a la cotización de hoy)." }) costNet!: number | null;
  @ApiProperty({ nullable: true, description: "Neto con el margen actual." }) saleNet!: number | null;
}

export class PriceHistorySchema {
  @ApiProperty({ type: [PriceHistoryPointSchema] }) data!: PriceHistoryPointSchema[];
  @ApiProperty({ type: MetaSchema }) meta!: MetaSchema;
}

export class MeSchema {
  @ApiProperty({ example: { id: "…", name: "Tienda online", publicKey: "nodo_pk_…", scopes: ["catalog:read"], rateLimitPerMinute: 120, createdAt: "…", expiresAt: null } })
  key!: Record<string, unknown>;
  @ApiProperty({ example: { name: "Mi comercio", plan: "PRO" } }) organization!: Record<string, unknown>;
  @ApiProperty({ type: Object, description: "Config efectiva de la key (con los valores por defecto completos)." }) config!: Record<string, unknown>;
  @ApiProperty({ example: { offers: 18234, products: 9120, providers: 6, catalogAt: "…" } }) catalog!: Record<string, unknown>;
}

export class FxListSchema {
  @ApiProperty({ example: { oficial: 1450.5, blue: 1495, mep: 1480.2, tarjeta: 1885.6 } }) rates!: Record<string, number>;
  @ApiProperty({ nullable: true }) at!: string | null;
  @ApiProperty() stale!: boolean;
  @ApiProperty({ type: FxSchema, description: "La que usa esta key." }) key!: FxSchema;
}

export class WebhookSchema {
  @ApiProperty() id!: string;
  @ApiProperty({ example: "https://mi-tienda.com/webhooks/nodo" }) url!: string;
  @ApiProperty({ type: [String], example: ["price.changed", "stock.changed"] }) events!: string[];
  @ApiProperty() active!: boolean;
  @ApiProperty() consecutiveFailures!: number;
  @ApiProperty({ nullable: true }) disabledAt!: string | null;
  @ApiProperty({ nullable: true }) disabledReason!: string | null;
  @ApiProperty() createdAt!: string;
  @ApiProperty({ type: Object, nullable: true }) lastDelivery!: Record<string, unknown> | null;
}
