import type { ExecucaoLancamento } from './execucao-lancamento.entity.js';
/** Somente campos de domínio; não entregar instâncias TypeORM ao sanitizador. */
export function snapshotParcela(p: ExecucaoLancamento) {
  return { id:p.id, contratoId:p.contratoId, entregavelId:p.entregavelId, ocorrenciaId:p.ocorrenciaId,
    origem:p.origem, origemId:p.origemId, referenciaId:p.referenciaId, centesimos:p.centesimos,
    centesimosAprovados:p.centesimosAprovados, status:p.status, dataExecucao:p.dataExecucao,
    observacao:p.observacao, autorId:p.autorId, autorNome:p.autorNome, decididoPor:p.decididoPor,
    decididoEm:p.decididoEm, criadoEm:p.criadoEm };
}
export const snapshotMedicoesDiretas = (itens: readonly {entregavelId:string;quantidade:string}[]) =>
  itens.map(({entregavelId,quantidade})=>({entregavelId,quantidade}));
export const snapshotDeclaracoesPercentuais = (itens: readonly {entregavelId:string;ocorrenciaId?:string;percentual:string}[]) =>
  itens.map(({entregavelId,ocorrenciaId,percentual})=>({entregavelId,ocorrenciaId,percentual}));
