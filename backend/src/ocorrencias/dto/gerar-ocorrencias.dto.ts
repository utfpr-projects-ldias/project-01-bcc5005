import { IsOptional, IsBoolean, IsInt, Min, Max, IsIn } from 'class-validator';

export class GerarOcorrenciasDto {
  @IsOptional()
  @IsBoolean()
  forcarRegeneracaoFuturas?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoAtividadesVerificadas?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoEvidenciasVerificadas?: number;
  @IsOptional() @IsIn(['NENHUMA', 'FOTO', 'RELATORIO', 'AMBOS']) evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS';
  @IsOptional() @IsBoolean() permiteEncerramentoExcepcional?: boolean;
}
