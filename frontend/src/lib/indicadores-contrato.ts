import type { Etapa } from './etapas';
import type { Entregavel, ResumoDocumentalEntregavel } from './entregaveis';
import { comprovacaoDocumentalCompleta } from './situacao-documental-etapa';

/** Resumo de conclusões efetivas; arquivos verificados, isoladamente, não fecham o pai.
 * Itens arquivados (inclusive filhos de etapa arquivada) não entram nos totais ativos.
 */
export function calcularIndicadoresContrato(
  contratoId: string,
  etapas: Etapa[],
  entregaveis: Entregavel[],
  resumo: Record<string, ResumoDocumentalEntregavel>,
) {
  const etapasAtivas = etapas.filter(e => e.contratoId === contratoId && !e.arquivadoEm);
  const idsEtapas = new Set(etapasAtivas.map(e => e.id));
  const entregaveisAtivos = entregaveis.filter(e => e.contratoId === contratoId &&
    !e.arquivadoEm && idsEtapas.has(e.etapaId));
  // O número nas barras/pizzas informa progresso documental dos filhos, tal qual
  // o cartão da etapa; a elegibilidade operacional permanece separada e rígida.
  const entregavelComprovado = (e: Entregavel) =>
    !e.reabertoEm && comprovacaoDocumentalCompleta(resumo[e.id]);
  const entregavelConcluido = (e: Entregavel) =>
    e.statusExecucao === 'CONCLUIDO' && entregavelComprovado(e);
  const entregaveisConcluidos = entregaveisAtivos.filter(entregavelComprovado).length;
  const etapasConcluidas = etapasAtivas.filter(etapa => {
    if (etapa.status !== 'CONCLUIDA' || etapa.reabertoEm) return false;
    const filhos = entregaveisAtivos.filter(e => e.etapaId === etapa.id);
    return filhos.length > 0 && filhos.every(entregavelComprovado);
  }).length;
  const evidenciasEsperadas = entregaveisAtivos.reduce((s, e) => s + e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm).length, 0);
  const documentacaoCompleta = etapasAtivas.length > 0 && entregaveisAtivos.length > 0 && evidenciasEsperadas > 0 &&
    etapasConcluidas === etapasAtivas.length && entregaveisConcluidos === entregaveisAtivos.length &&
    entregaveisAtivos.every(entregavelConcluido);
  return {
    etapas: { concluidas: etapasConcluidas, total: etapasAtivas.length },
    entregaveis: { concluidos: entregaveisConcluidos, total: entregaveisAtivos.length },
    documentacaoCompleta,
  };
}
