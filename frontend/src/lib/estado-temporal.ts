/** Estado operacional percebido: não grava no banco nem aumenta a execução física.
 * Datas civis ISO evitam efeitos de UTC/fuso sobre a virada do dia. */
export function diaLocalBrasil(agora = new Date()): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}
export function estadoTemporal<T extends string>(status: T, inicio: string | null | undefined, hoje = diaLocalBrasil()): T | 'EM_ANDAMENTO' {
  if (status !== 'NAO_INICIADO' || !inicio || !/^\d{4}-\d{2}-\d{2}/.test(inicio)) return status;
  // Uma ocorrência de período vigente, mesmo sem quantidade lançada,
  // aparece em andamento; conclusão, revisão e encerramento nunca mudam por data.
  return inicio.slice(0, 10) <= hoje ? 'EM_ANDAMENTO' : status;
}
