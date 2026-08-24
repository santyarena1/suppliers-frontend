import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl } from "class-validator";
import { IsImageUrlOrUploadPath } from "../../common/validators/image-url.validator";

export class CreateBannerDto {
  @IsIn(["home", "search"])
  position!: "home" | "search";

  @IsImageUrlOrUploadPath({ message: "imageUrl debe ser una URL válida o un path /uploads/..." })
  imageUrl!: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsUrl({}, { message: "linkUrl debe ser una URL válida" })
  linkUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  slot?: string;
}

export class UpdateBannerDto {
  @IsOptional()
  @IsIn(["home", "search"])
  position?: "home" | "search";

  @IsOptional()
  @IsImageUrlOrUploadPath({ message: "imageUrl debe ser una URL válida o un path /uploads/..." })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  subtitle?: string;

  @IsOptional()
  @IsUrl({}, { message: "linkUrl debe ser una URL válida" })
  linkUrl?: string;

  @IsOptional()
  @IsInt()
  order?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  slot?: string;
}
