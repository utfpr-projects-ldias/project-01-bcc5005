import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class EditarEvidenciaEsperadaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(50) tipoEvidencia?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(65) descricao?: string | null;
  @IsOptional() @IsBoolean() obrigatoria?: boolean;
}
export class EnviarComprovanteDto {
  @IsOptional() @IsString() @MaxLength(150) descricao?: string;
}
