import { IsEnum, IsOptional, IsString, MaxLength, Matches, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaDocumento } from '../categoria-documento.js';

export class CriarDocumentoDto {
  @IsEnum(CategoriaDocumento)
  categoria!: CategoriaDocumento;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Matches(/\S/, { message: 'Descrição não pode conter somente espaços' })
  descricao?: string;
}

export class ListarDocumentosDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  pagina?: number;

  @IsOptional()
  @IsEnum(CategoriaDocumento)
  categoria?: CategoriaDocumento;
}
