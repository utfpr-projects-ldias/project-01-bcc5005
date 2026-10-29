import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** E-mail e senha são operações distintas de PATCH de perfil/ativo. */
export class AlterarEmailDto {
  @Transform(({ value }: {value: unknown}) => typeof value === 'string' ? value.trim().toLowerCase() : value)
  @IsEmail() @MaxLength(320) email!: string;
}

export class RedefinirSenhaDto {
  @IsString() @MinLength(12) @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/)
  novaSenha!: string;
}
