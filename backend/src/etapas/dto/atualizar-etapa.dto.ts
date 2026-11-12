import {
  IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, Matches,
  MaxLength, ValidateIf,
} from 'class-validator';
import { StatusEtapa } from '../status-etapa.enum.js';

/** PATCH: omissão mantém o valor, null limpa somente campos opcionais. */
export class AtualizarEtapaDto {
  @ValidateIf((_, valor: unknown) => valor !== undefined)
  @IsString() @IsNotEmpty() @MaxLength(255)
  nome?: string;

  @IsOptional() @IsString() @MaxLength(50)
  codigo?: string | null;

  @IsOptional() @IsString() @MaxLength(3000)
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

  @IsOptional() @IsString() @MaxLength(3000)
  observacoes?: string | null;
}
