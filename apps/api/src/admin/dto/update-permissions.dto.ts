import { IsArray, IsBoolean, IsIn, ValidateNested } from "class-validator";
import { Type } from "class-transformer";
import { MODULE_KEYS, type ModuleKey } from "@nodo/shared";

class ModulePermissionDto {
  @IsIn(MODULE_KEYS)
  module!: ModuleKey;

  @IsBoolean()
  allowed!: boolean;
}

export class UpdatePermissionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ModulePermissionDto)
  permissions!: ModulePermissionDto[];
}
