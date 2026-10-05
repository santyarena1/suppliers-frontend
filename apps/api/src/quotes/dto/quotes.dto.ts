import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { MAX_QTY } from "../quote-items";

/** Texto opcional: vacío se guarda como `null`. */
const optionalText = ({ value }: { value: unknown }) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  const t = value.trim();
  return t === "" ? null : t;
};

export class QuoteClientDto {
  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(120)
  clientName?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(40)
  clientPhone?: string | null;

  @IsOptional()
  @Transform(optionalText)
  @IsString()
  @MaxLength(2000)
  notes?: string | null;
}

export class AddQuoteItemDto {
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  provider!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  externalId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  qty?: number;
}

export class UpdateQuoteItemDto {
  @IsInt()
  @Min(1)
  @Max(MAX_QTY)
  qty!: number;
}
