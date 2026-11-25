import {ParcelaAtividadeDto} from './parcela-atividade.dto.js';
import { ValidateIf, ValidateNested, ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { MedicaoDiretaAtividadeDto } from './medicao-direta-atividade.dto.js';
import { MedicaoAtividadeDto } from './medicao-atividade.dto.js';

/** HU08: o contrato raiz é sempre conferido contra :contratoId na URL. */
export class CreateAtividadeDto {
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((p:ParcelaAtividadeDto)=>p?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>ParcelaAtividadeDto) parcelasPercentuais?:ParcelaAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @Matches(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/, { message: 'Informe um percentual de até 100%.' }) percentualExecucao?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() comprovaExecucaoId?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() ocorrenciaExecucaoId?:string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @Matches(/^(manual|atividade|evidencia):[0-9a-f-]{36}$/) referenciaQuantitativa?:string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() ocorrenciaReferenciaId?:string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() entregavelExecucaoId?: string;
  @IsUUID() contratoId!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(50) titulo!: string;
  @IsDateString({ strict: true }) dataHora!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(500) descricao!: string;
  @IsString() @IsNotEmpty() @Matches(/\S/, {message: 'Não informe somente espaços.'}) @MaxLength(40) tipo!: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string | null;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) ocorrenciaIds?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayUnique((m: MedicaoAtividadeDto) => m?.ocorrenciaId)
  @ValidateNested({ each: true }) @Type(() => MedicaoAtividadeDto)
  medicoes?: MedicaoAtividadeDto[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((m:MedicaoDiretaAtividadeDto)=>m?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>MedicaoDiretaAtividadeDto)
  medicoesDiretas?:MedicaoDiretaAtividadeDto[];
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadeExecucao?: string | null;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsUUID() responsavelId?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) responsavel?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(25, { each: true }) participantes?: string[];
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(50) local?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(25) duracao?: string;
  @ValidateIf((_obj, valor) => valor !== undefined) @IsString() @MaxLength(200) observacoes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) entregavelIds!: string[];
}
