import { IsNull, type EntityManager } from 'typeorm';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { comprovanteValidoParaMeta } from './comprovante-valido-meta.js';
/** Apenas aprovações ainda sustentadas por registros reais e válidos contam.
 * Reabrir ocorrência/atividade ou revogar comprovante reduz a preparação.
 */
export async function avaliarMetasMarco(m: EntityManager, contratoId: string, entregavelId: string) {
  const metas = await m.find(MetaMarco, { where: { contratoId, entregavelId, arquivadoEm: IsNull() } });
  let concluidas = 0;
  for (const meta of metas) {
    const vinculos = await m.find(VinculoMetaMarco, { where: { metaId: meta.id, contratoId, status: 'APROVADO' } });
    let validos = 0;
    for (const v of vinculos) {
      if (meta.tipo === 'OCORRENCIA' && v.ocorrenciaId) {
        const o = await m.findOne(Ocorrencia, { where: { id: v.ocorrenciaId, contratoId } });
        if (o && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status) && !o.substituidaEm) validos++;
      } else if (meta.tipo === 'ATIVIDADE' && v.atividadeId) {
        const a = await m.findOne(AtividadeEntity, { where: { id: v.atividadeId, contratoId }, relations: { entregaveis: true } });
        if (a?.status === 'VERIFICADA' && !a.excluidaEm && !a.arquivadaEm && a.entregaveis.some(e => e.contratoId === contratoId)) validos++;
      } else if (meta.tipo === 'EVIDENCIA' && v.comprovanteId) {
        if (await comprovanteValidoParaMeta(m, contratoId, v.comprovanteId)) validos++;
      }
    }
    if (validos >= meta.quantidadeExigida) concluidas++;
  }
  return { total: metas.length, concluidas, apto: metas.length > 0 && concluidas === metas.length };
}
