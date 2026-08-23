import { IsOptional, IsString, MinLength } from "class-validator";

export class ResetPasswordDto {
  /** Si se omite, la plataforma genera una y la devuelve una única vez. */
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
