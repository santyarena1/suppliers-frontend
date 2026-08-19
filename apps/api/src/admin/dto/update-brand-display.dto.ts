import { IsBoolean, IsOptional, IsString, IsUrl, Matches } from "class-validator";

export class UpdateBrandDisplayDto {
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  @IsOptional()
  @IsUrl({}, { message: "logoUrl debe ser una URL válida" })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "textColor debe ser un color hex, ej: #7c3aed" })
  textColor?: string;
}
