import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, IsUUID, Matches } from "class-validator";
import { IsImageUrlOrUploadPath } from "../../common/validators/image-url.validator";

export class UpdateProviderDisplayDto {
  @IsOptional()
  @IsBoolean()
  visible?: boolean;

  /** Con `visible: false`, organizaciones que igual lo ven. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsUUID("all", { each: true })
  allowedTenantIds?: string[];

  @IsOptional()
  @IsImageUrlOrUploadPath({ message: "logoUrl debe ser una URL válida o un path /assets/..." })
  logoUrl?: string;

  @IsOptional()
  @IsString()
  @Matches(/^#[0-9a-fA-F]{6}$/, { message: "textColor debe ser un color hex, ej: #7c3aed" })
  textColor?: string;
}
