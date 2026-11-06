/** Conserta somente nomes UTF-8 que foram interpretados como Latin-1 em uploads legados.
 * Não altera hashes, bytes, extensão nem registros históricos da auditoria. */
export function nomeArquivoLegivel(valor: string): string {
  if (!/[ÃÂ][\u0080-\u00BF©¡¢£¤¥¦§¨ª«¬®¯°±²³´µ¶·¸¹º»¼½¾¿]/u.test(valor)) return valor.normalize('NFC');
  try {
    const bytes = Uint8Array.from(valor, caractere => caractere.charCodeAt(0));
    const recuperado = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!recuperado.includes('\uFFFD') && recuperado !== valor) return recuperado.normalize('NFC');
  } catch { /* O nome pode ser Latin-1 legítimo; não convertê-lo cegamente. */ }
  return valor.normalize('NFC');
}
