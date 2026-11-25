import { IsNull, type EntityManager } from 'typeorm';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { registroElegivelMeta } from './registro-elegivel-meta.js';
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
      if (await registroElegivelMeta(m,meta,v)) validos++;
    }
    if (validos >= meta.quantidadeExigida) concluidas++;
  }
  return { total: metas.length, concluidas, apto: metas.length > 0 && concluidas === metas.length };
}
