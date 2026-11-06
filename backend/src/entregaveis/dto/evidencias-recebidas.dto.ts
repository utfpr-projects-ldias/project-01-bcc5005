import { IsBoolean, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class EditarEvidenciaEsperadaDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) tipoEvidencia?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(130) descricao?: string | null;
  @IsOptional() @IsBoolean() obrigatoria?: boolean;
}
export class EnviarComprovanteDto {
  @IsOptional() @IsString() @MaxLength(300) descricao?: string;
}
