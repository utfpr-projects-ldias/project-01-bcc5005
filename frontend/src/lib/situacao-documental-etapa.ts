import type { Etapa, StatusEtapa } from './etapas';
import type { Entregavel, ResumoDocumentalEntregavel } from './entregaveis';

/** Retorna confirmação DOCUMENTAL, não conclusão física.
 * O aceite documental depende apenas das OBRIGATÓRIAS; evidências opcionais
 * permanecem visíveis, mas não bloqueiam. Exige ao menos uma obrigatória para
 * evitar conclusão automática por 0/0. */
export function comprovacaoDocumentalCompleta(registro: ResumoDocumentalEntregavel | undefined): boolean {
  if (!registro) return false;
  if (typeof registro.obrigatorias === 'number' && typeof registro.verificadas === 'number')
    return registro.obrigatorias > 0 && registro.verificadas === registro.obrigatorias;
  // Legado de fixtures anteriores à exposição de obrigatórias pela API.
  return (registro.total ?? 0) > 0 && registro.verificadasTotal === registro.total;
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
    return itens.length > 0 && itens.every(e => e.statusExecucao === 'CONCLUIDO' && entregavelDocumentalmenteConcluido(e, resumo[e.id]));
  });
}

/** A UI nunca promove PLANEJADA/EM_ANDAMENTO a CONCLUIDA por contagem.
 * O status operacional precisa ser persistido pela API auditada. Se a API ainda
 * informar CONCLUIDA enquanto algum filho ativo não estiver concluído, a
 * representação conservadora impede anunciar conclusão falsa.
 */
export function situacaoDocumentalEtapa(
  etapa: Etapa,
  itens: Entregavel[] | undefined,
  resumo: Record<string, ResumoDocumentalEntregavel> | undefined,
): StatusEtapa {
  if (etapa.reabertoEm) return etapa.status === 'CONCLUIDA' ? 'EM_ANDAMENTO' : etapa.status;
  if (etapa.status !== 'CONCLUIDA' || !itens || !resumo) return etapa.status;
  const ativos = itens.filter(e => !e.arquivadoEm);
  if (!ativos.length || ativos.some(e => e.statusExecucao !== 'CONCLUIDO' ||
      !entregavelDocumentalmenteConcluido(e, resumo[e.id]))) return 'EM_ANDAMENTO';
  return 'CONCLUIDA';
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
    e.statusExecucao === 'CONCLUIDO' && !e.reabertoEm &&
    comprovacaoDocumentalCompleta(resumo[e.id]) &&
    e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).length > 0 &&
    e.evidenciasEsperadas.filter(ev => !ev.arquivadoEm && ev.obrigatoria !== false).every(ev => !ev.reabertoEm)
  );
}
