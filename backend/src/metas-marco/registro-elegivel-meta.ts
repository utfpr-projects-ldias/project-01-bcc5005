import type { EntityManager } from 'typeorm';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { medicaoAprovadaAtual } from '../ocorrencias/medicao-ocorrencia.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import type { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { comprovanteValidoParaMeta } from './comprovante-valido-meta.js';

/** Um vínculo aprovado só conta enquanto a origem satisfaz o mesmo critério físico. */
export async function ocorrenciaElegivelMeta(m: EntityManager, o: Ocorrencia): Promise<boolean> {
  return !o.substituidaEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) &&
    (await medicaoAprovadaAtual(m,o)).apta;
}
export function atividadeElegivelMeta(a: AtividadeEntity, contratoId: string): boolean {
  return a.status === 'VERIFICADA' && !a.excluidaEm && !a.arquivadaEm &&
    a.entregaveis.some(e => e.contratoId === contratoId);
}
export async function registroElegivelMeta(m: EntityManager, meta: MetaMarco, v: VinculoMetaMarco): Promise<boolean> {
  if (meta.tipo === 'OCORRENCIA' && v.ocorrenciaId) {
    const o = await m.findOne(Ocorrencia, { where: { id: v.ocorrenciaId, contratoId: meta.contratoId } });
    return Boolean(o && await ocorrenciaElegivelMeta(m,o));
  }
  if (meta.tipo === 'ATIVIDADE' && v.atividadeId) {
    const a = await m.findOne(AtividadeEntity, { where: { id: v.atividadeId, contratoId: meta.contratoId }, relations: { entregaveis: true } });
    return Boolean(a && atividadeElegivelMeta(a,meta.contratoId));
  }
  if (meta.tipo === 'EVIDENCIA' && v.comprovanteId) return comprovanteValidoParaMeta(m,meta.contratoId,v.comprovanteId);
  return false;
}
