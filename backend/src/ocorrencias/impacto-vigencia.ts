import { createHash } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import type { Contrato } from '../contratos/contrato.entity.js';
import { hojeCivil } from './replanejamento.service.js';

type Linha = { id: string; entregavel_id: string; periodo_inicio: string; periodo_fim: string; status: string; data_realizada: string | null; quantidade_realizada: string | null; observacoes: string | null; vinculada: boolean };
/** Não altera datas de entregáveis/ocorrências ao editar o contrato. A lista
 * de impactos é calculada de novo sob o lock da raiz na confirmação. */
export async function impactoVigencia(m: EntityManager, c: Contrato, inicio: string, fim: string) {
  // Textos ISO de colunas DATE, sem conversão local do driver pg.
  const agenda = await m.query(`SELECT o.id, o.entregavel_id, o.periodo_inicio::text, o.periodo_fim::text, o.status::text,
      o.data_realizada::text, o.quantidade_realizada::text, o.observacoes,
      EXISTS(SELECT 1 FROM atividades a WHERE a."ocorrenciaId" = o.id) AS vinculada
    FROM ocorrencias o JOIN entregaveis e ON e.id=o.entregavel_id AND e.contrato_id=o.contrato_id
    JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
    WHERE o.contrato_id=$1 AND o.origem='RECORRENTE' AND o.substituida_em IS NULL
      AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL ORDER BY o.id`, [c.id]) as Linha[];
  const hoje = hojeCivil();
  const fora = agenda.filter(o => o.periodo_inicio < inicio || o.periodo_fim > fim);
  const protegida = (o: Linha) => o.periodo_inicio <= hoje || o.status !== 'NAO_INICIADO' || o.data_realizada != null || o.quantidade_realizada != null || Boolean(o.observacoes) || o.vinculada;
  const futuros = fora.filter(o => !protegida(o));
  // A fronteira atual pode invalidar agenda futura; não prorratear nem remover automaticamente.
  const planos = await m.query(`SELECT e.id, e.nome, e.inicio_previsto::text, e.termino_previsto::text, e.agenda_inicio_futuro::text
    FROM entregaveis e JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
    WHERE e.contrato_id=$1 AND e.tipo='RECORRENTE' AND e.arquivado_em IS NULL AND et.arquivado_em IS NULL
    ORDER BY e.id`, [c.id]) as { id:string; nome:string; inicio_previsto:string|null; termino_previsto:string|null; agenda_inicio_futuro:string|null }[];
  const planosFora = planos.filter(e => ((e.agenda_inicio_futuro ?? e.inicio_previsto) != null && (e.agenda_inicio_futuro ?? e.inicio_previsto)! < inicio && (e.termino_previsto ?? '') >= hoje) || (e.termino_previsto != null && e.termino_previsto > fim && e.termino_previsto >= hoje));
  const confirmacao = createHash('sha256').update(JSON.stringify([c.id,c.inicioVigencia,c.terminoVigencia,inicio,fim,agenda,planos])).digest('hex');
  return { confirmacao, total: agenda.length, planos: planos.length, preservadasFora: fora.filter(protegida).length, futurasFora: futuros.length, planosFora: planosFora.map(p=>({id:p.id,nome:p.nome})),
    bloqueado: futuros.length > 0 || planosFora.length > 0 };
}
