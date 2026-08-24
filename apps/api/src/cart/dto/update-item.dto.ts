import { IsInt, IsObject, IsOptional, Min } from "class-validator";

export class UpdateCartItemDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsObject()
  snapshot?: Record<string, unknown>;
}
