import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from "class-validator";

const KINDS = ["js", "unhandledrejection", "react", "network", "other"] as const;

export class ReportClientErrorDto {
  @IsString()
  @IsIn(KINDS)
  kind!: (typeof KINDS)[number];

  @IsString()
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @MaxLength(8000)
  stack?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  source?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  line?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  column?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  userAgent?: string;

  @IsOptional()
  @IsObject()
  meta?: Record<string, unknown>;
}
