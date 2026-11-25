import { ArrayMaxSize, ArrayUnique, IsArray, IsOptional, IsString, IsUUID, Matches, ValidateIf, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
export class ReferenciaQuantitativaAtividadeDto {
  @IsUUID() ocorrenciaId!: string;
  @IsString() @Matches(/^(manual|atividade|evidencia):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i) referencia!: string;
}
export class ReferenciaPercentualAtividadeDto {
  @IsUUID() entregavelId!: string;
  @IsOptional() @IsUUID() ocorrenciaId?: string;
  @IsUUID() referenciaId!: string;
}
/** Omitir preserva; [] remove explicitamente a modalidade. Não declara novas quantidades. */
export class EditarReferenciasAtividadeDto {
  @ValidateIf((_obj,v)=>v!==undefined) @IsArray() @ArrayMaxSize(100) @ArrayUnique((v:ReferenciaQuantitativaAtividadeDto)=>v?.ocorrenciaId)
  @ValidateNested({each:true}) @Type(()=>ReferenciaQuantitativaAtividadeDto) quantitativas?: ReferenciaQuantitativaAtividadeDto[];
  @ValidateIf((_obj,v)=>v!==undefined) @IsArray() @ArrayMaxSize(30) @ArrayUnique((v:ReferenciaPercentualAtividadeDto)=>v?.entregavelId)
  @ValidateNested({each:true}) @Type(()=>ReferenciaPercentualAtividadeDto) percentuais?: ReferenciaPercentualAtividadeDto[];
}
