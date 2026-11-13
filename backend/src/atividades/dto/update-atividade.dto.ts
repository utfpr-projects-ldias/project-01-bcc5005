import { ValidateNested, ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MedicaoAtividadeDto } from './medicao-atividade.dto.js';

/** Sem contratoId: alterar o contrato de uma atividade não é operação permitida. */
export class UpdateAtividadeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) titulo?: string;
  @IsOptional() @IsDateString({ strict: true }) dataHora?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(500) descricao?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(40) tipo?: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string | null;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) ocorrenciaIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique((m: MedicaoAtividadeDto) => m.ocorrenciaId)
  @ValidateNested({ each: true }) @Type(() => MedicaoAtividadeDto)
  medicoes?: MedicaoAtividadeDto[];
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadeExecucao?: string | null;
  @IsOptional() @IsString() @MaxLength(25) responsavel?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(25, { each: true }) participantes?: string[];
  @IsOptional() @IsString() @MaxLength(50) local?: string;
  @IsOptional() @IsString() @MaxLength(25) duracao?: string;
  @IsOptional() @IsString() @MaxLength(200) observacoes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) entregavelIds?: string[];
}
