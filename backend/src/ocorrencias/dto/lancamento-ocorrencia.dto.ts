import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CriarLancamentoOcorrenciaDto {
  /** Gerado uma vez pelo frontend antes do envio: protege contra duplo clique e retry. */
  @IsUUID() id!: string;
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d{1,15}(?:\.\d{1,3})?$/, { message: 'Quantidade deve ser positiva e ter até três decimais.' })
  quantidade!: string;
  @IsOptional() @IsString() @MaxLength(200) justificativa?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) data?: string;
  @IsOptional() @IsString() @MaxLength(300) observacao?: string;
}
export class CorrigirLancamentoOcorrenciaDto {
  @IsOptional() @IsString() @Matches(/^\d{1,10}$/) versaoEsperada?: string;
  @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/)
  quantidade!: string;
  @IsString() @MaxLength(200) justificativa!: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) data?: string;
  @IsOptional() @IsString() @MaxLength(300) observacao?: string;
}
export class DecidirLancamentoOcorrenciaDto {
  @IsOptional() @IsString() @Matches(/^\d{1,10}$/) versaoEsperada?: string;
  @IsIn(['APROVADO','REJEITADO']) decisao!: 'APROVADO'|'REJEITADO';
  @IsOptional() @IsString() @MaxLength(300) motivo?: string;
}
export class VincularComprovanteOcorrenciaDto { @IsUUID() comprovanteId!: string; }

export class BloquearLancamentoOcorrenciaDto { @IsBoolean() bloqueado!: boolean; }
export class ExcluirLancamentoOcorrenciaDto { @IsString() @MaxLength(200) justificativa!: string; }
