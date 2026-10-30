/**
 * TEC07-AJUSTES-02-02 — catálogo FECHADO de operações operacionais.
 * A convenção é recurso:verbo. Não existem curingas ou permissões implícitas.
 * PQ-04 do PRD permanece pendente: Colaborador não edita planejamento.
 */
export const POLITICAS_OPERACIONAIS = {
  'etapas:listar': { recurso: 'etapa', classe: 'leitura', escopo: 'contrato' },
  'etapas:visualizar': { recurso: 'etapa', classe: 'leitura', escopo: 'recurso' },
  'etapas:criar': { recurso: 'etapa', classe: 'planejamento', escopo: 'contrato' },
  'etapas:editar': { recurso: 'etapa', classe: 'planejamento', escopo: 'recurso' },
  'etapas:reordenar': { recurso: 'etapa', classe: 'planejamento', escopo: 'contrato' },
  'entregaveis:listar': { recurso: 'entregavel', classe: 'leitura', escopo: 'contrato' },
  'entregaveis:visualizar': { recurso: 'entregavel', classe: 'leitura', escopo: 'recurso' },
  'entregaveis:criar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'contrato' },
  'entregaveis:editar': { recurso: 'entregavel', classe: 'planejamento', escopo: 'recurso' },
  'ocorrencias:listar': { recurso: 'ocorrencia', classe: 'leitura', escopo: 'contrato' },
  'ocorrencias:visualizar': { recurso: 'ocorrencia', classe: 'leitura', escopo: 'recurso' },
  'ocorrencias:gerar': { recurso: 'ocorrencia', classe: 'planejamento', escopo: 'contrato' },
  'ocorrencias:registrar': { recurso: 'ocorrencia', classe: 'operacional', escopo: 'recurso' },
  'atividades:listar': { recurso: 'atividade', classe: 'leitura', escopo: 'contrato' },
  'atividades:visualizar': { recurso: 'atividade', classe: 'leitura', escopo: 'recurso' },
  'atividades:registrar': { recurso: 'atividade', classe: 'operacional', escopo: 'contrato' },
  'evidencias:listar': { recurso: 'evidencia', classe: 'leitura', escopo: 'contrato' },
  'evidencias:visualizar': { recurso: 'evidencia', classe: 'leitura', escopo: 'recurso' },
  'evidencias:anexar': { recurso: 'evidencia', classe: 'operacional', escopo: 'contrato' },
  'evidencias:arquivar': { recurso: 'evidencia', classe: 'planejamento', escopo: 'recurso' },
  'documentos:listar': { recurso: 'documento', classe: 'leitura', escopo: 'contrato' },
  'documentos:visualizar': { recurso: 'documento', classe: 'leitura', escopo: 'recurso' },
  'documentos:baixar': { recurso: 'documento', classe: 'leitura', escopo: 'recurso' },
  'documentos:anexar': { recurso: 'documento', classe: 'planejamento', escopo: 'contrato' },
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
