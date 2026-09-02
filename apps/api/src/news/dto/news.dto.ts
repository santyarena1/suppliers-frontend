import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { IsImageUrlOrUploadPath } from "../../common/validators/image-url.validator";
import {
  NEWS_ATTACHMENT_KINDS,
  NEWS_ATTACHMENT_VISIBILITIES,
  NEWS_KINDS,
  NEWS_STATUSES,
} from "@nodo/shared";

export class NewsSkuDto {
  @IsString()
  @MaxLength(40)
  provider!: string;

  @IsString()
  @MaxLength(80)
  externalId!: string;

  @IsString()
  @MaxLength(200)
  name!: string;
}

export class NewsAttachmentDto {
  @IsIn([...NEWS_ATTACHMENT_KINDS])
  kind!: (typeof NEWS_ATTACHMENT_KINDS)[number];

  @IsString()
  @MaxLength(160)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  fileUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  contentUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  resourceId?: string | null;

  @IsOptional()
  @IsIn([...NEWS_ATTACHMENT_VISIBILITIES])
  visibility?: (typeof NEWS_ATTACHMENT_VISIBILITIES)[number];
}

export class NewsImageDto {
  @IsString()
  @MaxLength(500)
  url!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  caption?: string | null;
}

export class UpsertNewsDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  excerpt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120000)
  bodyHtml?: string;

  @IsOptional()
  @ValidateIf((_, v) => v != null && v !== "")
  @IsImageUrlOrUploadPath({ message: "coverUrl debe ser una URL o un path /assets/..." })
  coverUrl?: string | null;

  @IsOptional()
  @IsIn([...NEWS_KINDS])
  kind?: (typeof NEWS_KINDS)[number];

  @IsOptional()
  @IsIn([...NEWS_STATUSES])
  status?: (typeof NEWS_STATUSES)[number];

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyOnPublish?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  scopeBrandName?: string | null;

  @IsOptional()
  @IsDateString()
  publishedAt?: string | null;

  @IsOptional()
  @IsDateString()
  expiresAt?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => NewsSkuDto)
  relatedSkus?: NewsSkuDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => NewsAttachmentDto)
  attachments?: NewsAttachmentDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @ValidateNested({ each: true })
  @Type(() => NewsImageDto)
  images?: NewsImageDto[];
}

export class NewsTrackDto {
  @IsIn(["view", "attachment_click"])
  kind!: "view" | "attachment_click";
}
