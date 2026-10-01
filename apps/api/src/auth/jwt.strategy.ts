import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import type { JwtPayload } from "@nodo/shared";
import { PrismaService } from "../prisma/prisma.service";

/** Cuánto se recuerda el estado de un usuario antes de volver a la base. */
const SESSION_CACHE_MS = 30_000;

/**
 * El token en la URL solo se acepta en el stream del chat: EventSource no puede
 * mandar headers. En cualquier otra ruta, un token en la URL termina en logs,
 * historial y Referer.
 */
function streamQueryToken(req: { url?: string; query?: Record<string, unknown> }): string | null {
  const path = (req.url ?? "").split("?")[0];
  if (path !== "/my/chat/stream") return null;
  const token = req.query?.token;
  return typeof token === "string" && token ? token : null;
}

type SessionState = { active: boolean; endDate: Date | null; sessionVersion: number; at: number };

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly cache = new Map<string, SessionState>();

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([ExtractJwt.fromAuthHeaderAsBearerToken(), streamQueryToken]),
      ignoreExpiration: false,
      secretOrKey: config.get<string>("JWT_SECRET")!,
    });
  }

  /**
   * Un token bien firmado no alcanza: la cuenta tiene que seguir activa y la
   * sesión no tiene que haber sido cerrada (contraseña nueva sube la versión).
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const state = await this.sessionState(payload.userId);
    if (!state || !state.active) throw new UnauthorizedException("Tu sesión ya no es válida. Volvé a entrar.");
    if (state.endDate && state.endDate.getTime() < Date.now()) {
      throw new UnauthorizedException("La cuenta venció");
    }
    if ((payload.sv ?? 0) !== state.sessionVersion) {
      throw new UnauthorizedException("Tu sesión ya no es válida. Volvé a entrar.");
    }
    return payload;
  }

  private async sessionState(userId: string): Promise<SessionState | null> {
    const hit = this.cache.get(userId);
    if (hit && Date.now() - hit.at < SESSION_CACHE_MS) return hit;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { active: true, endDate: true, sessionVersion: true },
    });
    if (!user) {
      this.cache.delete(userId);
      return null;
    }
    const state = { ...user, at: Date.now() };
    if (this.cache.size > 5000) this.cache.clear();
    this.cache.set(userId, state);
    return state;
  }
}
