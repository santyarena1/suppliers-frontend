import { Body, Controller, HttpCode, Logger, Post } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { JwtPayload } from "@nodo/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").slice(0, max) : "";
}

/**
 * Errores de pantalla de la web (una vista que se rompió). Sin esto nadie se
 * entera: el comercio ve «Algo salió mal» y en el servidor no queda nada.
 * Solo se escriben en el log; no se guardan datos del carrito ni del comercio.
 */
@Controller("monitoring")
export class ClientErrorsController {
  private readonly logger = new Logger("ClientError");

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post("client-errors")
  @HttpCode(204)
  report(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    this.logger.warn(
      `user=${user?.userId ?? "?"} path=${clip(body?.path, 200)} v=${clip(body?.version, 20)} ` +
        `msg=${clip(body?.message, 400)} digest=${clip(body?.digest, 40)} stack=${clip(body?.stack, 1500)}`
    );
  }
}
