import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

export class SignupDto {
  @IsEmail({}, { message: "E-mail inválido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  @MaxLength(128, { message: "A senha é muito longa" })
  password!: string;
}
