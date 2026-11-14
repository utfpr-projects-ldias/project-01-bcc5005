import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** A meta prevista é distinta do realizado e do peso do período. */
export class EditarMetaOcorrenciaDto {
  @IsString()
  @Matches(/^\d{1,15}(?:\.\d{1,3})?$/, { message: 'Meta deve ser uma quantidade positiva, com até três casas decimais.' })
  metaQuantidade!: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  justificativa?: string;
}
