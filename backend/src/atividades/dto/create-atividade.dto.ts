import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** HU08: o contrato raiz é sempre conferido contra :contratoId na URL. */
export class CreateAtividadeDto {
  @IsUUID() contratoId!: string;
  @IsString() @IsNotEmpty() @MaxLength(120) titulo!: string;
  @IsDateString({ strict: true }) dataHora!: string;
  @IsString() @IsNotEmpty() @MaxLength(1500) descricao!: string;
  @IsString() @IsNotEmpty() @MaxLength(80) tipo!: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string | null;
  @IsOptional() @IsArray() @ArrayUnique() @IsUUID('all', { each: true }) ocorrenciaIds?: string[];
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadeExecucao?: string | null;
  @IsOptional() @IsString() @MaxLength(120) responsavel?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @MaxLength(100, { each: true }) participantes?: string[];
  @IsOptional() @IsString() @MaxLength(160) local?: string;
  @IsOptional() @IsString() @MaxLength(50) duracao?: string;
  @IsOptional() @IsString() @MaxLength(1000) observacoes?: string;
  @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) entregavelIds!: string[];
}
