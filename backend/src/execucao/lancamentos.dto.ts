import { IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
export class DadosLancamentoDto {
  @IsString() @Matches(/^\d{1,15}(?:\.\d{1,3})?$/) valor!:string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) data!:string;
  @IsOptional() @IsString() @MaxLength(300) observacao?:string;
}
export class CorrigirLancamentoDto extends DadosLancamentoDto { @IsString() @MaxLength(200) motivo!:string; }
export class CriarLancamentoDto extends DadosLancamentoDto { @IsUUID('4') id!:string; @IsOptional() @IsUUID() ocorrenciaId?:string; }
export class DecidirLancamentoDto {
  @IsIn(['APROVADO','REJEITADO']) decisao!:'APROVADO'|'REJEITADO';
  @IsOptional() @IsString() @MaxLength(300) motivo?:string;
}
