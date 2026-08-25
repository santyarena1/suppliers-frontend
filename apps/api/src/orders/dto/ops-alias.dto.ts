import { ArrayMinSize, IsArray, IsIn, IsString, MaxLength } from "class-validator";
import { OPS_ALIAS_KINDS } from "../purchase-ops-aliases";

export class UnifyOpsAliasDto {
  @IsIn([...OPS_ALIAS_KINDS])
  kind!: (typeof OPS_ALIAS_KINDS)[number];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(220, { each: true })
  keys!: string[];

  @IsString()
  @MaxLength(180)
  label!: string;
}

export class RenameOpsAliasDto {
  @IsString()
  @MaxLength(180)
  label!: string;
}

export class SplitOpsAliasDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  @MaxLength(220, { each: true })
  keys!: string[];
}
