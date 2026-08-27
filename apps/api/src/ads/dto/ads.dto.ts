import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, MaxLength, Min } from "class-validator";
import { IsImageUrlOrUploadPath } from "../../common/validators/image-url.validator";

export class UpdateAdSlotDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  monthlyPriceUsd?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxConcurrent?: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class UpsertAdCampaignDto {
  @IsString()
  slotId!: string;

  @IsString()
  @MaxLength(80)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  subtitle?: string;

  @IsOptional()
  @IsImageUrlOrUploadPath({ message: "imageUrl debe ser una URL válida o un path /assets/..." })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  @Matches(/^(https?:\/\/|\/)/, { message: "linkUrl debe ser una URL o un path interno" })
  linkUrl?: string;

  @IsOptional()
  @IsIn(["DRAFT", "ACTIVE", "PAUSED", "ENDED"])
  status?: "DRAFT" | "ACTIVE" | "PAUSED" | "ENDED";
}

export class AdTrackDto {
  @IsIn(["impression", "click"])
  kind!: "impression" | "click";

  @IsOptional()
  @IsString()
  @MaxLength(200)
  path?: string;
}
