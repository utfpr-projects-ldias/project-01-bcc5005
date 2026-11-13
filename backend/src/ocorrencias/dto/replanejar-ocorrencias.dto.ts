import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';
import { PeriodicidadeEntregavel } from '../../entregaveis/periodicidade-entregavel.enum.js';
export class ReplanejarOcorrenciasDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) inicioFuturo!: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) terminoPrevisto!: string;
  @IsEnum(PeriodicidadeEntregavel) periodicidade!: PeriodicidadeEntregavel;
  @IsOptional() @IsString() @Matches(/^[a-f0-9]{64}$/) confirmacao?: string;
}
