import { IsEnum, IsOptional, IsString, MaxLength, Matches, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { CategoriaDocumento } from '../categoria-documento.js';

export class CriarDocumentoDto {
  @IsEnum(CategoriaDocumento)
  categoria!: CategoriaDocumento;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  @Matches(/\S/, { message: 'Descrição não pode conter somente espaços' })
  descricao?: string;
}

export class EditarDocumentoDto {
  @IsOptional()
  @IsEnum(CategoriaDocumento)
  categoria?: CategoriaDocumento;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  @Matches(/\S/, { message: 'Descrição não pode conter somente espaços' })
  descricao?: string | null;
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

  @IsOptional()
  @IsIn(['true', 'false'])
  arquivados?: 'true' | 'false';
}
