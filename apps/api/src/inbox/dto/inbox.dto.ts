import { Transform } from "class-transformer";
import { IsBoolean, IsEmail, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength, ValidateIf } from "class-validator";
import { INBOX_STATUSES, INBOX_TYPES, type InboxStatus, type InboxType } from "../inbox-types";

const trim = ({ value }: { value: unknown }) => (typeof value === "string" ? value.trim() : value);

export const CONTACT_KINDS = ["CONTACT", "CUSTOM", "SUPPLIER", "BRAND", "PAYMENT"] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

/** Formulario de contacto de la landing (sin sesión). */
export class ContactRequestDto {
  @IsOptional()
  @IsIn(CONTACT_KINDS as unknown as string[])
  kind?: ContactKind;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @Transform(trim)
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(120)
  company?: string | null;

  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;
}

/** Usuario registrado que en el alta elige "soy distribuidor / marca". */
export class SupplierJoinDto {
  @IsIn(["SUPPLIER", "BRAND"])
  kind!: "SUPPLIER" | "BRAND";

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company!: string;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(200)
  website?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(2000)
  message?: string | null;
}

export class InboxQueryDto {
  @IsOptional()
  @IsIn(INBOX_STATUSES as unknown as string[])
  status?: InboxStatus;

  @IsOptional()
  @IsIn(INBOX_TYPES as unknown as string[])
  type?: InboxType;

  @IsOptional()
  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  page?: number;
}

export class UpdateInboxDto {
  @IsOptional()
  @IsIn(INBOX_STATUSES as unknown as string[])
  status?: InboxStatus;

  @IsOptional()
  @ValidateIf((_, v) => v !== null)
  @IsString()
  @MaxLength(1000)
  note?: string | null;
}

/** Un comercio pide sumar un distribuidor que NODO todavía no tiene integrado. */
export class IntegrationRequestDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  providerName!: string;

  /** Página o portal del distribuidor. */
  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(200)
  website?: string | null;

  /** Si el comercio ya tiene cuenta (usuario) en ese distribuidor. */
  @IsOptional()
  @IsBoolean()
  hasAccount?: boolean;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(1000)
  message?: string | null;
}

/** Un comercio pide NODO Custom para conectar su sistema de gestión. */
export class CustomPlanRequestDto {
  /** Sistema de gestión o ERP que usa ("Tango", "Bejerman", uno propio…). */
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  system!: string;

  /** Qué quiere conectar (stock, precios, pedidos, facturación…). */
  @IsOptional()
  @IsString({ each: true })
  @MaxLength(40, { each: true })
  needs?: string[];

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(40)
  phone?: string | null;

  @IsOptional()
  @Transform(trim)
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsString()
  @MaxLength(1000)
  message?: string | null;
}
