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
    if (process.env.DEBUG_CLIENT_IP === "1") {
      // Diagnóstico temporal: qué headers de IP manda el proxy de Railway.
      console.log(`[client-ip] xff=${String(headers["x-forwarded-for"])} xreal=${String(headers["x-real-ip"])} envoy=${String(headers["x-envoy-external-address"])} ip=${String(req.ip)}`);
    }
    return clientIp(headers["x-forwarded-for"], req.ip as string | undefined);
  }
}
