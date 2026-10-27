import { Transform } from "class-transformer";
import { IsBoolean, IsIn, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateIf } from "class-validator";

/** Texto opcional: vacío se guarda como `null`. */
const optionalText = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined || typeof value !== "string") return value;
  const t = value.trim();
  return t === "" ? null : t;
};

export class SavePcBuildDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: "Ponele un nombre al armado" })
  @MaxLength(120)
  title!: string;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(120)
  clientName?: string | null;

  @IsOptional()
  @IsBoolean()
  template?: boolean;

  /** Piezas, extras y líneas libres tal como las guarda el armador. */
  @IsObject()
  data!: Record<string, unknown>;
}

export class PcBuilderSettingsDto {
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(120)
  laborName?: string | null;

  /** Precio final en pesos, con IVA. null = sin línea de armado. */
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100_000_000)
  laborPrice?: number | null;

  @IsOptional()
  @IsIn([0, 10.5, 21, 27])
  laborIva?: number;
}
