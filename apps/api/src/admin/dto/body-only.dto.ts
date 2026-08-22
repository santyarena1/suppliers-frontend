import { IsBoolean, IsDateString, ValidateIf } from "class-validator";

export class ActiveStatusBodyDto {
  @IsBoolean()
  active!: boolean;
}

export class EndDateBodyDto {
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  endDate!: string | null;
}
