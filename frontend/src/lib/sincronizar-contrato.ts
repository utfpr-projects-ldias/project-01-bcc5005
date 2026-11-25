import type { RepositorioConsultas } from './repositorio-consultas';
/** Após mutação de raiz, revalida dependências do contrato e visões globais. */
export function sincronizarContrato(cache: RepositorioConsultas, id: string) {
  for (const chave of [ ['contratos','lista'], ['contratos','detalhe',id], ['contratos','pendentes'], ['contratos','acesso',id],
    ['contratos','elegibilidade-conclusao',id], ['contratos','historico-revisao',id], ['admin','contratos'],
    ['execucao',id], ['etapas','contrato',id], ['entregaveis','contrato',id], ['ocorrencias',id],
    ['atividades',id], ['atividades','compartilhada'], ['documentos','contrato',id], ['evidencias'], ['dashboard'], ['metas-marco'] ])
    cache.invalidar(chave);
}
