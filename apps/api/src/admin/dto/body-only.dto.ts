import { IsBoolean, IsDateString } from "class-validator";

export class ActiveStatusBodyDto {
  @IsBoolean()
  active!: boolean;
}

export class EndDateBodyDto {
  @IsDateString()
  endDate!: string;
}
