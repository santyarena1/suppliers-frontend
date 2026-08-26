import { Type } from "class-transformer";
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from "class-validator";
import { ALL_PROVIDERS, type Provider } from "@nodo/shared";

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

  /** Tamaño de cada tanda. Default 50. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  batchSize?: number;

  /** true = procesa una sola tanda y para. */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  once?: boolean;
}
