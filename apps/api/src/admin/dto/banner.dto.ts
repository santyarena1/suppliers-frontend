import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUrl } from "class-validator";

export class CreateBannerDto {
  @IsIn(["home", "search"])
  position!: "home" | "search";

  @IsUrl({}, { message: "imageUrl debe ser una URL válida" })
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
  @IsUrl({}, { message: "imageUrl debe ser una URL válida" })
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
