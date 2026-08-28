import { BadRequestException } from "@nestjs/common";

export function assertJsonObject(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BadRequestException("El cuerpo tiene que ser un objeto JSON.");
  }
  return body as Record<string, unknown>;
}
