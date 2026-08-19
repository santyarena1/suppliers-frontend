import { IsBoolean, IsUUID } from "class-validator";

export class UpdateActiveStatusDto {
  @IsUUID()
  userId!: string;

  @IsBoolean()
  active!: boolean;
}
