import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";
import { IsImageUrlOrUploadPath } from "../../common/validators/image-url.validator";

export class SaveSerperKeyDto {
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  apiKey!: string;
}

export class StartFirstPhotoDto {
  @IsOptional()
  @IsIn([...ALL_PROVIDERS])
  provider?: Provider;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  batchSize?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  once?: boolean;
}

export class UpdateImageCronDto {
  @IsBoolean()
  enabled!: boolean;
}

export class SerperSearchDto {
  @IsOptional()
  @IsString()
  @MaxLength(220)
  query?: string;
}

export class SetProductImageDto {
  @IsImageUrlOrUploadPath({ message: "imageUrl debe ser una URL válida o un path /assets/..." })
  imageUrl!: string;

  @IsOptional()
  @IsIn(["serper_pick", "upload", "serper"])
  source?: "serper_pick" | "upload" | "serper";
}
