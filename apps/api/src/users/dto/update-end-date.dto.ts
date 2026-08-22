import { IsDateString, IsUUID, ValidateIf } from "class-validator";

export class UpdateEndDateDto {
  @IsUUID()
  userId!: string;

  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endDate!: string | null;
}
