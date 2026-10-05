import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { ApiRequest } from "../auth/api-principal";
import { requestId } from "../core/ids";

/** El request crudo, con su X-Request-Id (los feeds no pasan por ApiKeyGuard). */
export const CurrentRequest = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<ApiRequest>();
  request.apiRequestId ??= requestId();
  ctx.switchToHttp().getResponse<FastifyReply>().header("X-Request-Id", request.apiRequestId);
  return request;
});
