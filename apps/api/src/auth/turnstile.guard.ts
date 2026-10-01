import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { clientIp } from "../common/client-ip";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5_000;

export const HUMAN_CHECK_MESSAGE = "No pudimos confirmar que no seas un robot. Esperá un segundo y probá de nuevo.";

/**
 * Cloudflare Turnstile en las puertas de entrada (login, registro, código de
 * verificación): un bot o una IA que pega directo al API no tiene el token
 * que solo da el widget en un navegador real.
 *
 * Sin TURNSTILE_SECRET_KEY (local, tests) no se exige. Si Cloudflare no
 * responde, se deja pasar y queda en el log: una caída de ellos no puede
 * dejar a nadie afuera. Un "no" explícito de Cloudflare sí corta.
 */
@Injectable()
export class TurnstileGuard implements CanActivate {
  private readonly logger = new Logger(TurnstileGuard.name);

  constructor(private readonly config: ConfigService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const secret = (this.config.get<string>("TURNSTILE_SECRET_KEY") || "").trim();
    if (!secret) return true;

    const req = context.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined>; ip?: string }>();
    const raw = req.headers["x-turnstile-token"];
    const token = (Array.isArray(raw) ? raw[0] : raw)?.trim();
    if (!token || token.length > 4096) {
      throw new ForbiddenException({ message: HUMAN_CHECK_MESSAGE, code: "HUMAN_CHECK_REQUIRED" });
    }

    const body = new URLSearchParams({
      secret,
      response: token,
      remoteip: clientIp(req.headers["x-real-ip"], req.headers["x-forwarded-for"], req.ip),
    });
    let result: { success?: boolean; "error-codes"?: string[] };
    try {
      const res = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS) });
      result = (await res.json()) as typeof result;
    } catch (err) {
      this.logger.warn(`Turnstile no respondió, se deja pasar: ${err instanceof Error ? err.message : String(err)}`);
      return true;
    }
    if (!result.success) {
      this.logger.warn(`Turnstile rechazó un acceso: ${(result["error-codes"] ?? []).join(",") || "sin código"}`);
      throw new ForbiddenException({ message: HUMAN_CHECK_MESSAGE, code: "HUMAN_CHECK_REQUIRED" });
    }
    return true;
  }
}
