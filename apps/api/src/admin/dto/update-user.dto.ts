import { IsEmail, IsOptional, IsString, IsUUID, MinLength, ValidateIf } from "class-validator";

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  username?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  brandId?: string | null;
}
