import type { Contrato } from './contrato.entity.js';
const CAMPOS = ['numeroContrato','processoAdministrativo','orgaoContratante','unidadeResponsavel','objeto','descricao','dataAssinatura','inicioVigencia','terminoVigencia','status','responsavelInternoId','fiscalGestor','modoCalculo','observacoes'] as const;
/** Snapshot sem dependência de relógio: comparado sob lock da raiz. */
export function estadoEdicaoContrato(c: Contrato): string {
  return JSON.stringify([...CAMPOS.map(k => c[k] ?? null), c.arquivadoEm ?? null,
    c.reabertoEm ?? null, c.conclusaoSolicitadaEm ?? null, Boolean(c.encerramentoSolicitado)]);
}
