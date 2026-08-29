import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from "@nestjs/common";
import axios from "axios";

export interface AcuStockErrorBody {
  success?: boolean;
  error?: string;
  code?: string;
  message?: string;
}

/**
 * AcuStock 401 no puede llegar al browser como 401: el interceptor del
 * frontend interpreta eso como sesión de Nodo vencida y echa al usuario.
 */
export function mapAcuStockStatus(status: number | undefined): number {
  if (status === 401) return HttpStatus.BAD_GATEWAY;
  if (
    status === 400 ||
    status === 403 ||
    status === 404 ||
    status === 429 ||
    status === 501
  ) {
    return status;
  }
  return HttpStatus.BAD_GATEWAY;
}

export function acuStockErrorMessage(body: unknown, fallback: string): string {
  if (body && typeof body === "object") {
    const row = body as AcuStockErrorBody;
    if (typeof row.error === "string" && row.error.trim()) return row.error;
    if (typeof row.message === "string" && row.message.trim()) return row.message;
  }
  return fallback;
}

export function throwAcuStockError(err: unknown): never {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const mapped = mapAcuStockStatus(status);
    const fallback =
      status === 401
        ? "AcuStock rechazó las credenciales de la integración."
        : err.message || "AcuStock no respondió";
    const message = acuStockErrorMessage(err.response?.data, fallback);

    if (mapped === HttpStatus.BAD_REQUEST) throw new BadRequestException(message);
    if (mapped === HttpStatus.FORBIDDEN) throw new ForbiddenException(message);
    if (mapped === HttpStatus.NOT_FOUND) throw new NotFoundException(message);
    if (mapped === HttpStatus.BAD_GATEWAY) throw new BadGatewayException(message);
    throw new HttpException(message, mapped);
  }
  if (err instanceof Error) throw new BadGatewayException(err.message);
  throw new BadGatewayException("AcuStock no respondió");
}

export function unwrapAcuStock<T>(body: unknown): { data: T; meta?: Record<string, unknown> } {
  if (body && typeof body === "object" && "data" in body) {
    const row = body as { data: T; meta?: Record<string, unknown> };
    return { data: row.data, meta: row.meta };
  }
  return { data: body as T };
}
