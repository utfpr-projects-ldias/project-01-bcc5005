import {
  IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches,
  MaxLength, ValidateIf,
} from 'class-validator';
import { StatusEtapa } from '../status-etapa.enum.js';

/** PATCH: omissão mantém o valor, null limpa somente campos opcionais.
 * Limites físicos permitem reenviar nomes/códigos legados inalterados;
 * EtapasService mantém os limites de negócio para novos valores. */
export class AtualizarEtapaDto {
  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  estadoAnterior?: string;

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString() @IsNotEmpty() @MaxLength(255)
  nome?: string;

  @IsOptional() @IsString() @MaxLength(50)
  codigo?: string | null;

  @IsOptional() @IsString() @MaxLength(400)
  descricao?: string | null;

  @IsOptional() @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use data civil YYYY-MM-DD' })
  inicioPrevisto?: string | null;

  @IsOptional() @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use data civil YYYY-MM-DD' })
  terminoPrevisto?: string | null;

  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsEnum(StatusEtapa)
  status?: StatusEtapa;

  @IsOptional() @IsString() @MaxLength(150)
  observacoes?: string | null;
}
