import { IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { PeriodicidadeEntregavel } from '../../entregaveis/periodicidade-entregavel.enum.js';
export class ReplanejarOcorrenciasDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) inicioFuturo!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) terminoPrevisto!: string;
  @IsEnum(PeriodicidadeEntregavel) periodicidade!: PeriodicidadeEntregavel;
  @IsOptional() @IsIn(['DESCRITIVO', 'QUANTITATIVO']) modoRegistro?: 'DESCRITIVO' | 'QUANTITATIVO';
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) metaQuantidade?: string;
  @IsOptional() @IsString() @MaxLength(40) unidadeMedida?: string;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) confirmacao?: string;
}
