import { IsDateString, IsUUID } from "class-validator";

export class UpdateEndDateDto {
  @IsUUID()
  userId!: string;

  @IsDateString()
  endDate!: string;
}
