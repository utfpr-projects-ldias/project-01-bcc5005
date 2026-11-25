import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsString, Matches, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { PerfilUsuario } from '../perfil-usuario.enum.js';
import { REGEX_NOME_COMPLETO } from '../nome-completo.js';

/** PATCH parcial: null e campos desconhecidos são proibidos. */
export class AtualizarFuncionarioDto {
  @ValidateIf((_obj: AtualizarFuncionarioDto, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value)
  @IsString()
  @MinLength(3)
  @MaxLength(160)
  @Matches(REGEX_NOME_COMPLETO, { message: 'Informe nome e sobrenome válidos' })
  nome?: string;

  @ValidateIf((_obj: AtualizarFuncionarioDto, value: unknown) => value !== undefined)
  @IsIn([PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR])
  perfil?: PerfilUsuario.GESTOR | PerfilUsuario.COLABORADOR;

  @ValidateIf((_obj: AtualizarFuncionarioDto, value: unknown) => value !== undefined)
  @IsBoolean()
  ativo?: boolean;
}
