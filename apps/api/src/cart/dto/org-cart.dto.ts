import { IsArray, IsOptional } from "class-validator";

export class UpsertOrgCartDto {
  @IsArray()
  items!: unknown[];

  @IsOptional()
  @IsArray()
  schemes?: unknown[];
}
