import { IsEmail, IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PerfilUsuario } from '../perfil-usuario.enum.js';

/** A senha é transitória: pertence apenas ao SuperTokens, jamais ao PostgreSQL. */
export class CriarFuncionarioDto {
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
