import {ParcelaAtividadeDto} from './parcela-atividade.dto.js';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty,
  IsString, IsUUID, MaxLength, Matches, ValidateNested, ValidateIf } from 'class-validator';
import { MedicaoDiretaAtividadeDto } from './medicao-direta-atividade.dto.js';
import { MedicaoAtividadeDto } from './medicao-atividade.dto.js';

export class VinculoContratoCompartilhadoDto {
  @IsUUID() contratoId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  entregavelIds!: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  ocorrenciaIds?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayUnique((m: MedicaoAtividadeDto) => m?.ocorrenciaId)
  @ValidateNested({ each: true }) @Type(() => MedicaoAtividadeDto)
  medicoes?: MedicaoAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((m:MedicaoDiretaAtividadeDto)=>m?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>MedicaoDiretaAtividadeDto)
  medicoesDiretas?:MedicaoDiretaAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((p:ParcelaAtividadeDto)=>p?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>ParcelaAtividadeDto) parcelasPercentuais?:ParcelaAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @Matches(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/) percentualExecucao?:string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() entregavelExecucaoId?:string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() ocorrenciaExecucaoId?:string;
}

export class CriarAtividadeCompartilhadaDto {
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(50) titulo!: string;
  @IsDateString({ strict: true }) dataHora!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(500) descricao!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(40) tipo!: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() responsavelId?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(20) @IsString({ each:true }) @MaxLength(25, { each:true }) participantes?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) responsavel?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(200) observacoes?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(50) local?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) duracao?: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => VinculoContratoCompartilhadoDto)
  vinculos!: VinculoContratoCompartilhadoDto[];
}

export class AprovarCompartilhadaDto {
  /** Quando omitido, aprova todas as linhas pendentes às quais o usuário tem acesso. */
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  contratoIds?: string[];
}
