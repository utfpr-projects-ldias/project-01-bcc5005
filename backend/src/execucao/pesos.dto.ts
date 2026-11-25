import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsString, IsUUID, Matches, ValidateNested } from 'class-validator';
export class PesoItemDto {
  @IsUUID() entregavelId!: string;
  @IsString() @Matches(/^\d{1,3}(?:\.\d{1,4})?$/) peso!: string;
}
export class AtualizarPesosDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) versao!: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique((i: PesoItemDto) => i.entregavelId) @ValidateNested({ each: true }) @Type(() => PesoItemDto) pesos!: PesoItemDto[];
}
