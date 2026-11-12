import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { REGEX_NOME_COMPLETO } from '../nome-completo.js';
import { PerfilUsuario } from '../perfil-usuario.enum.js';

/** A senha é transitória: pertence apenas ao SuperTokens, jamais ao PostgreSQL. */
export class CriarFuncionarioDto {
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Matches(REGEX_NOME_COMPLETO, { message: 'Informe nome e sobrenome válidos' })
  nome!: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsEnum(PerfilUsuario)
  perfil!: PerfilUsuario;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9]).+$/)
  senhaInicial!: string;
}
