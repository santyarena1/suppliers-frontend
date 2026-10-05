import { Controller, Get, Param, Query, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBasicAuth, ApiOkResponse, ApiOperation, ApiParam, ApiResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { ApiScopes, CurrentApiClient, type ApiPrincipal } from "../auth/api-principal";
import { CatalogInfoService } from "../core/catalog-info.service";
import { CatalogQueryService } from "../core/catalog-query.service";
import { ListQueryDto } from "./dto/list-query.dto";
import {
  BrandsSchema,
  CategoriesSchema,
  ErrorSchema,
  FxListSchema,
  MeSchema,
  OfferDetailSchema,
  OfferListSchema,
  PriceHistorySchema,
  ProductDetailSchema,
  ProductListSchema,
  ProvidersSchema,
} from "./dto/schemas";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { V1UsageInterceptor } from "./v1-usage.interceptor";

const PRICE_HISTORY_EMBED = 10;

/** Respuestas de error comunes a todos los endpoints con key. */
export const CommonErrors = () => (target: object, key?: string | symbol, descriptor?: PropertyDescriptor) => {
  for (const [status, description] of [
    [400, "Parámetros inválidos o cursor que no corresponde a la consulta."],
    [401, "Falta la key o el secret, no son válidos, o la key está revocada o vencida."],
    [402, "La API de catálogo no está activa en el plan, o la suscripción está suspendida."],
    [403, "IP no permitida o la key no tiene el permiso necesario."],
    [429, "Límite de pedidos por minuto superado (ver Retry-After)."],
  ] as const) {
    ApiResponse({ status, description, type: ErrorSchema })(target, key as string, descriptor as PropertyDescriptor);
  }
};

@ApiTags("Catálogo")
@ApiSecurity("ApiKey")
@ApiSecurity("ApiSecret")
@ApiBasicAuth("Basic")
@Public()
@SkipEnvelope()
@SkipThrottle()
@UseGuards(ApiKeyGuard)
@UseFilters(V1ExceptionFilter)
@UseInterceptors(V1UsageInterceptor)
@Controller("v1")
export class V1CatalogController {
  constructor(
    private readonly catalog: CatalogQueryService,
    private readonly info: CatalogInfoService
  ) {}

  @Get("me")
  @ApiTags("Cuenta")
  @ApiOperation({ summary: "Datos de la key", description: "Quién sos: la key, su organización, la config efectiva y el tamaño del catálogo que ve. Sirve para probar las credenciales." })
  @ApiOkResponse({ type: MeSchema })
  @CommonErrors()
  me(@CurrentApiClient() principal: ApiPrincipal) {
    return this.info.me(principal);
  }

  @Get("products")
  @ApiScopes("catalog:read")
  @ApiOperation({
    summary: "Listar productos (agrupados)",
    description:
      "Un producto por fila, con todas sus ofertas: el mismo producto en varios distribuidores (mismo EAN, o misma marca y part number) se agrupa. `bestOffer` es la de stock y menor precio. Paginado por cursor.",
  })
  @ApiOkResponse({ type: ProductListSchema })
  @CommonErrors()
  products(@CurrentApiClient() principal: ApiPrincipal, @Query() query: ListQueryDto) {
    return this.catalog.listProducts(principal, query);
  }

  @Get("products/:productId")
  @ApiScopes("catalog:read")
  @ApiOperation({ summary: "Ver un producto", description: "El producto con todas sus ofertas." })
  @ApiParam({ name: "productId", example: "prd_2Lk9QwE5rTyU8iOp3aSd7f" })
  @ApiOkResponse({ type: ProductDetailSchema })
  @ApiResponse({ status: 404, type: ErrorSchema, description: "No existe o no es visible para la key." })
  @CommonErrors()
  product(@CurrentApiClient() principal: ApiPrincipal, @Param("productId") productId: string) {
    return this.catalog.getProduct(principal, productId);
  }

  @Get("offers")
  @ApiScopes("catalog:read")
  @ApiOperation({
    summary: "Listar ofertas",
    description: "Una fila por producto y distribuidor, con los datos básicos del producto. Mismos filtros que /v1/products.",
  })
  @ApiOkResponse({ type: OfferListSchema })
  @CommonErrors()
  offers(@CurrentApiClient() principal: ApiPrincipal, @Query() query: ListQueryDto) {
    return this.catalog.listOffers(principal, query);
  }

  @Get("offers/:offerId")
  @ApiScopes("catalog:read")
  @ApiOperation({
    summary: "Ver una oferta",
    description: "Con `fields.raw` en la key incluye `raw` (datos crudos del distribuidor); con `fields.priceHistory`, los últimos cambios de precio.",
  })
  @ApiParam({ name: "offerId", example: "off_7Hq2Zk9LmXwR4tNc1aBv0e" })
  @ApiOkResponse({ type: OfferDetailSchema })
  @ApiResponse({ status: 404, type: ErrorSchema, description: "No existe o no es visible para la key." })
  @CommonErrors()
  async offer(@CurrentApiClient() principal: ApiPrincipal, @Param("offerId") offerId: string) {
    const { data, meta, row } = await this.catalog.getOffer(principal, offerId);
    const extra: Record<string, unknown> = {};
    if (principal.config.fields.raw) extra.raw = await this.info.rawFor(row.provider, row.externalId);
    if (principal.config.fields.priceHistory) {
      extra.priceHistory = (await this.info.priceHistory(principal, offerId)).data.slice(-PRICE_HISTORY_EMBED);
    }
    return { data: { ...data, ...extra }, meta };
  }

  @Get("offers/:offerId/price-history")
  @ApiScopes("catalog:read")
  @ApiOperation({ summary: "Historial de precio", description: "Cada cambio de precio de la oferta en los últimos 12 meses (se registra solo cuando el precio cambia)." })
  @ApiParam({ name: "offerId", example: "off_7Hq2Zk9LmXwR4tNc1aBv0e" })
  @ApiOkResponse({ type: PriceHistorySchema })
  @CommonErrors()
  priceHistory(@CurrentApiClient() principal: ApiPrincipal, @Param("offerId") offerId: string) {
    return this.info.priceHistory(principal, offerId);
  }

  @Get("brands")
  @ApiTags("Taxonomía")
  @ApiScopes("catalog:read")
  @ApiOperation({ summary: "Marcas", description: "Marcas del catálogo visible para la key (nombres unificados por NODO), con cantidad de productos." })
  @ApiOkResponse({ type: BrandsSchema })
  @CommonErrors()
  brands(@CurrentApiClient() principal: ApiPrincipal) {
    return this.info.brands(principal);
  }

  @Get("categories")
  @ApiTags("Taxonomía")
  @ApiScopes("catalog:read")
  @ApiOperation({ summary: "Categorías", description: "Árbol categoría → subcategoría (taxonomía unificada de NODO), con cantidad de productos." })
  @ApiOkResponse({ type: CategoriesSchema })
  @CommonErrors()
  categories(@CurrentApiClient() principal: ApiPrincipal) {
    return this.info.categories(principal);
  }

  @Get("providers")
  @ApiScopes("catalog:read")
  @ApiOperation({ summary: "Distribuidores", description: "Los distribuidores de la key (con alias si la identidad está oculta), cantidad de ofertas y estado de su sincronización." })
  @ApiOkResponse({ type: ProvidersSchema })
  @CommonErrors()
  providers(@CurrentApiClient() principal: ApiPrincipal) {
    return this.info.providers(principal);
  }

  @Get("fx")
  @ApiTags("Cuenta")
  @ApiOperation({ summary: "Cotizaciones del dólar", description: "Las cotizaciones disponibles y la que usa la key para convertir a pesos." })
  @ApiOkResponse({ type: FxListSchema })
  @CommonErrors()
  fx(@CurrentApiClient() principal: ApiPrincipal) {
    return this.info.fxRates(principal);
  }
}
