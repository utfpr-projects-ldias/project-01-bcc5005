import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class CriarOcorrenciaManualDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
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

  @IsOptional()
  @IsString()
  quantidadeRealizada?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  observacoes?: string | null;
}
