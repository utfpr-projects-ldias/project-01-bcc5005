import { IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min } from 'class-validator';
import type { TipoMetaMarco, TipoRegistroMeta } from './meta-marco.entity.js';
export class CriarMetaMarcoDto {
  @IsIn(['DESCRITIVA','QUANTITATIVA']) tipo!: TipoMetaMarco;
  @IsString() @MaxLength(60) titulo!: string;
  @IsInt() @Min(1) @Max(10000) pesoCentesimos!: number;
  @IsString() @MaxLength(1000) criterioConclusao!: string;
  @IsOptional() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadePrevista?: string | null;
  @IsOptional() @IsString() @MaxLength(40) unidadeMedida?: string | null;
  @IsInt() @Min(0) @Max(100) provasExigidas!: number;
  @IsOptional() @IsDateString() dataPrevista?: string | null;
  @IsOptional() @IsDateString() inicioPrevisto?: string | null;
  @IsOptional() @IsDateString() terminoPrevisto?: string | null;
  @IsOptional() @IsString() @MaxLength(150) observacoes?: string | null;
}
export class EditarMetaMarcoDto extends CriarMetaMarcoDto {}
export class VincularMetaMarcoDto {
  @IsUUID() registroId!: string;
  @IsIn(['OCORRENCIA','ATIVIDADE','EVIDENCIA']) tipo!: TipoRegistroMeta;
}
export const ACOES_META = ['solicitar-conclusao','solicitar-conclusao-parcial','solicitar-encerramento','solicitar-regularizacao','aprovar','devolver','reabrir','arquivar','reativar'] as const;
export type AcaoMeta = typeof ACOES_META[number];
export class TransicaoMetaMarcoDto {
  @IsIn(ACOES_META) acao!: AcaoMeta;
  @IsOptional() @IsString() @MaxLength(1000) justificativa?: string;
}
