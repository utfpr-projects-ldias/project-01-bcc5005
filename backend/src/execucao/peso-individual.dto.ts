import { IsString, Matches } from 'class-validator';

/** Atualiza somente um peso. Não ativa ponderação automaticamente. */
export class AtualizarPesoIndividualDto {
  @IsString() @Matches(/^[a-f0-9]{64}$/) versao!: string;
  @IsString() @Matches(/^(?:100(?:\.0{1,4})?|\d{1,2}(?:\.\d{1,4})?)$/) peso!: string;
}
