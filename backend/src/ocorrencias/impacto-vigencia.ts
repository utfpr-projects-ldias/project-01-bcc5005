import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { Contrato } from '../contratos/contrato.entity.js';
import { hojeCivil } from '../common/data-civil.js';

type Linha = { id: string; entregavel_id: string; periodo_inicio: string | null; periodo_fim: string | null; status: string; data_prevista?: string | null; data_realizada: string | null; quantidade_realizada: string | null; observacoes: string | null; vinculada: boolean };
/** Não altera datas de entregáveis/ocorrências ao editar o contrato. A lista
 * de impactos é calculada de novo sob o lock da raiz na confirmação. */
export async function impactoVigencia(m: EntityManager, c: Contrato, inicio: string, fim: string) {
  // Textos ISO de colunas DATE, sem conversão local do driver pg.
  const agenda = await m.query(`SELECT o.id, o.entregavel_id, o.periodo_inicio::text, o.periodo_fim::text, o.status::text,
      o.data_prevista::text, o.data_realizada::text, o.quantidade_realizada::text, o.observacoes,
      (EXISTS(SELECT 1 FROM atividades a WHERE a."ocorrenciaId" = o.id AND a."contratoId" = o.contrato_id)
       OR EXISTS(SELECT 1 FROM atividade_ocorrencias ao
            WHERE ao."ocorrenciaId" = o.id AND ao."contratoId" = o.contrato_id)
       OR EXISTS(SELECT 1 FROM ocorrencia_lancamentos l WHERE l.ocorrencia_id=o.id AND l.contrato_id=o.contrato_id)
       OR EXISTS(SELECT 1 FROM ocorrencia_comprovantes v WHERE v.ocorrencia_id=o.id AND v.contrato_id=o.contrato_id)
       OR EXISTS(SELECT 1 FROM atividade_ocorrencia_medicoes am WHERE am.ocorrencia_id=o.id)
       OR EXISTS(SELECT 1 FROM execucoes_entregavel x WHERE x.ocorrencia_id=o.id AND x.contrato_id=o.contrato_id)
       OR EXISTS(SELECT 1 FROM evidencias_esperadas ev WHERE ev.rascunho_envio IS NOT NULL AND
          strpos(lower(concat_ws(',',ev.rascunho_envio->>'ocorrenciaQuantidadeId',ev.rascunho_envio->>'ocorrenciaExecucaoId',
            ev.rascunho_envio->>'ocorrenciasVinculadas',ev.rascunho_envio->>'destinosCompartilhados')),o.id::text)>0)) AS vinculada
    FROM ocorrencias o JOIN entregaveis e ON e.id=o.entregavel_id AND e.contrato_id=o.contrato_id
    JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
    WHERE o.contrato_id=$1 AND o.substituida_em IS NULL
      AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL ORDER BY o.id`, [c.id]) as Linha[];
  const hoje = hojeCivil();
  const fora = agenda.filter(o => [o.periodo_inicio,o.periodo_fim,o.data_prevista].some(d => d != null && (d < inicio || d > fim)));
  const protegida = (o: Linha) => ((o.periodo_inicio ?? o.data_prevista) != null && (o.periodo_inicio ?? o.data_prevista)! <= hoje) || o.status !== 'NAO_INICIADO' || o.data_realizada != null || o.quantidade_realizada != null || Boolean(o.observacoes) || o.vinculada;
  const futuros = fora.filter(o => !protegida(o));
  // A fronteira atual pode invalidar agenda futura; não prorratear nem remover automaticamente.
  const planos = await m.query(`SELECT e.id, e.nome, e.inicio_previsto::text, e.termino_previsto::text, e.agenda_inicio_futuro::text, e.status_execucao::text AS estado
    FROM entregaveis e JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
    WHERE e.contrato_id=$1  AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL
    UNION ALL
    SELECT et.id, et.nome, et.inicio_previsto::text, et.termino_previsto::text, NULL::text, et.status::text AS estado
    FROM etapas et WHERE et.contrato_id=$1 AND et.arquivado_em IS NULL
    ORDER BY id`, [c.id]) as { id:string; nome:string; inicio_previsto:string|null; termino_previsto:string|null; agenda_inicio_futuro:string|null; estado:string|null }[];
  const planosFora = planos.filter(e => {
    if (['CONCLUIDO','CONCLUIDA','CONCLUIDO_PARCIALMENTE','FINALIZADO','FINALIZADA','ENCERRADA'].includes(e.estado ?? '')) return false;
    const primeiro = e.agenda_inicio_futuro ?? e.inicio_previsto;
    const ultimo = e.termino_previsto ?? primeiro;
    // Preserva datas históricas. Um plano ainda futuro ou em curso não pode
    // começar depois do fim, terminar antes do início ou ultrapassar o fim.
    if (ultimo != null && ultimo < hoje) return false;
    return (primeiro != null && (primeiro < inicio || primeiro > fim)) ||
      (e.termino_previsto != null && (e.termino_previsto < inicio || e.termino_previsto > fim));
  });
  const confirmacao = createHash('sha256').update(JSON.stringify([c.id,c.inicioVigencia,c.terminoVigencia,inicio,fim,hoje,agenda,planos])).digest('hex');
  return { confirmacao, total: agenda.length, planos: planos.length, preservadasFora: fora.filter(protegida).length, futurasFora: futuros.length, planosFora: planosFora.map(p=>({id:p.id,nome:p.nome})),
    bloqueado: futuros.length > 0 || planosFora.length > 0 };
}
