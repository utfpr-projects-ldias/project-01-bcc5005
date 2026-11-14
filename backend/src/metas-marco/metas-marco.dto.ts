import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CriarMetaMarcoDto {
  @IsIn(['OCORRENCIA', 'ATIVIDADE', 'EVIDENCIA']) tipo!: 'OCORRENCIA'|'ATIVIDADE'|'EVIDENCIA';
  @IsString() @MaxLength(60) titulo!: string;
  @IsInt() @Min(1) @Max(100) quantidadeExigida!: number;
  @IsOptional() @IsDateString() dataPrevista?: string | null;
  @IsOptional() @IsDateString() inicioPrevisto?: string | null;
  @IsOptional() @IsDateString() terminoPrevisto?: string | null;
  @IsOptional() @IsString() @MaxLength(150) observacoes?: string | null;
}
export class EditarMetaMarcoDto {
  @IsOptional() @IsString() @MaxLength(60) titulo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) quantidadeExigida?: number;
  @IsOptional() @IsDateString() dataPrevista?: string | null;
  @IsOptional() @IsDateString() inicioPrevisto?: string | null;
  @IsOptional() @IsDateString() terminoPrevisto?: string | null;
  @IsOptional() @IsString() @MaxLength(150) observacoes?: string | null;
}
export class VincularMetaMarcoDto {
  @IsUUID() registroId!: string;
}
export class DecidirVinculoMetaMarcoDto {
  @IsOptional() @IsString() @MaxLength(200) justificativa?: string;
}
