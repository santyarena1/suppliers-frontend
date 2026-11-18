import { Controller, Get, Param, Query, StreamableFile, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { safeFilename } from "../../providers/safe-url";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBasicAuth, ApiOperation, ApiParam, ApiPropertyOptional, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { ApiScopes, CurrentApiClient, type ApiPrincipal } from "../auth/api-principal";
import { InvoicesApiService } from "../orders/invoices-api.service";
import { OrdersApiService } from "../orders/orders-api.service";
import { CommonErrors } from "./v1-catalog.controller";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { V1UsageInterceptor } from "./v1-usage.interceptor";

const STATES = ["pendiente_aprobacion", "creado", "enviado", "rechazado", "cancelado", "fallido"];

export class OrdersQueryDto {
  @ApiPropertyOptional({ description: "Pedidos que cambiaron desde esta fecha (ISO 8601). Sin `desde` ni `cursor`, todos." , example: "2026-11-16T00:00:00-03:00" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  desde?: string;

  @ApiPropertyOptional({ description: "`meta.nextCursor` de la página anterior (tiene prioridad sobre `desde`)." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ description: "Pedidos por página (1 a 100).", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: STATES, description: "Solo los pedidos en este estado (filtra la página)." })
  @IsOptional()
  @IsIn(STATES)
  estado?: string;
}

/**
 * Pedidos del comercio (Sistema TGS → AcuStock). Solo para la organización
 * habilitada y con el permiso `orders:read`. Los avisos van por webhooks
 * (`pedido.creado`, `pedido.actualizado`, `pedido.cancelado`); esta consulta
 * sirve para recuperar lo que se haya perdido.
 */
@ApiTags("Pedidos")
@ApiSecurity("ApiKey")
@ApiSecurity("ApiSecret")
@ApiBasicAuth("Basic")
@Public()
@SkipEnvelope()
@SkipThrottle()
@UseGuards(ApiKeyGuard)
@UseFilters(V1ExceptionFilter)
@UseInterceptors(V1UsageInterceptor)
@ApiScopes("orders:read")
@Controller("v1/pedidos")
export class V1OrdersController {
  constructor(private readonly orders: OrdersApiService) {}

  @Get()
  @ApiOperation({
    summary: "Pedidos que cambiaron desde una fecha",
    description: "Ordenados por fecha de cambio. Cada pedido trae `version` y `actualizado`: aplicá solo si es más nuevo que lo que tenés.",
  })
  @CommonErrors()
  list(@CurrentApiClient() principal: ApiPrincipal, @Query() query: OrdersQueryDto) {
    return this.orders.list(principal, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Un pedido", description: "Por id o por número (`NODO-123`)." })
  @ApiParam({ name: "id" })
  @CommonErrors()
  async get(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    return { data: await this.orders.get(principal, id) };
  }

  @Get(":id/documentos/:documentId")
  @ApiOperation({
    summary: "PDF de una factura o un remito del pedido",
    description: "La copia que NODO guardó del portal del distribuidor. Es el `pdf_url` de `facturas[]` y `remitos[]`; se pide con la misma API key.",
  })
  @ApiParam({ name: "id" })
  @ApiParam({ name: "documentId" })
  @CommonErrors()
  async document(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string, @Param("documentId") documentId: string) {
    const file = await this.orders.document(principal, id, documentId);
    return new StreamableFile(file.data, { type: file.mimeType, disposition: `inline; filename="${safeFilename(file.filename)}"` });
  }
}

export class InvoicesQueryDto {
  @ApiPropertyOptional({ description: "Comprobantes que cambiaron desde esta fecha (ISO 8601). Sin `desde` ni `cursor`, todos.", example: "2026-11-16T00:00:00-03:00" })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  desde?: string;

  @ApiPropertyOptional({ description: "`meta.nextCursor` de la página anterior (tiene prioridad sobre `desde`)." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ description: "Comprobantes por página (1 a 100).", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ enum: ["con", "sin"], description: "Solo los unidos a un pedido de NODO (`con`) o los sueltos (`sin`). Filtra la página." })
  @IsOptional()
  @IsIn(["con", "sin"])
  pedido?: string;

  @ApiPropertyOptional({ description: "Solo de este distribuidor (`ELIT`, `NEW_BYTES`…). Filtra la página." })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  distribuidor?: string;
}

/**
 * Facturas y notas de crédito/débito de los portales de los distribuidores
 * (Sistema TGS → AcuStock), unidas o no a un pedido de NODO. Mismo acceso que
 * los pedidos (`orders:read`, solo la organización habilitada). Avisos:
 * `factura.nueva` y `factura.actualizada`.
 */
@ApiTags("Facturas")
@ApiSecurity("ApiKey")
@ApiSecurity("ApiSecret")
@ApiBasicAuth("Basic")
@Public()
@SkipEnvelope()
@SkipThrottle()
@UseGuards(ApiKeyGuard)
@UseFilters(V1ExceptionFilter)
@UseInterceptors(V1UsageInterceptor)
@ApiScopes("orders:read")
@Controller("v1/facturas")
export class V1InvoicesController {
  constructor(private readonly invoices: InvoicesApiService) {}

  @Get()
  @ApiOperation({
    summary: "Facturas que cambiaron desde una fecha",
    description: "Todas las que NODO encontró en los portales, unidas a un pedido (`pedido`) o sueltas (`pedido: null`). Cada una trae `version` y `actualizado`.",
  })
  @CommonErrors()
  list(@CurrentApiClient() principal: ApiPrincipal, @Query() query: InvoicesQueryDto) {
    return this.invoices.list(principal, query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Una factura" })
  @ApiParam({ name: "id" })
  @CommonErrors()
  async get(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    return { data: await this.invoices.get(principal, id) };
  }

  @Get(":id/pdf")
  @ApiOperation({ summary: "PDF de la factura", description: "La copia guardada en NODO. Si `pdf_generado_por_nodo`, NODO lo armó con los datos oficiales (New Bytes no publica el original)." })
  @ApiParam({ name: "id" })
  @CommonErrors()
  async pdf(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    const file = await this.invoices.pdf(principal, id);
    return new StreamableFile(file.data, { type: file.mimeType, disposition: `inline; filename="${safeFilename(file.filename)}"` });
  }
}
