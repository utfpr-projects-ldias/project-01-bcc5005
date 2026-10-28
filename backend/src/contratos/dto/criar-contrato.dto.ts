import {
  IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength,
} from 'class-validator';

import { ModoCalculo } from '../modo-calculo.enum.js';
import { StatusContrato } from '../status-contrato.enum.js';

/**
 * DTO de criação — PRD §8.2 (obrigatórios e opcionais exatos).
 *
 * Obrigatórios (RF-01/§8.2): numeroContrato, orgaoContratante, objeto,
 * inicioVigencia, terminoVigencia, status, modoCalculo.
 * Opcionais: processoAdministrativo, unidadeResponsavel, descricao,
 * dataAssinatura, responsavelInternoId, fiscalGestor, observacoes.
 *
 * Datas como string `YYYY-MM-DD` (tipo `date` no PostgreSQL, sem timezone).
 * `@IsDateString({ strict: true })` rejeita mês/dia inexistente; a ordem
 * `termino >= inicio` e a checagem dupla de calendário real ficam no
 * service — assim o erro é 400 uniforme, sem depender do parser do DTO.
 *
 * Nenhum campo financeiro (valor/saldo/pagamento) existe aqui: R-01, RB-13.
 * Nenhum dos opcionais (fiscal/responsável) é exigido: issue veda essa
 * obrigatoriedade sem decisão adicional.
 */
export class CriarContratoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  numeroContrato!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  processoAdministrativo?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  orgaoContratante!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  unidadeResponsavel?: string | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  objeto!: string;

  @IsOptional()
  @IsString()
  descricao?: string | null;

  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  dataAssinatura?: string | null;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  inicioVigencia!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "Use data civil YYYY-MM-DD, sem horário" })
  terminoVigencia!: string;

  @IsEnum(StatusContrato)
  status!: StatusContrato;

  @IsOptional()
  @IsUUID('4')
  responsavelInternoId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  fiscalGestor?: string | null;

  @IsEnum(ModoCalculo)
  modoCalculo!: ModoCalculo;

  @IsOptional()
  @IsString()
  observacoes?: string | null;
}