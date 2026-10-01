import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import { clientIp } from "../client-ip";

/**
 * El límite de pedidos cuenta por cliente real, no por el proxy de Railway:
 * sin esto todos los usuarios compartían un solo cupo (un bot agotaba el login
 * de todos) y nadie quedaba frenado individualmente.
 */
@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, unknown>): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, string | string[] | undefined>;
    return clientIp(headers["x-forwarded-for"], req.ip as string | undefined);
  }
}
