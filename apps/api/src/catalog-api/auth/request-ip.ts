import type { FastifyRequest } from "fastify";
import { clientIp } from "../../common/client-ip";

/** IP del cliente de la API detrás del proxy (mismo criterio que el throttler global). */
export function requestIp(request: FastifyRequest): string {
  return clientIp(request.headers["x-real-ip"], request.headers["x-forwarded-for"], request.ip);
}
