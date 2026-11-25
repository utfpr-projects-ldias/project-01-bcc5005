/** O início temporal deve ser tentado no máximo uma vez por dia, salvo falha.
 * Falhas admitem nova tentativa após cooldown; não criar POST em loop React. */
/** Notificação local após mutações na agenda (não após a própria ativação).
 * Permite reconsiderar ocorrências criadas no mesmo dia sem duplicar POST em renderizações.
 */
export const EVENTO_AGENDA_OCORRENCIAS_ALTERADA = 'agenda-ocorrencias:alterada';
export function avisarMudancaAgendaOcorrencias(contratoId: string): void {
  if (typeof window !== 'undefined')
    window.dispatchEvent(new CustomEvent(EVENTO_AGENDA_OCORRENCIAS_ALTERADA, { detail: { contratoId } }));
}
export type TentativaInicioTemporal = { chave: string; estado: 'EXECUTANDO'|'SUCESSO'|'FALHA'; instante: number };
export function chaveInicioTemporal(contratoId: string, data: Date = new Date()): string {
  const dia = new Intl.DateTimeFormat('sv-SE', {timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit'}).format(data);
  return `${contratoId}:${dia}`;
}
export function podeIniciarTemporal(ultima: TentativaInicioTemporal | null, chave: string, instante: number): boolean {
  return !ultima || ultima.chave !== chave || (ultima.estado === 'FALHA' && instante - ultima.instante >= 120_000);
}
