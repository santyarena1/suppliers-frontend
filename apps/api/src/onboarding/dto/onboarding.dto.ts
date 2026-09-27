import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

/** Superadmin: alta de un comercio con su dueño, igual que el autoregistro. */
export class AdminCreateRetailerDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;

  @IsString()
  @MinLength(3)
  @MaxLength(60)
  ownerUsername!: string;

  @IsEmail()
  ownerEmail!: string;

  /** Si se omite, la plataforma genera una y la devuelve una única vez. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  ownerPassword?: string;
}

export class BootstrapRetailerOrgDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;
}
