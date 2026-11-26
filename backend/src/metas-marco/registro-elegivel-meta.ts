import type { EntityManager } from 'typeorm';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { medicaoAprovadaAtual } from '../ocorrencias/medicao-ocorrencia.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';

/** Um vínculo aprovado só conta enquanto a origem satisfaz o mesmo critério físico. */
export async function ocorrenciaElegivelMeta(m: EntityManager, o: Ocorrencia): Promise<boolean> {
  return !o.substituidaEm && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) &&
    (await medicaoAprovadaAtual(m,o)).apta;
}
export function atividadeElegivelMeta(a: AtividadeEntity, contratoId: string): boolean {
  return a.status === 'VERIFICADA' && !a.excluidaEm && !a.arquivadaEm &&
    a.entregaveis.some(e => e.contratoId === contratoId);
}
