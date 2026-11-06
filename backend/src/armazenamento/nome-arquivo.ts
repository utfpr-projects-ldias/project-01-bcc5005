import { TextDecoder } from 'node:util';

/**
 * O nome do multipart pode chegar como Latin-1 interpretando bytes UTF-8.
 * Corrige somente sequências realmente decodificáveis: um nome legítimo não
 * deve ser silenciosamente transformado. A validação de segurança/limites
 * continua a cargo de validarArquivo antes de persistir no volume e no banco.
 */
export function normalizarNomeArquivo(nome: string): string {
  if (typeof nome !== 'string') return nome;
  let resultado = nome;
  if (/[ÃÂ][\u0080-\u00BF¡¢£¤¥¦§¨ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/u.test(nome) &&
      [...nome].every(letra => letra.charCodeAt(0) <= 255)) {
    try {
      const bytes = Buffer.from(nome, 'latin1');
      const convertido = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (!convertido.includes('\uFFFD')) resultado = convertido;
    } catch { /* Não transformar nome com sequência inválida de bytes. */ }
  }
  return resultado.normalize('NFC');
}
