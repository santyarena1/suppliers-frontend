import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { ApiBasicAuth, ApiOkResponse, ApiOperation, ApiParam, ApiProperty, ApiPropertyOptional, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength } from "class-validator";
import { CATALOG_API_WEBHOOK_EVENTS } from "@nodo/shared";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { PrismaService } from "../../prisma/prisma.service";
import { ApiKeyGuard } from "../auth/api-key.guard";
import { ApiScopes, CurrentApiClient, type ApiPrincipal } from "../auth/api-principal";
import { ApiError, Errors } from "../core/api-error";
import { WebhooksService } from "../webhooks/webhooks.service";
import { WebhookSchema } from "./dto/schemas";
import { CommonErrors } from "./v1-catalog.controller";
import { V1ExceptionFilter } from "./v1-exception.filter";
import { V1UsageInterceptor } from "./v1-usage.interceptor";

const EVENTS = CATALOG_API_WEBHOOK_EVENTS as unknown as string[];

export class CreateWebhookDto {
  @ApiProperty({ example: "https://mi-tienda.com/webhooks/nodo", description: "https obligatorio." })
  @IsString()
  @MaxLength(2000)
  url!: string;

  @ApiProperty({ enum: EVENTS, isArray: true, example: ["price.changed", "stock.changed", "offer.removed"] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(EVENTS.length)
  @IsIn(EVENTS, { each: true })
  events!: string[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiPropertyOptional({ enum: EVENTS, isArray: true })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(EVENTS, { each: true })
  events?: string[];

  @ApiPropertyOptional({ description: "`true` reactiva un webhook apagado por fallos." })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Errores de validación del servicio (BadRequest) en el formato de /v1. */
async function asApi<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    const status = (err as { status?: number }).status;
    if (status === 400) throw Errors.invalidParameter((err as Error).message);
    if (status === 404) throw Errors.notFound("El webhook");
    throw err;
  }
}

@ApiTags("Webhooks")
@ApiSecurity("ApiKey")
@ApiSecurity("ApiSecret")
@ApiBasicAuth("Basic")
@Public()
@SkipEnvelope()
@SkipThrottle()
@UseGuards(ApiKeyGuard)
@UseFilters(V1ExceptionFilter)
@UseInterceptors(V1UsageInterceptor)
@ApiScopes("webhooks:manage")
@Controller("v1/webhooks")
export class V1WebhooksController {
  constructor(
    private readonly webhooks: WebhooksService,
    private readonly prisma: PrismaService
  ) {}

  private async own(principal: ApiPrincipal, id: string) {
    const found = await this.prisma.apiWebhookEndpoint.findFirst({ where: { id, apiClientId: principal.clientId }, select: { id: true } });
    if (!found) throw Errors.notFound("El webhook");
    return found.id;
  }

  @Get()
  @ApiOperation({ summary: "Listar webhooks de la key" })
  @ApiOkResponse({ type: [WebhookSchema] })
  @CommonErrors()
  async list(@CurrentApiClient() principal: ApiPrincipal) {
    return { data: await this.webhooks.list(principal.clientId) };
  }

  @Post()
  @ApiOperation({
    summary: "Crear un webhook",
    description: "Devuelve `signingSecret` una sola vez: guardalo para verificar la firma `Nodo-Signature`. Arranca desde ahora (no manda cambios anteriores).",
  })
  @CommonErrors()
  create(@CurrentApiClient() principal: ApiPrincipal, @Body() body: CreateWebhookDto) {
    return asApi(async () => ({ data: await this.webhooks.create(principal.clientId, body) }));
  }

  @Patch(":id")
  @ApiOperation({ summary: "Modificar un webhook", description: "URL, eventos o `active` (reactivar uno apagado por fallos)." })
  @ApiParam({ name: "id" })
  @CommonErrors()
  update(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string, @Body() body: UpdateWebhookDto) {
    return asApi(async () => ({ data: await this.webhooks.update(await this.own(principal, id), body) }));
  }

  @Delete(":id")
  @ApiOperation({ summary: "Borrar un webhook" })
  @ApiParam({ name: "id" })
  @CommonErrors()
  remove(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    return asApi(async () => ({ data: await this.webhooks.remove(await this.own(principal, id)) }));
  }

  @Post(":id/test")
  @HttpCode(200)
  @ApiOperation({ summary: "Mandar un ping", description: "Manda un evento `ping` firmado y devuelve cómo respondió tu servidor." })
  @ApiParam({ name: "id" })
  @CommonErrors()
  test(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    return asApi(async () => ({ data: await this.webhooks.test(await this.own(principal, id)) }));
  }

  @Get(":id/deliveries")
  @ApiOperation({ summary: "Últimas entregas", description: "Estado, intentos y respuesta de tu servidor de las últimas 50 entregas." })
  @ApiParam({ name: "id" })
  @CommonErrors()
  deliveries(@CurrentApiClient() principal: ApiPrincipal, @Param("id") id: string) {
    return asApi(async () => ({ data: await this.webhooks.deliveries(await this.own(principal, id)) }));
  }
}
