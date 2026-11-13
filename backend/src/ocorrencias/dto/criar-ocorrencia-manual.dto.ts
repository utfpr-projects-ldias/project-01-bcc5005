import {
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsBoolean,
  IsInt, Min, Max,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CriarOcorrenciaManualDto {
  @IsOptional() @IsBoolean() exigeAtividade?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoAtividadesVerificadas?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) minimoEvidenciasVerificadas?: number;
  @IsOptional() @IsIn(['NENHUMA','FOTO','RELATORIO','AMBOS']) evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS';
  @IsOptional() @IsBoolean() permiteEncerramentoExcepcional?: boolean;

  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  titulo!: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'periodoInicio deve estar no formato YYYY-MM-DD',
  })
  periodoInicio?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'periodoFim deve estar no formato YYYY-MM-DD',
  })
  periodoFim?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataPrevista deve estar no formato YYYY-MM-DD',
  })
  dataPrevista?: string | null;

  /** Nova interface declara explicitamente se a execução usa unidades ou somente descrição. */
  @IsOptional()
  @IsIn(['QUANTITATIVO', 'DESCRITIVO'])
  modoRegistro?: 'QUANTITATIVO' | 'DESCRITIVO';

  @IsOptional()
  @IsString()
  quantidadeRealizada?: string | null;

  /** Quantidade planejada para esta ocorrência, distinta da realizada. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(?:\.\d{1,3})?$/)
  metaQuantidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  observacoes?: string | null;
}
