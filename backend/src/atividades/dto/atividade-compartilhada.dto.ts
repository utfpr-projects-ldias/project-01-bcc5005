import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional,
  IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';
import { MedicaoAtividadeDto } from './medicao-atividade.dto.js';

export class VinculoContratoCompartilhadoDto {
  @IsUUID() contratoId!: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true })
  entregavelIds!: string[];
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  ocorrenciaIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique((m: MedicaoAtividadeDto) => m.ocorrenciaId)
  @ValidateNested({ each: true }) @Type(() => MedicaoAtividadeDto)
  medicoes?: MedicaoAtividadeDto[];
}

export class CriarAtividadeCompartilhadaDto {
  @IsString() @IsNotEmpty() @MaxLength(50) titulo!: string;
  @IsDateString({ strict: true }) dataHora!: string;
  @IsString() @IsNotEmpty() @MaxLength(500) descricao!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) tipo!: string;
  @IsOptional() @IsString() @MaxLength(25) responsavel?: string;
  @IsOptional() @IsString() @MaxLength(200) observacoes?: string;
  @IsOptional() @IsString() @MaxLength(50) local?: string;
  @IsOptional() @IsString() @MaxLength(25) duracao?: string;
  @IsArray() @ArrayMinSize(2) @ArrayMaxSize(20)
  @ValidateNested({ each: true }) @Type(() => VinculoContratoCompartilhadoDto)
  vinculos!: VinculoContratoCompartilhadoDto[];
}

export class AprovarCompartilhadaDto {
  /** Quando omitido, aprova todas as linhas pendentes às quais o usuário tem acesso. */
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true })
  contratoIds?: string[];
}
