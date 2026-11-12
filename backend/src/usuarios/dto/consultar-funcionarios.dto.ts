import { Transform } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ConsultarFuncionariosDto {
  @IsOptional() @Transform(({ value }: {value: unknown}) => value === 'true' ? true : value === 'false' ? false : value)
  @IsBoolean() ativo?: boolean;

  @IsOptional() @Transform(({ value }: {value: unknown}) => Number(value))
  @IsInt() @Min(1) pagina?: number;

  @IsOptional() @Transform(({ value }: {value: unknown}) => Number(value))
  @IsInt() @Min(1) @Max(100) limite?: number;

  @IsOptional() @IsString() @MaxLength(160) busca?: string;
}
