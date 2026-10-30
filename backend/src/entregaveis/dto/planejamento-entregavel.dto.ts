import { Type } from 'class-transformer';
import {
  Allow, ArrayMaxSize, IsArray, IsBoolean, IsEnum, IsNotEmpty,
  IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateIf, ValidateNested,
} from 'class-validator';
import { PeriodicidadeEntregavel } from '../periodicidade-entregavel.enum.js';
import { TipoEntregavel } from '../tipo-entregavel.enum.js';

/** Datas são civis (YYYY-MM-DD); decimais são strings para não perder precisão. */
export class CriarEntregavelDto {
  @IsUUID('4') etapaId!: string;
  @IsString() @IsNotEmpty() @MaxLength(255) nome!: string;
  @IsEnum(TipoEntregavel) tipo!: TipoEntregavel;
  @IsOptional() @IsString() @MaxLength(50) codigo?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) descricao?: string | null;
  @IsOptional() @IsUUID('4') responsavelId?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) inicioPrevisto?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) terminoPrevisto?: string | null;
  @IsOptional() @IsString() quantidadePrevista?: string | null;
  @IsOptional() @IsString() @MaxLength(80) unidadeMedida?: string | null;
  @IsOptional() @IsEnum(PeriodicidadeEntregavel) periodicidade?: PeriodicidadeEntregavel | null;
  /** Validação estrutural estrita no serviço; não transformar objeto arbitrário. */
  @Allow() configuracaoPeriodicidade?: unknown;
  @IsOptional() @IsString() peso?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) criterioConclusao?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) observacoes?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true })
  @Type(() => ItemEvidenciaEsperadaDto) evidenciasEsperadas?: ItemEvidenciaEsperadaDto[];
}

/** PATCH não aceita campos de execução e comprovação (reservados para TEC09/TEC10). */
export class EditarEntregavelDto {
  @ValidateIf((_, v: unknown) => v !== undefined) @IsUUID('4') etapaId?: string;
  @ValidateIf((_, v: unknown) => v !== undefined) @IsString() @IsNotEmpty() @MaxLength(255) nome?: string;
  @ValidateIf((_, v: unknown) => v !== undefined) @IsEnum(TipoEntregavel) tipo?: TipoEntregavel;
  @IsOptional() @IsString() @MaxLength(50) codigo?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) descricao?: string | null;
  @IsOptional() @IsUUID('4') responsavelId?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) inicioPrevisto?: string | null;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) terminoPrevisto?: string | null;
  @IsOptional() @IsString() quantidadePrevista?: string | null;
  @IsOptional() @IsString() @MaxLength(80) unidadeMedida?: string | null;
  @IsOptional() @IsEnum(PeriodicidadeEntregavel) periodicidade?: PeriodicidadeEntregavel | null;
  @Allow() configuracaoPeriodicidade?: unknown;
  @IsOptional() @IsString() peso?: string | null;
  @IsOptional() @IsString() @MaxLength(5000) criterioConclusao?: string | null;
  @IsOptional() @IsString() @MaxLength(3000) observacoes?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true })
  @Type(() => ItemEvidenciaEsperadaDto) evidenciasEsperadas?: ItemEvidenciaEsperadaDto[];
}

export class ItemEvidenciaEsperadaDto {
  @IsOptional() @IsUUID('4') id?: string;
  @IsString() @IsNotEmpty() @MaxLength(100) tipoEvidencia!: string;
  @IsOptional() @IsString() @MaxLength(3000) descricao?: string | null;
  @IsBoolean() obrigatoria!: boolean;
}

export class SubstituirChecklistDto {
  @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true })
  @Type(() => ItemEvidenciaEsperadaDto)
  itens!: ItemEvidenciaEsperadaDto[];
}

export class ListarEntregaveisDto {
  @IsOptional() @IsUUID('4') etapaId?: string;
}
