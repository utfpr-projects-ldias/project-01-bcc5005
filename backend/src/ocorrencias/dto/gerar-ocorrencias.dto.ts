import { IsOptional, IsBoolean, IsInt, Min, Max, IsIn, Matches } from 'class-validator';

export class GerarOcorrenciasDto {
  @IsOptional()
  @IsBoolean()
  forcarRegeneracaoFuturas?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoAtividadesVerificadas?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoEvidenciasVerificadas?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoFotos?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoRelatorios?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoEvidenciasLivres?: number;

  @IsOptional() @IsIn(['NENHUMA', 'FOTO', 'RELATORIO', 'AMBOS']) evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS';
  @IsOptional() @IsIn(['DESCRITIVO','QUANTITATIVO']) modoRegistro?: 'DESCRITIVO'|'QUANTITATIVO';
  @IsOptional() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) metaQuantidade?: string;
  @IsOptional() @IsBoolean() permiteEncerramentoExcepcional?: boolean;
}
