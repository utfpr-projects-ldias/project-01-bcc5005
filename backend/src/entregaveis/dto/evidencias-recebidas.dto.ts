import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, IsUUID, IsIn, ValidateNested, IsObject, IsArray, ArrayMaxSize, ArrayUnique } from 'class-validator';
import { Type } from 'class-transformer';

/** Quantidade em unidade do entregável, nunca percentual. */
export class EnviarComprovanteDto {
  @IsOptional() @IsString() @MaxLength(30000) destinosCompartilhados?: string;
  /** Multipart: listas delimitadas por vírgula, validadas e resolvidas no servidor. */
  @IsOptional() @IsString() @MaxLength(3699) ocorrenciasVinculadas?: string;
  @IsOptional() @IsString() @MaxLength(3699) atividadesVinculadas?: string;
  @IsOptional() @IsString() @Matches(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/) percentualExecucao?: string;
  @IsOptional() @IsUUID() ocorrenciaExecucaoId?:string;
  @IsOptional() @IsUUID() comprovaExecucaoId?: string;
  @IsOptional() @IsString() @MaxLength(150) descricao?: string;
  @IsOptional() @IsString() @Matches(/^(?:\d{1,15})(?:\.\d{1,3})?$/)
  quantidadeExecutada?: string;
  @IsOptional() @IsUUID() ocorrenciaQuantidadeId?: string;
  @IsOptional() @IsIn(['NOVA_EXECUCAO', 'COMPROVACAO']) origemQuantidade?: 'NOVA_EXECUCAO' | 'COMPROVACAO';
  @IsOptional() @IsString() @MaxLength(100) referenciaExecucao?: string;
}
export class EditarEvidenciaEsperadaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) tipoEvidencia?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(65) descricao?: string | null;
  @IsOptional() @IsBoolean() obrigatoria?: boolean;
  @IsOptional() @IsObject() @ValidateNested() @Type(() => EnviarComprovanteDto) rascunhoEnvio?: EnviarComprovanteDto;
}
export class VerificarComprovanteDto {
  @IsOptional() @IsString() @Matches(/^(?:\d{1,2}(?:\.\d{1,2})?|100(?:\.0{1,2})?)$/) percentualAprovado?: string;
  @IsOptional() @IsString() @Matches(/^(?:\d{1,15})(?:\.\d{1,3})?$/)
  quantidadeAprovada?: string;
}

/** Corrige a declaração da versão atual, sem substituir o arquivo. */
export class EditarContribuicaoEvidenciaDto {
  @IsIn(['SEM_CONTRIBUICAO','QUANTITATIVA','PERCENTUAL']) modalidade!: 'SEM_CONTRIBUICAO'|'QUANTITATIVA'|'PERCENTUAL';
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) valor?: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string;
}

/** Edição documental local: substitui apenas os vínculos selecionados, não a contribuição. */
export class EditarVinculosEvidenciaDto {
  @IsOptional() @IsUUID() comprovanteId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all',{each:true}) ocorrencias?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ArrayUnique() @IsUUID('all',{each:true}) atividades?: string[];
}
