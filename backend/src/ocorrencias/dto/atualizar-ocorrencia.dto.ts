import {
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { StatusOcorrencia } from '../status-ocorrencia.enum.js';

export class AtualizarOcorrenciaDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  titulo?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataPrevista deve estar no formato YYYY-MM-DD',
  })
  dataPrevista?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dataRealizada deve estar no formato YYYY-MM-DD',
  })
  dataRealizada?: string | null;

  @IsOptional()
  @IsEnum(StatusOcorrencia)
  status?: StatusOcorrencia;

  @IsOptional()
  @IsString()
  quantidadeRealizada?: string | null;

  @IsOptional()
  @IsString()
  @Matches(/^\d{1,15}(?:\.\d{1,3})?$/)
  metaQuantidade?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  observacoes?: string | null;
}
