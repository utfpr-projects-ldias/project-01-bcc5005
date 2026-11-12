import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

/**
 * Controle otimista da ordem: enviar a ordem que a UI leu e a ordem desejada.
 * Ao divergir de qualquer alteração concorrente, responder 409 e recarregar.
 * Arrays devem conter todos os UUIDs do contrato, sem repetição.
 */
export class ReordenarEtapasDto {
  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID('4', { each: true })
  idsOrdemAtual!: string[];

  @IsArray() @ArrayNotEmpty() @ArrayUnique() @IsUUID('4', { each: true })
  idsOrdemNova!: string[];
}
