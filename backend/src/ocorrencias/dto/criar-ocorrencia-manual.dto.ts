import {
  IsNotEmpty,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CriarOcorrenciaManualDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
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
  @MaxLength(1000)
  observacoes?: string | null;
}
