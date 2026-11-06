import type { Etapa, StatusEtapa } from './etapas';
import type { Entregavel, ResumoDocumentalEntregavel } from './entregaveis';

/** Retorna confirmação DOCUMENTAL, não conclusão física.
 * Evidências opcionais também contam quando existirem; zero evidências nunca
 * constitui comprovação completa. Em fixtures legados sem total, usar os campos
 * de obrigatórias para manter a compatibilidade com as consultas antigas. */
export function comprovacaoDocumentalCompleta(registro: ResumoDocumentalEntregavel | undefined): boolean {
  if (!registro) return false;
  if (registro.total !== undefined && registro.verificadasTotal !== undefined)
    return registro.total > 0 && registro.verificadasTotal === registro.total;
  return registro.obrigatorias > 0 && registro.verificadas === registro.obrigatorias;
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
    if (etapa.reabertoEm) return false;
    const itens = entregaveis.filter(e => e.etapaId === etapa.id && !e.arquivadoEm);
    return itens.length > 0 && itens.every(e => entregavelDocumentalmenteConcluido(e, resumo[e.id]));
  });
}

/** Apresentação documental (não mede execução física nem modifica o status do banco).
 * Uma etapa antes comprovada volta a "Em andamento" ao perder seu último
 * entregável ativo ou qualquer comprovação obrigatória verificada. */
export function situacaoDocumentalEtapa(
  etapa: Etapa,
  itens: Entregavel[] | undefined,
  resumo: Record<string, ResumoDocumentalEntregavel> | undefined,
): StatusEtapa {
  // Durante o carregamento, preservar a situação cadastrada para evitar piscar.
  if (etapa.reabertoEm) return etapa.status === 'CONCLUIDA' ? 'EM_ANDAMENTO' : etapa.status;
  if (!itens || !resumo) return etapa.status;
  if (itens.length > 0 && itens.every(entregavel => {
    const registro = resumo[entregavel.id];
    return entregavelDocumentalmenteConcluido(entregavel, registro);
  })) return 'CONCLUIDA';
  if (etapa.status === 'CONCLUIDA') return 'EM_ANDAMENTO';
  return etapa.status;
}
