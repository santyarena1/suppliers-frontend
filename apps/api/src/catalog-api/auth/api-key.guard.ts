import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { CatalogApiScope } from "@nodo/shared";
import type { FastifyReply } from "fastify";
import { requestIp } from "./request-ip";
import { Errors } from "../core/api-error";
import { requestId } from "../core/ids";
import { readCredentials } from "./api-key-crypto";
import { ApiClientResolver } from "./api-client-resolver.service";
import { API_SCOPES_KEY, type ApiRequest } from "./api-principal";
import { FixedWindowLimiter } from "./rate-limiter";

/** Intentos con credenciales inválidas por IP y por minuto antes de cortar. */
const AUTH_FAILURES_PER_MINUTE = 30;

/**
 * Autentica /v1 con la API key y el secret (headers X-Api-Key / X-Api-Secret o
 * HTTP Basic). No usa el JWT de la app: los controllers son @Public() y ponen
 * este guard. Aplica la lista de IPs, el permiso del endpoint, el módulo
 * contratado y el límite de pedidos por minuto de la key.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  private readonly perKey = new FixedWindowLimiter();
  private readonly failures = new FixedWindowLimiter();

  constructor(
    private readonly resolver: ApiClientResolver,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<ApiRequest>();
    const reply = context.switchToHttp().getResponse<FastifyReply>();
    request.apiRequestId ??= requestId();
    reply.header("X-Request-Id", request.apiRequestId);

    const ip = requestIp(request);
    const scopes = this.reflector.getAllAndOverride<CatalogApiScope[] | undefined>(API_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const credentials = readCredentials(request.headers as Record<string, string | string[] | undefined>);
    try {
      if (!credentials) throw Errors.missingCredentials();
      request.apiPrincipal = await this.resolver.byCredentials(credentials.key, credentials.secret, ip, scopes?.[0] ?? null);
      for (const scope of scopes?.slice(1) ?? []) {
        if (!request.apiPrincipal.scopes.includes(scope)) throw Errors.scopeRequired(scope);
      }
    } catch (err) {
      if ((err as { code?: string }).code === "invalid_credentials") {
        const strike = this.failures.hit(`ip:${ip}`, AUTH_FAILURES_PER_MINUTE);
        if (!strike.allowed) throw Errors.tooManyFailures(strike.resetSeconds);
      }
      throw err;
    }

    const principal = request.apiPrincipal;
    const rate = this.perKey.hit(principal.clientId, principal.rateLimitPerMinute);
    reply.header("X-RateLimit-Limit", String(rate.limit));
    reply.header("X-RateLimit-Remaining", String(rate.remaining));
    reply.header("X-RateLimit-Reset", String(rate.resetSeconds));
    if (!rate.allowed) throw Errors.rateLimited(rate.resetSeconds);
    return true;
  }
}
