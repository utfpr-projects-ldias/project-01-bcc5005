import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
export class SolicitarConclusaoDto {
 @IsOptional() @IsBoolean() confirmacaoCumprimento?:boolean;
 @IsOptional() @IsString() @MaxLength(500) observacoesConclusao?:string;
}
