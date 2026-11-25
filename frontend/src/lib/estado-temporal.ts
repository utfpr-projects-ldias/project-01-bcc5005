/** Estado operacional percebido: não grava no banco nem aumenta a execução física.
 * Datas civis ISO evitam efeitos de UTC/fuso sobre a virada do dia. */
export function diaLocalBrasil(agora = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
/** A data planejada não é início efetivo. A API já projeta o estado a partir
 * da execução reconhecida, inclusive ocorrências com percentual agregado zero.
 * Os argumentos de data são mantidos para os chamadores da agenda civil. */
export function estadoTemporal<T extends string>(status: T, _inicio: string | null | undefined, _hoje = diaLocalBrasil()): T {
  return status;
}
