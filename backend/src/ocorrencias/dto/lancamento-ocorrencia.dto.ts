import { IsBoolean, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CriarLancamentoOcorrenciaDto {
  /** Gerado uma vez pelo frontend antes do envio: protege contra duplo clique e retry. */
  @IsUUID() id!: string;
  @IsString() @Matches(/^(?!0+(?:\.0+)?$)\d{1,12}(?:\.\d{1,3})?$/, { message: 'Quantidade deve ser positiva e ter até três decimais.' })
  quantidade!: string;
  @IsOptional() @IsString() @MaxLength(25) justificativa?: string;
}
export class CorrigirLancamentoOcorrenciaDto {
  @IsString() @Matches(/^\d{1,12}(?:\.\d{1,3})?$/)
  quantidade!: string;
  @IsString() @MaxLength(25) justificativa!: string;
}
export class VincularComprovanteOcorrenciaDto { @IsUUID() comprovanteId!: string; }

export class BloquearLancamentoOcorrenciaDto { @IsBoolean() bloqueado!: boolean; }
export class ExcluirLancamentoOcorrenciaDto { @IsString() @MaxLength(25) justificativa!: string; }
