import type { Entregavel } from './entregaveis';

/** Indicadores de planejamento. Nunca tratar null como zero de execução. */
export function indicadoresPlanejamento(itens: Entregavel[]) {
  const total = itens.length;
  const comExecucao = itens.filter(e => e.statusExecucao !== null).length;
  const concluidos = itens.filter(e => e.statusExecucao === 'CONCLUIDO').length;
  const percentuais = itens.map(e => e.percentualExecucao === null ? null : Number(e.percentualExecucao));
  // O PRD ainda não definiu o modo do avanço por etapa. Evitamos apresentar
  // como avanço físico uma média hipotética ou contar tempo decorrido.
  const todosComDados = total > 0 && percentuais.every((n): n is number => n !== null && Number.isFinite(n) && n >= 0 && n <= 100);
  const esperadas = itens.reduce((soma, e) => soma + e.evidenciasEsperadas.length, 0);
  const obrigatorias = itens.reduce((soma, e) => soma + e.evidenciasEsperadas.filter(item => item.obrigatoria).length, 0);
  return { total, comExecucao, concluidos, todosComDados, esperadas, obrigatorias };
}

export function resumoComprovacao(item: Entregavel): string {
  switch (item.situacaoComprovacao) {
    case 'COMPROVADO': return 'Comprovação registrada como completa';
    case 'EVIDENCIA_PARCIAL': return 'Comprovação parcial';
    case 'SEM_EVIDENCIA': return 'Sem evidência válida';
    default: return 'Comprovação ainda não acompanhada';
  }
}
