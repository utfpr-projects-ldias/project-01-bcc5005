import { BadRequestException } from '@nestjs/common';

/** Nome de domínio; trim e espaços repetidos são normalizados no servidor. */
export const REGEX_NOME_COMPLETO = /^\p{L}[\p{L}\p{M}'’.-]*(?:[ \t]+\p{L}[\p{L}\p{M}'’.-]*)+$/u;

export function normalizarNomeCompleto(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException('Informe o nome completo');
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > 25 || !REGEX_NOME_COMPLETO.test(nome)) {
    throw new BadRequestException('Informe nome e sobrenome válidos (até 25 caracteres)');
  }
  return nome;
}
