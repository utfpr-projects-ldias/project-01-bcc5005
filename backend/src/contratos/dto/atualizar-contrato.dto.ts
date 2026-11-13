import {
  IsBoolean, IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf,
} from 'class-validator';

import { ModoCalculo } from '../modo-calculo.enum.js';
import { StatusContrato } from '../status-contrato.enum.js';

/**
 * DTO de atualização parcial (PATCH). Semântica dos campos:
 *
 * - Campos obrigatórios na entidade (`numeroContrato`, `orgaoContratante`,
 *   `objeto`, `inicioVigencia`, `terminoVigencia`, `status`, `modoCalculo`)
 *   usam `@ValidateIf(v !== undefined)`: omitir preserva; enviar `null`
 *   reprova no `@IsString`/`@IsEnum` e retorna 400 — não há "limpar" para
 *   coluna NOT NULL.
 * - Campos opcionais usam `@IsOptional()`: omitir preserva; enviar `null`
 *   limpa a coluna.
 *
 * A vigência é **revalidada** no service após o merge com o registro atual
 * (o DTO não conhece o outro lado). Enviar só `terminoVigencia` que quebre
 * `termino >= inicio` deve virar 400, não inconsistência silenciosa.
 */
export class AtualizarContratoDto {
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) confirmacaoVigencia?: string;

  /** Legado: flag recusada; fechamento da revisão exige endpoint próprio. */
  @IsOptional()
  @IsBoolean()
  retomarOperacao?: boolean;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(25)
  @Matches(/^\d{1,25}$/, { message: "Número do contrato deve conter apenas algarismos (até 25)." })
  numeroContrato?: string;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  processoAdministrativo?: string | null;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  orgaoContratante?: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  unidadeResponsavel?: string | null;

  @ValidateIf((_, v) => v !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  objeto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  descricao?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  dataAssinatura?: string | null;

  @ValidateIf((_, v) => v !== undefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  inicioVigencia?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  terminoVigencia?: string;

  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(StatusContrato)
  status?: StatusContrato;

  @IsOptional()
  @IsUUID('4')
  responsavelInternoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(25)
  fiscalGestor?: string | null;

  @ValidateIf((_, v) => v !== undefined)
  @IsEnum(ModoCalculo)
  modoCalculo?: ModoCalculo;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  observacoes?: string | null;
}