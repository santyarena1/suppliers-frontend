import { Controller, Get, Param, Query, Res, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle, Throttle } from "@nestjs/throttler";
import {
  ApiBasicAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiPropertyOptional,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { ApiClientResolver } from "../auth/api-client-resolver.service";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { ApiScopes, CurrentApiClient, type ApiPrincipal, type ApiRequest } from "../auth/api-principal";
import { requestIp } from "../auth/request-ip";
import { ChangesFeedService } from "../changes/changes-feed.service";
import { ExportService, type ExportFile, type ExportFormat } from "../export/export.service";
import { ChangesSchema, ErrorSchema } from "./dto/schemas";
import { CurrentRequest } from "./current-request.decorator";
import { CommonErrors } from "./v1-catalog.controller";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { V1UsageInterceptor } from "./v1-usage.interceptor";

export class ChangesQueryDto {
  @ApiPropertyOptional({ description: "Cursor de la consulta anterior. Sin cursor devuelve el cursor actual (arrancá desde ahí después de un export)." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  cursor?: string;

  @ApiPropertyOptional({ description: "Cambios por página (1 a 500).", default: 200, minimum: 1, maximum: 500 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

export class ExportQueryDto {
  @ApiPropertyOptional({ enum: ["csv", "xlsx", "json"], default: "csv" })
  @IsOptional()
  @IsIn(["csv", "xlsx", "json"])
  format?: ExportFormat;

  @ApiPropertyOptional({ enum: ["products", "offers"], description: "Default: la vista por defecto de la key." })
  @IsOptional()
  @IsIn(["products", "offers"])
  view?: "products" | "offers";

  @ApiPropertyOptional({ enum: [",", ";"], default: ",", description: "Separador del CSV (`;` para Excel en español)." })
  @IsOptional()
  @IsIn([",", ";"])
  delimiter?: "," | ";";
}

async function sendFile(reply: FastifyReply, file: ExportFile, inline = false) {
  reply
    .header("Content-Type", file.contentType)
    .header("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${file.filename}"`)
    .header("Cache-Control", "no-store");
  return reply.send(file.body);
}

@ApiTags("Sincronización")
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
export class V1SyncController {
  constructor(
    private readonly changes: ChangesFeedService,
    private readonly exports: ExportService
  ) {}

  @Get("changes")
  @ApiScopes("changes:read")
  @ApiOperation({
    summary: "Cambios incrementales",
    description:
      "Lo que cambió desde tu último cursor, en orden: altas, cambios (precio, stock, ficha) y bajas, más pausas de sincronización de un distribuidor. Guardá `nextCursor` y volvé a consultar. Los cursores valen 30 días.",
  })
  @ApiOkResponse({ type: ChangesSchema })
  @ApiResponse({ status: 410, type: ErrorSchema, description: "El cursor venció (más de 30 días): hacé un export y pedí un cursor nuevo." })
  @CommonErrors()
  changesFeed(@CurrentApiClient() principal: ApiPrincipal, @Query() query: ChangesQueryDto) {
    return this.changes.page(principal, query.cursor, query.limit ?? 200);
  }

  @Get("export")
  @ApiScopes("export:read")
  @ApiOperation({
    summary: "Exportar el catálogo",
    description: "Catálogo completo con la config de la key, en CSV (UTF-8 con BOM), XLSX (hasta 100.000 filas) o JSON. Se descarga como archivo.",
  })
  @ApiProduces("text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiOkResponse({ description: "El archivo." })
  @CommonErrors()
  async export(@CurrentApiClient() principal: ApiPrincipal, @Query() query: ExportQueryDto, @Res() reply: FastifyReply) {
    const file = await this.exports.export(
      principal,
      query.format ?? "csv",
      query.view ?? principal.config.defaultView,
      query.delimiter ?? ","
    );
    return sendFile(reply, file);
  }
}

/**
 * Feeds de producto. Google y Meta los leen sin headers, así que la credencial
 * va en la URL: un token de solo lectura, distinto del secret, que solo sirve
 * para esto y se rota aparte.
 */
@ApiTags("Feeds")
@Public()
@SkipEnvelope()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@UseFilters(V1ExceptionFilter)
@UseInterceptors(V1UsageInterceptor)
@Controller("v1/feeds")
export class V1FeedsController {
  constructor(
    private readonly resolver: ApiClientResolver,
    private readonly exports: ExportService
  ) {}

  @Get(":feedToken/google.xml")
  @ApiOperation({ summary: "Feed para Google Merchant Center", description: "RSS 2.0 con atributos `g:`. Requiere `feed.productUrlTemplate` en la key." })
  @ApiParam({ name: "feedToken", example: "nodo_ft_…" })
  @ApiProduces("application/xml")
  @ApiResponse({ status: 422, type: ErrorSchema, description: "Falta configurar el link de los productos." })
  async google(@Param("feedToken") token: string, @Res() reply: FastifyReply, @CurrentRequest() request: ApiRequest) {
    request.apiPrincipal = await this.resolver.byFeedToken(token, requestIp(request as FastifyRequest));
    return sendFile(reply, await this.exports.googleFeed(request.apiPrincipal), true);
  }

  @Get(":feedToken/meta.csv")
  @ApiOperation({ summary: "Feed para el catálogo de Meta (Facebook e Instagram)", description: "CSV con las columnas del catálogo de Meta. Requiere `feed.productUrlTemplate` en la key." })
  @ApiParam({ name: "feedToken", example: "nodo_ft_…" })
  @ApiProduces("text/csv")
  @ApiResponse({ status: 422, type: ErrorSchema, description: "Falta configurar el link de los productos." })
  async meta(@Param("feedToken") token: string, @Res() reply: FastifyReply, @CurrentRequest() request: ApiRequest) {
    request.apiPrincipal = await this.resolver.byFeedToken(token, requestIp(request as FastifyRequest));
    return sendFile(reply, await this.exports.metaFeed(request.apiPrincipal), true);
  }
}

