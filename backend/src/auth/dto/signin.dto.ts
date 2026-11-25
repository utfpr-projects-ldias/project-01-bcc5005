import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";

import { Transform } from 'class-transformer';

export class SigninDto {
  @Transform(({value}: {value:unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @MaxLength(254)
  @IsEmail({}, { message: "E-mail inválido" })
  email!: string;

  @IsString()
  @MinLength(8, { message: "A senha deve ter pelo menos 8 caracteres" })
  @MaxLength(128, { message: "A senha é muito longa" })
  password!: string;
}