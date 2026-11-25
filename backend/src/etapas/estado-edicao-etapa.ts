import { createHash } from 'node:crypto';
import type { Etapa } from './etapa.entity.js';

/** Snapshot opaco: status exibido pode ser derivado da execução dos filhos. */
export function estadoEdicaoEtapa(etapa: Etapa): string {
  return createHash('sha256').update(JSON.stringify([
    etapa.id, etapa.contratoId, etapa.nome, etapa.codigo, etapa.descricao,
    etapa.inicioPrevisto, etapa.terminoPrevisto, etapa.status, etapa.observacoes,
    etapa.arquivadoEm, etapa.reabertoEm, etapa.conclusaoSolicitadaEm,
    etapa.encerramentoSolicitadoEm, etapa.conclusaoParcialSolicitada,
  ].map(v => v ?? null))).digest('hex');
}
