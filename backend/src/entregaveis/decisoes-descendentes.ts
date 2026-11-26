import type { EntityManager } from 'typeorm';
import type { Entregavel } from './entregavel.entity.js';
import { resumoParcelas } from '../execucao/parcelas-execucao.js';
import { quantidadeDiretaEvidencias } from './quantidade-evidencias.js';

/** Não concluir ou encerrar um pai tornando impossível decidir uma operação filha.
 * Ocorrências meramente planejadas não são decisões pendentes. */
export async function possuiDecisoesDescendentesPendentes(m: EntityManager, e: Entregavel): Promise<boolean> {
  const [r] = await m.query(`SELECT EXISTS (
    SELECT 1 FROM ocorrencias o WHERE o.contrato_id=$1 AND o.entregavel_id=$2 AND o.substituida_em IS NULL
      AND (o.regularizacao_documental_solicitada OR o.status IN ('PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'))
  ) OR EXISTS (
    SELECT 1 FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."contratoId"=a."contratoId"
    WHERE ae."contratoId"=$1 AND ae."entregavelId"=$2 AND a."excluidaEm" IS NULL AND a.status='PENDENTE_CONCLUSAO'
  ) OR EXISTS (
    SELECT 1 FROM ocorrencias o JOIN atividades a ON a."contratoId"=o.contrato_id
      AND (a."ocorrenciaId"=o.id OR EXISTS (SELECT 1 FROM atividade_ocorrencia_medicoes v WHERE v.atividade_id=a.id AND v.ocorrencia_id=o.id))
    LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=o.id
    WHERE o.contrato_id=$1 AND o.entregavel_id=$2 AND o.substituida_em IS NULL AND a."excluidaEm" IS NULL
      AND a.status NOT IN ('VERIFICADA','ARQUIVADA')
      AND COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=o.id THEN a.quantidade_execucao ELSE 0 END)>0
  ) OR EXISTS (
    SELECT 1 FROM ocorrencia_lancamentos l JOIN ocorrencias o ON o.id=l.ocorrencia_id AND o.contrato_id=l.contrato_id
    WHERE o.contrato_id=$1 AND o.entregavel_id=$2 AND o.substituida_em IS NULL AND l.excluido_em IS NULL AND l.status_execucao IN ('PENDENTE','REJEITADO')
  ) OR EXISTS (
    SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
    WHERE c.contrato_id=$1 AND c.entregavel_id=$2 AND ev.arquivado_em IS NULL AND c.status IN ('PENDENTE_VERIFICACAO','REJEITADA')
      AND c.origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND c.quantidade_declarada>0
      AND (c.ocorrencia_quantidade_id IS NULL OR EXISTS (SELECT 1 FROM ocorrencias o WHERE o.id=c.ocorrencia_quantidade_id AND o.contrato_id=c.contrato_id AND o.substituida_em IS NULL))
      AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
  ) AS pendentes`, [e.contratoId,e.id]);
  if (r?.pendentes) return true;
  if (e.execucoesIntegradas && (await resumoParcelas(m,e)).itens.some(i => ['PENDENTE','REJEITADO'].includes(i.situacao) && (Boolean(i.referenciaId) || i.centesimos>0))) return true;
  return Boolean((await quantidadeDiretaEvidencias(m,e))?.pendentes);
}
