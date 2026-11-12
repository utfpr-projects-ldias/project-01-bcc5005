import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { TipoEntregavel } from '../../entregaveis/tipo-entregavel.enum.js';
import { PeriodicidadeEntregavel } from '../../entregaveis/periodicidade-entregavel.enum.js';

export class ConfigurarOcorrenciasDto {
  @IsIn(['LISTA','CALENDARIO']) modoVisualizacao!: 'LISTA' | 'CALENDARIO';
  @IsEnum(TipoEntregavel) tipoOperacional!: TipoEntregavel;
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadePrevista?: string | null;
  @IsOptional() @IsString() @MaxLength(80) unidadeMedida?: string | null;
  @IsOptional() @IsEnum(PeriodicidadeEntregavel) periodicidade?: PeriodicidadeEntregavel | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) inicioPrevisto?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) terminoPrevisto?: string | null;
}
