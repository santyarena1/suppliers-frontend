import { BadRequestException } from "@nestjs/common";

const MAX_FIELDS = 12;
const MAX_KEY = 60;
const MAX_VALUE = 1000;

/**
 * Lo que se guarda como cuenta de un proveedor: pares campo → texto, con algo
 * cargado. Un `{}` o valores que no son texto no son una cuenta y antes se
 * guardaban igual.
 */
export function cleanCredentialValues(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new BadRequestException("Cargá los datos de la cuenta");
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length === 0 || entries.length > MAX_FIELDS) {
    throw new BadRequestException("Cargá los datos de la cuenta");
  }
  const clean: Record<string, string> = {};
  for (const [key, value] of entries) {
    const name = key.trim();
    if (!name || name.length > MAX_KEY) throw new BadRequestException("Campo de cuenta inválido");
    if (typeof value !== "string") throw new BadRequestException(`El campo ${name} tiene que ser texto`);
    if (value.length > MAX_VALUE) throw new BadRequestException(`El campo ${name} es demasiado largo`);
    clean[name] = value;
  }
  if (!Object.values(clean).some((v) => v.trim().length > 0)) {
    throw new BadRequestException("Cargá los datos de la cuenta");
  }
  return clean;
}
