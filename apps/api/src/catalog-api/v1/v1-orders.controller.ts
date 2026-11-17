import { Controller, Get, Param, Query, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBasicAuth, ApiOperation, ApiParam, ApiPropertyOptional, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { ApiScopes, CurrentApiClient, type ApiPrincipal } from "../auth/api-principal";
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
}
