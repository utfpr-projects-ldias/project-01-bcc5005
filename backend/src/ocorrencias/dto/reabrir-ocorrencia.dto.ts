import { IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
export class ReabrirOcorrenciaDto {
  @IsString() @IsNotEmpty() @MinLength(15) @MaxLength(200) justificativa!: string;
}
