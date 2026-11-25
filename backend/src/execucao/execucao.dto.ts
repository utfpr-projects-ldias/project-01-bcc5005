import { IsNumber, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
export class AtualizarExecucaoDto {
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) percentualManual?: number;
  @IsOptional() @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) quantidadeRealizada?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dataEfetivaMarco?: string;
}
