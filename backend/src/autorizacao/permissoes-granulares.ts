import type { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

/** Permissões reais, vinculadas a um contrato. Ausência de configuração = compatibilidade legado.
 * O ADMIN sempre administra tudo; exceção: obrigatoriedade de checklist não é delegada por padrão.
 */
export const CHAVES_PERMISSOES = [
  'criarEtapas', 'editarEtapas', 'reordenarEtapas', 'bloquearOrdemEtapas', 'arquivarEtapas', 'reativarEtapas', 'reabrirEtapas', 'encerrarEtapas', 'reabrirEtapasEncerradas', 'excluirEtapasArquivadas',
  'criarEntregaveis', 'editarEntregaveis', 'arquivarEntregaveis', 'reativarEntregaveis', 'reabrirEntregaveis', 'excluirEntregaveisArquivados',
  'criarEvidencias', 'editarEvidencias', 'arquivarEvidencias', 'reativarEvidencias', 'reabrirEvidencias', 'excluirEvidenciasArquivadas',
  'alterarObrigatoriedade', 'enviarComprovantes', 'verificarComprovantes', 'compartilharEvidencias',
  'criarOcorrencias', 'editarOcorrencias', 'editarMetaOcorrencia', 'vincularAtividadesOcorrencia', 'vincularEvidenciasOcorrencia', 'editarExigenciasOcorrencia', 'editarPesoOcorrencia', 'registrarExecucaoOcorrencia', 'aprovarExecucaoManual', 'corrigirExecucaoOcorrencia', 'corrigirExecucaoAprovada', 'bloquearExecucaoOcorrencia', 'excluirExecucaoOcorrencia', 'concluirOcorrencias', 'reabrirOcorrencias', 'configurarAgendaOcorrencias', 'editarExecucaoFisica', 'configurarPesos',
  'criarMetasMarco', 'editarMetasMarco', 'vincularMetasMarco', 'aprovarVinculosMetasMarco',
  'registrarAtividades', 'editarAtividades', 'compartilharAtividades', 'verificarAtividades', 'reabrirAtividades', 'arquivarAtividades', 'reativarAtividades', 'excluirAtividadesArquivadas',
  'editarContrato', 'concluirContrato', 'encerrarContrato', 'reabrirContrato', 'cancelarContrato', 'reverterCancelamentoContrato', 'suspenderContrato', 'retomarContrato', 'verificarDocumentos', 'reabrirDocumentos', 'concluirEtapas', 'concluirEntregaveis', 'anexarDocumentos', 'editarDocumentos', 'arquivarDocumentos', 'reativarDocumentos', 'excluirDocumentosArquivados', 'verificarDocumentoPrincipal', 'reabrirDocumentoPrincipal', 'arquivarDocumentoPrincipal', 'reativarDocumentoPrincipal', 'excluirDocumentoPrincipal', 'administrarDocumentoPrincipal',
] as const;
export type ChavePermissao = typeof CHAVES_PERMISSOES[number];
export type PermissoesGranulares = Partial<Record<ChavePermissao, boolean>>;

export const ACAO_PERMISSAO: Readonly<Record<string, ChavePermissao>> = {
  'ocorrencias:gerar': 'configurarAgendaOcorrencias', 'ocorrencias:replanejar': 'configurarAgendaOcorrencias',
  'ocorrencias:criar': 'criarOcorrencias', 'ocorrencias:solicitar-conclusao': 'editarOcorrencias', 'ocorrencias:editar': 'editarOcorrencias',
  'ocorrencias:iniciar-previstas': 'editarOcorrencias', 'ocorrencias:editar-meta': 'editarMetaOcorrencia',
  'ocorrencias:registrar': 'registrarExecucaoOcorrencia', 'ocorrencias:decidir-lancamento': 'aprovarExecucaoManual', 'execucao:decidir-lancamento': 'aprovarExecucaoManual', 'ocorrencias:vincular-evidencia': 'vincularEvidenciasOcorrencia', 'ocorrencias:concluir': 'concluirOcorrencias',
  'ocorrencias:reabrir': 'reabrirOcorrencias',
  'metas-marco:criar': 'criarMetasMarco', 'metas-marco:editar': 'editarMetasMarco',
  'metas-marco:vincular': 'vincularMetasMarco', 'metas-marco:decidir': 'aprovarVinculosMetasMarco',
  'pesos:atualizar': 'configurarPesos',
  'execucao:atualizar': 'editarExecucaoFisica',
  'etapas:criar': 'criarEtapas', 'etapas:solicitar-conclusao': 'editarEtapas', 'etapas:editar': 'editarEtapas',
  'etapas:reordenar': 'reordenarEtapas',
  'etapas:bloquear-ordem': 'bloquearOrdemEtapas',
  'etapas:arquivar': 'arquivarEtapas',
  'etapas:reativar': 'reativarEtapas',
  'etapas:reabrir': 'reabrirEtapas',
  'etapas:reabrir-encerrada': 'reabrirEtapasEncerradas',
  'etapas:encerrar': 'encerrarEtapas',
  'etapas:concluir': 'concluirEtapas',
  'etapas:excluir': 'excluirEtapasArquivadas',
  'entregaveis:criar': 'criarEntregaveis', 'entregaveis:solicitar-conclusao': 'editarEntregaveis', 'entregaveis:editar': 'editarEntregaveis',
  'entregaveis:arquivar': 'arquivarEntregaveis',
  'entregaveis:reativar': 'reativarEntregaveis',
  'entregaveis:reabrir': 'reabrirEntregaveis',
  'entregaveis:concluir': 'concluirEntregaveis',
  'entregaveis:excluir': 'excluirEntregaveisArquivados',
  'evidencias:criaresperada': 'criarEvidencias',
  'evidencias:editaresperada': 'editarEvidencias',
  'evidencias:arquivaresperada': 'arquivarEvidencias',
  'evidencias:reativaresperada': 'reativarEvidencias',
  'evidencias:reabrir': 'reabrirEvidencias',
  'evidencias:excluiresperada': 'excluirEvidenciasArquivadas',
  'evidencias:anexar': 'enviarComprovantes',
  'evidencias:verificar': 'verificarComprovantes',
  'atividades:registrar': 'registrarAtividades',
  'atividades:compartilhar': 'compartilharAtividades',
  'atividades:editar': 'editarAtividades',
  'atividades:verificar': 'verificarAtividades',
  'atividades:reabrir': 'reabrirAtividades',
  'atividades:arquivar': 'arquivarAtividades',
  'atividades:reativar': 'reativarAtividades',
  'atividades:excluir': 'excluirAtividadesArquivadas',
  'documentos:verificar': 'verificarDocumentos',
  'documentos:reabrir': 'reabrirDocumentos',
  'documentos:anexar': 'anexarDocumentos',
  'documentos:editar': 'editarDocumentos',
  'documentos:arquivar': 'arquivarDocumentos',
  'documentos:reativar': 'reativarDocumentos',
  'documentos:excluir': 'excluirDocumentosArquivados',
  // Operações do principal são conferidas pelo serviço após resolver a categoria real.
  // 'administrarDocumentoPrincipal' é chave LEGADA, sem privilégio operacional.

};

/** Edição operacional não delega decisões, arquivamento ou reabertura. */
const EDICAO_OPERACIONAL: readonly ChavePermissao[] = ['registrarAtividades', 'editarAtividades', 'criarEvidencias', 'editarEvidencias', 'enviarComprovantes', 'anexarDocumentos', 'registrarExecucaoOcorrencia', 'editarExecucaoFisica', 'corrigirExecucaoOcorrencia'];
const EDICAO_GESTOR: readonly ChavePermissao[] = ['criarEtapas', 'editarEtapas', 'reordenarEtapas', 'criarEntregaveis', 'editarEntregaveis', 'criarOcorrencias', 'editarOcorrencias', 'configurarAgendaOcorrencias', 'editarContrato', 'editarDocumentos'];

export function permissoesEfetivas(perfil: PerfilUsuario | string, podeEditar: boolean,
  detalhes: PermissoesGranulares | null | undefined): Record<ChavePermissao, boolean> {
  const admin = perfil === 'ADMINISTRADOR';
  const gestorEditor = perfil === 'GESTOR' && podeEditar;
  const base = {} as Record<ChavePermissao, boolean>;
  for (const chave of CHAVES_PERMISSOES) {
    const padrao = gestorEditor && (EDICAO_OPERACIONAL.includes(chave) || EDICAO_GESTOR.includes(chave));
    base[chave] = admin || (detalhes?.[chave] ?? padrao);
  }
  return base;
}

/** Apenas chaves conhecidas e booleanos literais: falha fechada para alterações arbitrárias. */
export function validarPermissoes(dados: unknown): PermissoesGranulares {
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) throw new Error('Permissões inválidas');
  const objeto = dados as Record<string, unknown>;
  const validas = new Set<string>(CHAVES_PERMISSOES);
  for (const [chave, valor] of Object.entries(objeto)) {
    if (!validas.has(chave) || typeof valor !== 'boolean') throw new Error('Permissão desconhecida ou valor inválido');
  }
  return { ...objeto } as PermissoesGranulares;
}
