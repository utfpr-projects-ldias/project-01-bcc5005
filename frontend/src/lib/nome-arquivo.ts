/** Exibe nomes de uploads legados com sequências UTF-8 interpretadas como Latin-1.
 * Não altera os bytes do arquivo, extensão, metadados persistidos nem auditoria.
 * Cada trecho suspeito é recuperado isoladamente, preservando Unicode já correto
 * (como travessões e emojis) presente no restante do nome.
 */
export function nomeArquivoLegivel(valor: string): string {
  const suspeito = /(?:[ÃÂ][\u0080-\u00BF])+/gu;
  return valor.replace(suspeito, (trecho) => {
    try {
      // decodeURIComponent está presente em Node/Jest/jsdom e navegadores;
      // TextDecoder pode estar ausente no ambiente de testes.
      const bytes = Array.from(trecho, (caractere) =>
        `%${caractere.charCodeAt(0).toString(16).padStart(2, '0')}`,
      ).join('');
      return decodeURIComponent(bytes);
    } catch {
      // Sequência realmente Latin-1 ou bytes incompletos: preservar o original.
      return trecho;
    }
  }).normalize('NFC');
}
