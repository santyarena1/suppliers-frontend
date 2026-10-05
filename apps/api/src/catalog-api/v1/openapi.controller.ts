import { Controller, Get, Req, ServiceUnavailableException } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import type { FastifyRequest } from "fastify";
import { Public } from "../../common/decorators/public.decorator";
import { SkipEnvelope } from "../../common/decorators/skip-envelope.decorator";
import { publicApiUrl } from "../core/public-urls";
import { OpenApiHolder } from "./openapi";

/** GET /v1/openapi.json: público, para generar clientes y para la referencia de la web. */
@ApiExcludeController()
@Public()
@SkipEnvelope()
@Controller("v1")
export class OpenApiController {
  @Get("openapi.json")
  document(@Req() request: FastifyRequest) {
    const document = OpenApiHolder.get();
    if (!document) throw new ServiceUnavailableException("La documentación todavía no está lista");
    const configured = process.env.PUBLIC_API_URL || process.env.CATALOG_API_PUBLIC_URL;
    const proto = String(request.headers["x-forwarded-proto"] ?? request.protocol ?? "https").split(",")[0];
    const host = request.headers["x-forwarded-host"] ?? request.headers.host;
    const url = configured ? publicApiUrl() : host ? `${proto}://${host}` : publicApiUrl();
    return { ...document, servers: [{ url, description: "API de NODO" }] };
  }
}
