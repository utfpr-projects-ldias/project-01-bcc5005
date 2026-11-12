import { ArrayMinSize, ArrayUnique, IsArray, IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** Sem contratoId: alterar o contrato de uma atividade não é operação permitida. */
export class UpdateAtividadeDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) titulo?: string;
  @IsOptional() @IsDateString({ strict: true }) dataHora?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(5000) descricao?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) tipo?: string;
  @IsOptional() @IsString() @MaxLength(255) responsavel?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) participantes?: string[];
  @IsOptional() @IsString() @MaxLength(255) local?: string;
  @IsOptional() @IsString() @MaxLength(80) duracao?: string;
  @IsOptional() @IsString() @MaxLength(5000) observacoes?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayUnique() @IsUUID('all', { each: true }) entregavelIds?: string[];
}
