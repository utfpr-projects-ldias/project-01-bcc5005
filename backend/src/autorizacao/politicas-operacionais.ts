/**
 * TEC07-AJUSTES-02-02 — catálogo FECHADO de operações operacionais.
 * A convenção é recurso:verbo. Não existem curingas ou permissões implícitas.
 * Delegações granulares por contrato são explícitas e auditadas; sem vínculo, não há planejamento.
 */
export const POLITICAS_OPERACIONAIS = {
  'etapas:listar': { recurso: 'etapa', classe: 'leitura', escopo: 'contrato' },
  'etapas:visualizar': { recurso: 'etapa', classe: 'leitura', escopo: 'recurso' },
  'etapas:criar': { recurso: 'etapa', classe: 'planejamento', escopo: 'contrato' },
  'etapas:editar': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:reordenar': { recurso: 'etapa', classe: 'planejamento', escopo: 'contrato' },
  'etapas:bloquear-ordem': { recurso: 'etapa', classe: 'planejamento', escopo: 'contrato' },
  'etapas:arquivar': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:reabrir': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:reabrir-encerrada': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:encerrar': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:concluir': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:reativar': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:excluir': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:listar': { recurso: 'entregavel', classe: 'leitura', escopo: 'contrato' },
  'entregaveis:visualizar': { recurso: 'entregavel', classe: 'leitura', escopo: 'recurso' },
  'entregaveis:criar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'contrato' },
  'entregaveis:editar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:arquivar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:reabrir': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:concluir': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:reativar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'entregaveis:arquivados': { recurso: 'entregavel', classe: 'leitura', escopo: 'contrato' },
  'entregaveis:excluir': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'evidencias:criaresperada': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'evidencias:editaresperada': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'evidencias:arquivaresperada': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'evidencias:reativaresperada': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'evidencias:arquivadasesperadas': { recurso: 'entregavel', classe: 'leitura', escopo: 'recurso' },
  'evidencias:excluiresperada': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'ocorrencias:listar': { recurso: 'ocorrencia', classe: 'leitura', escopo: 'contrato' },
  'ocorrencias:visualizar': { recurso: 'ocorrencia', classe: 'leitura', escopo: 'recurso' },
  'ocorrencias:gerar': { recurso: 'ocorrencia', classe: 'planejamento', escopo: 'contrato' },
  'ocorrencias:criar': { recurso: 'ocorrencia', classe: 'planejamento', escopo: 'contrato' },
  'ocorrencias:editar': { recurso: 'ocorrencia', classe: 'planejamento', escopo: 'recurso' },
  'ocorrencias:editar-meta': { recurso: 'ocorrencia', classe: 'planejamento', escopo: 'recurso' },
  'ocorrencias:registrar': { recurso: 'ocorrencia', classe: 'operacional', escopo: 'recurso' },
  'ocorrencias:vincular-evidencia': { recurso: 'ocorrencia', classe: 'operacional', escopo: 'recurso' },
  'ocorrencias:concluir': { recurso: 'ocorrencia', classe: 'operacional', escopo: 'recurso' },
  'ocorrencias:reabrir': { recurso: 'ocorrencia', classe: 'operacional', escopo: 'recurso' },
  'ocorrencias:replanejar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'atividades:listar': { recurso: 'atividade', classe: 'leitura', escopo: 'contrato' },
  'atividades:visualizar': { recurso: 'atividade', classe: 'leitura', escopo: 'recurso' },
  'atividades:registrar': { recurso: 'atividade', classe: 'operacional', escopo: 'contrato' },
  'atividades:editar': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'atividades:verificar': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'atividades:reabrir': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'atividades:arquivar': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'atividades:reativar': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'atividades:excluir': { recurso: 'atividade', classe: 'operacional', escopo: 'recurso' },
  'evidencias:listar': { recurso: 'evidencia', classe: 'leitura', escopo: 'contrato' },
  'evidencias:visualizar': { recurso: 'evidencia', classe: 'leitura', escopo: 'recurso' },
  'evidencias:anexar': { recurso: 'evidencia', classe: 'operacional', escopo: 'contrato' },
  'evidencias:reabrir': { recurso: 'evidencia', classe: 'operacional', escopo: 'contrato' },
  'evidencias:verificar': { recurso: 'evidencia', classe: 'operacional', escopo: 'contrato' },
  'evidencias:arquivar': { recurso: 'evidencia', classe: 'planejamento', escopo: 'recurso' },
  'documentos:listar': { recurso: 'documento', classe: 'leitura', escopo: 'contrato' },
  'documentos:visualizar': { recurso: 'documento', classe: 'leitura', escopo: 'recurso' },
  'documentos:baixar': { recurso: 'documento', classe: 'leitura', escopo: 'recurso' },
  'documentos:anexar': { recurso: 'documento', classe: 'planejamento', escopo: 'contrato' },
  'documentos:editar': { recurso: 'documento', classe: 'planejamento', escopo: 'recurso' },
  'documentos:arquivar': { recurso: 'documento', classe: 'planejamento', escopo: 'recurso' },
  'documentos:reativar': { recurso: 'documento', classe: 'planejamento', escopo: 'recurso' },
  'documentos:excluir': { recurso: 'documento', classe: 'planejamento', escopo: 'recurso' },
  'metas-marco:listar': { recurso: 'entregavel', classe: 'leitura', escopo: 'contrato' },
  'metas-marco:criar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'contrato' },
  'metas-marco:editar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'contrato' },
  'metas-marco:vincular': { recurso: 'entregavel', classe: 'operacional', escopo: 'contrato' },
  'metas-marco:decidir': { recurso: 'entregavel', classe: 'operacional', escopo: 'contrato' },
  'pesos:atualizar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'contrato' },
  'execucao:visualizar': { recurso: 'entregavel', classe: 'leitura', escopo: 'contrato' },
  'execucao:atualizar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
} as const;

export type AcaoOperacional = keyof typeof POLITICAS_OPERACIONAIS;
export type RecursoOperacional = typeof POLITICAS_OPERACIONAIS[AcaoOperacional]['recurso'];
export type ClasseOperacao = typeof POLITICAS_OPERACIONAIS[AcaoOperacional]['classe'];

export function politicaOperacional(acao: string) {
  return Object.prototype.hasOwnProperty.call(POLITICAS_OPERACIONAIS, acao)
    ? POLITICAS_OPERACIONAIS[acao as AcaoOperacional]
    : null;
}

/** UUID válido. A autorização nunca usa identificadores do body/query. */
export function uuidValido(id: unknown): id is string {
  return typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
}
