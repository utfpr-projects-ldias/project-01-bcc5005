import { IsOptional, IsBoolean } from 'class-validator';

export class GerarOcorrenciasDto {
  @IsOptional()
  @IsBoolean()
  forcarRegeneracaoFuturas?: boolean;
}
