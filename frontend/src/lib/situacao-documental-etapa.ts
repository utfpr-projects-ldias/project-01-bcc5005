import type { Etapa, StatusEtapa } from './etapas';
import type { Entregavel, ResumoDocumentalEntregavel } from './entregaveis';

/** Retorna confirmação DOCUMENTAL, não conclusão física.
 * O aceite documental depende apenas das OBRIGATÓRIAS; evidências opcionais
 * permanecem visíveis, mas não bloqueiam. Exige ao menos uma obrigatória para
 * evitar conclusão automática por 0/0. */
export function comprovacaoDocumentalCompleta(registro: ResumoDocumentalEntregavel | undefined): boolean {
  if (!registro) return false;
  if (typeof registro.obrigatorias === 'number' && typeof registro.verificadas === 'number')
    return registro.obrigatorias + (registro.ocorrenciasExigidas ?? 0) > 0 && registro.verificadas === registro.obrigatorias && (registro.ocorrenciasExigidas ?? 0) === (registro.ocorrenciasAtendidas ?? 0);
  // Legado de fixtures anteriores à exposição de obrigatórias pela API.
  return (registro.total ?? 0) > 0 && registro.verificadasTotal === registro.total;
}

export function documentacaoSemPendencia(registro: ResumoDocumentalEntregavel | undefined): boolean {
  return Boolean(registro && (comprovacaoDocumentalCompleta(registro) || (registro.obrigatorias === 0 && (registro.ocorrenciasExigidas ?? 0) === 0)));
}

/** Conclusão visível exige que a entidade não esteja explicitamente reaberta. */
export function entregavelDocumentalmenteConcluido(
  e: Pick<Entregavel, 'reabertoEm'>, resumo: ResumoDocumentalEntregavel | undefined,
): boolean { return !e.reabertoEm && comprovacaoDocumentalCompleta(resumo); }

/** Contrato documentalmente completo não altera seu status operacional. */
export function contratoDocumentalmenteConcluido(
  contrato: { reabertoEm?: string | null }, etapas: Etapa[] | undefined,
  entregaveis: Entregavel[] | undefined, resumo: Record<string, ResumoDocumentalEntregavel> | undefined,
): boolean {
  if (contrato.reabertoEm || !etapas || !entregaveis || !resumo) return false;
  const ativas = etapas.filter(e => !e.arquivadoEm);
  if (ativas.length === 0) return false;
  return ativas.every(etapa => {
    if (etapa.reabertoEm || etapa.status !== 'CONCLUIDA') return false;
    const itens = entregaveis.filter(e => e.etapaId === etapa.id && !e.arquivadoEm);
    return itens.length > 0 && itens.every(e => e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm && !e.regularizacaoDocumentalSolicitada && documentacaoSemPendencia(resumo[e.id]));
  });
}

/** O status operacional é uma decisão persistida e auditada, distinta da situação
 * documental. Nunca rebaixar uma etapa concluída por alterações em comprovantes.
 * Os parâmetros de comprovação são mantidos para compatibilidade com callers. */
export function situacaoDocumentalEtapa(
  etapa: Etapa,
  _itens: Entregavel[] | undefined,
  _resumo: Record<string, ResumoDocumentalEntregavel> | undefined,
): StatusEtapa {
  void _itens; void _resumo;
  if (etapa.reabertoEm && etapa.status === 'CONCLUIDA') return 'EM_ANDAMENTO';
  return etapa.status;
}

/** Critério exibido na UI para a mesma trava da API. Não basta o resumo 100%:
 * a conclusão operacional de cada filho precisa ter sido persistida e nenhuma
 * evidência ativa pode estar em revisão. Só vale para filhos desta etapa. */
export function etapaPodeSerConcluida(
  etapa: Etapa, itens: Entregavel[] | undefined,
  resumo: Record<string, ResumoDocumentalEntregavel> | undefined,
): boolean {
  if (etapa.arquivadoEm || !itens || !resumo) return false;
  const ativos = itens.filter(e => !e.arquivadoEm && e.etapaId === etapa.id);
  return ativos.length > 0 && ativos.every(e =>
    e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm && !e.regularizacaoDocumentalSolicitada &&
    documentacaoSemPendencia(resumo[e.id]) &&
    e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).every(ev => !ev.reabertoEm)
  );
}

export function etapaPodeSerConcluidaParcialmente(etapa: Etapa, itens: Entregavel[] | undefined,
  resumo: Record<string, ResumoDocumentalEntregavel> | undefined): boolean {
  if (etapa.arquivadoEm || !itens || !resumo) return false;
  const ativos = itens.filter(e => !e.arquivadoEm && e.etapaId === etapa.id);
  return ativos.length > 0 && ativos.every(e => !e.reabertoEm && !e.regularizacaoDocumentalSolicitada && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(e.statusExecucao ?? '') && resumo[e.id])
    && ativos.some(e => !documentacaoSemPendencia(resumo[e.id]));
}
