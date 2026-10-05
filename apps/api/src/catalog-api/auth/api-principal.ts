import { createParamDecorator, ExecutionContext, SetMetadata } from "@nestjs/common";
import type { ApiClientConfig, CatalogApiScope, TenantPlan } from "@nodo/shared";
import type { FastifyRequest } from "fastify";

/** Quién está llamando a /v1: la key, su organización y su config efectiva. */
export interface ApiPrincipal {
  clientId: string;
  clientName: string;
  publicKey: string;
  scopes: CatalogApiScope[];
  rateLimitPerMinute: number;
  /** Organización dueña de la key. */
  tenantId: string;
  tenantName: string;
  plan: TenantPlan;
  /** De quién se lee el catálogo (igual a tenantId salvo organizaciones espejo). */
  catalogTenantId: string;
  config: ApiClientConfig;
  /** Fecha de creación de la key (para /v1/me). */
  createdAt: Date;
  expiresAt: Date | null;
}

export type ApiRequest = FastifyRequest & {
  apiPrincipal?: ApiPrincipal;
  apiRequestId?: string;
};

export const API_SCOPES_KEY = "catalogApiScopes";

/** Permiso que exige el endpoint. Sin decorador = cualquier key válida. */
export const ApiScopes = (...scopes: CatalogApiScope[]) => SetMetadata(API_SCOPES_KEY, scopes);

export const CurrentApiClient = createParamDecorator((_data: unknown, ctx: ExecutionContext): ApiPrincipal => {
  const request = ctx.switchToHttp().getRequest<ApiRequest>();
  if (!request.apiPrincipal) throw new Error("ApiKeyGuard no corrió en este endpoint");
  return request.apiPrincipal;
});
