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
  @MaxLength(255)
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
  @MaxLength(3000)
  observacoes?: string | null;
}
