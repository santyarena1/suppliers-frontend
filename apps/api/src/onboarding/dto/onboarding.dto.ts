import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from "class-validator";

export class BootstrapRetailerOrgDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsEmail()
  contactEmail?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null && value !== "")
  @IsString()
  @MaxLength(40)
  contactPhone?: string | null;
}
