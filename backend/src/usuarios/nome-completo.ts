import { BadRequestException } from '@nestjs/common';

/** Nome de domínio; trim e espaços repetidos são normalizados no servidor. */
export const REGEX_NOME_COMPLETO = /^\p{L}[\p{L}\p{M}'’.-]*(?:[ \t]+\p{L}[\p{L}\p{M}'’.-])*$/u;

export function normalizarNomePerfil(valor: unknown): string {
  if (typeof valor !== 'string') throw new BadRequestException('Informe o nome');
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > 30 || !/^\p{L}[\p{L}\p{M}'’.-]*(?: +\p{L}[\p{L}\p{M}'’.-]*)*$/u.test(nome)) {
    throw new BadRequestException('Informe um nome válido (de 3 a 30 caracteres)');
  }
  return nome;
}

export function normalizarNomeCompleto(valor: unknown, limite = 160): string {
  if (typeof valor !== 'string') throw new BadRequestException('Informe o nome completo');
  const nome = valor.trim().replace(/\s+/g, ' ');
  if (nome.length < 3 || nome.length > limite || !REGEX_NOME_COMPLETO.test(nome)) {
    throw new BadRequestException(`Informe um nome válido (até ${limite} caracteres)`);
  }
  return nome;
}
