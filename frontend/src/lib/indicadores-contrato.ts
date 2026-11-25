import type { Etapa } from './etapas';
import type { Entregavel, ResumoDocumentalEntregavel } from './entregaveis';
import { resultadoFinalizacao } from './finalizados';

/** Contadores operacionais e documentais independentes, restritos ao contrato. */
export function calcularIndicadoresContrato(contratoId: string, etapas: Etapa[], entregaveis: Entregavel[], resumo: Record<string, ResumoDocumentalEntregavel>) {
  const etapasAtivas = etapas.filter(e => e.contratoId === contratoId && !e.arquivadoEm);
  const idsEtapas = new Set(etapasAtivas.map(e => e.id));
  const ativos = entregaveis.filter(e => e.contratoId === contratoId && !e.arquivadoEm && idsEtapas.has(e.etapaId));
  const etapasConcluidas = etapasAtivas.filter(e => !e.reabertoEm && !e.conclusaoSolicitadaEm && !e.encerramentoSolicitadoEm && resultadoFinalizacao('etapa', e.status)).length;
  const entregaveisConcluidos = ativos.filter(e => !e.reabertoEm && !e.regularizacaoDocumentalSolicitada && resultadoFinalizacao('entregavel', e.statusExecucao)).length;
  let evidencias = 0, verificadas = 0, exigencias = 0, atendidas = 0;
  for (const e of ativos) {
    const r = resumo[e.id];
    evidencias += r?.total ?? e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm).length;
    verificadas += r?.verificadasTotal ?? r?.verificadas ?? 0;
    exigencias += r?.exigenciasDocumentaisTotal ?? ((r?.obrigatorias ?? e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).length) + (r?.ocorrenciasExigidas ?? 0));
    atendidas += r?.exigenciasDocumentaisAtendidas ?? ((r?.verificadas ?? 0) + (r?.ocorrenciasAtendidas ?? 0));
  }
  return {
    etapas: { concluidas: etapasConcluidas, total: etapasAtivas.length },
    entregaveis: { concluidos: entregaveisConcluidos, total: ativos.length },
    evidencias: { feitas: verificadas, total: evidencias },
    comprovacao: { feitas: atendidas, total: exigencias },
    documentacaoDisponivel: ativos.every(e => Boolean(resumo[e.id])),
    documentacaoCompleta: ativos.length > 0 && ativos.every(e => Boolean(resumo[e.id])) && exigencias > 0 && atendidas === exigencias,
  };
}
