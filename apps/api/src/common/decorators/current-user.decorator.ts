import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { JwtPayload } from "@nodo/shared";
import type { FastifyRequest } from "fastify";

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest<FastifyRequest & { user: JwtPayload }>();
  return request.user;
});
