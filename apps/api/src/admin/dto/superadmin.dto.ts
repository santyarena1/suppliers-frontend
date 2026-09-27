import { IsBoolean } from "class-validator";

export class SuperadminDto {
  @IsBoolean()
  superadmin!: boolean;
}
