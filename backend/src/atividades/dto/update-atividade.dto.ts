import {ParcelaAtividadeDto} from './parcela-atividade.dto.js';
import {MedicaoDiretaAtividadeDto} from './medicao-direta-atividade.dto.js';
import { ValidateIf, ValidateNested, ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MedicaoAtividadeDto } from './medicao-atividade.dto.js';

/** Sem contratoId: alterar o contrato de uma atividade não é operação permitida. */
export class UpdateAtividadeDto {
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((p:ParcelaAtividadeDto)=>p?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>ParcelaAtividadeDto) parcelasPercentuais?:ParcelaAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((p:MedicaoDiretaAtividadeDto)=>p?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>MedicaoDiretaAtividadeDto) medicoesDiretas?:MedicaoDiretaAtividadeDto[];

  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(50) titulo?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsDateString({ strict: true }) dataHora?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(500) descricao?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(40) tipo?: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string | null;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true }) ocorrenciaIds?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique((m: MedicaoAtividadeDto) => m?.ocorrenciaId)
  @ValidateNested({ each: true }) @Type(() => MedicaoAtividadeDto)
  medicoes?: MedicaoAtividadeDto[];
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadeExecucao?: string | null;
  @IsOptional() @IsUUID() responsavelId?: string | null;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) responsavel?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(25, { each: true }) participantes?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(50) local?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) duracao?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(200) observacoes?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all', { each: true }) entregavelIds?: string[];
}
