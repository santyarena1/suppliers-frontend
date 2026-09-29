import { BadRequestException } from "@nestjs/common";

/** Datos de un evento (nota de tipo EVENT): cuándo, dónde o link, y si se puede anotar. */
export interface NewsEventInput {
  eventStartsAt?: string | null;
  eventEndsAt?: string | null;
  eventLocation?: string | null;
  eventUrl?: string | null;
  rsvpEnabled?: boolean;
}

export interface NewsEventRow {
  kind: string;
  eventStartsAt: Date | null;
  eventEndsAt: Date | null;
  eventLocation: string | null;
  eventUrl: string | null;
  rsvpEnabled: boolean;
}

function date(value: string | null | undefined, field: string): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new BadRequestException(`Fecha inválida en ${field}`);
  return d;
}

function httpsUrl(value: string | null | undefined): string | null {
  const url = value?.trim();
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") throw new Error("protocolo");
    return parsed.toString();
  } catch {
    throw new BadRequestException("El link del evento tiene que ser una URL (https://…)");
  }
}

/**
 * Parche de Prisma con los campos de evento que vinieron en el DTO (los que no
 * vinieron no se tocan). Valida que termine después de empezar.
 */
export function eventPatch(input: NewsEventInput, existing?: Pick<NewsEventRow, "eventStartsAt" | "eventEndsAt">) {
  const patch: Partial<Omit<NewsEventRow, "kind">> = {};
  if (input.eventStartsAt !== undefined) patch.eventStartsAt = date(input.eventStartsAt, "inicio");
  if (input.eventEndsAt !== undefined) patch.eventEndsAt = date(input.eventEndsAt, "fin");
  if (input.eventLocation !== undefined) patch.eventLocation = input.eventLocation?.trim() || null;
  if (input.eventUrl !== undefined) patch.eventUrl = httpsUrl(input.eventUrl);
  if (input.rsvpEnabled !== undefined) patch.rsvpEnabled = input.rsvpEnabled;

  const starts = patch.eventStartsAt !== undefined ? patch.eventStartsAt : existing?.eventStartsAt ?? null;
  const ends = patch.eventEndsAt !== undefined ? patch.eventEndsAt : existing?.eventEndsAt ?? null;
  if (starts && ends && ends.getTime() < starts.getTime()) {
    throw new BadRequestException("El evento tiene que terminar después de empezar");
  }
  return patch;
}

/** Una nota de evento sin fecha no se puede publicar: nadie sabría cuándo es. */
export function assertEventPublishable(row: Pick<NewsEventRow, "kind" | "eventStartsAt">) {
  if (row.kind === "EVENT" && !row.eventStartsAt) {
    throw new BadRequestException("Un evento necesita fecha y hora de inicio");
  }
}

/** `publicView`: el link público no lleva el link de la reunión ni inscripción. */
export function serializeEvent(row: NewsEventRow, publicView = false) {
  if (!row.eventStartsAt) return null;
  return {
    startsAt: row.eventStartsAt.toISOString(),
    endsAt: row.eventEndsAt?.toISOString() ?? null,
    location: row.eventLocation,
    url: publicView ? null : row.eventUrl,
    rsvpEnabled: publicView ? false : row.rsvpEnabled,
  };
}
