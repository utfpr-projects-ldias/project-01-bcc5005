import { OPERACOES_CONTRATO, permissoesPadraoVinculo, resumirAcessoVinculo, vinculoTemEdicao } from './admin-usuarios';

test('somente leitura nega explicitamente todas as operações para Gestor e Colaborador', () => {
  for (const perfil of ['GESTOR', 'COLABORADOR'] as const) {
    const permissoes = permissoesPadraoVinculo(perfil, 'leitura');
    expect(Object.keys(permissoes)).toHaveLength(OPERACOES_CONTRATO.length);
    expect(Object.values(permissoes).every(v => v === false)).toBe(true);
    expect(vinculoTemEdicao(perfil, { contratoId: 'a', podeEditar: false, permissoesDetalhadas: permissoes })).toBe(false);
  }
});

test('Gestor editor recebe planejamento, ordenação e arquivamento, sem reativação nem exclusão', () => {
  const p = permissoesPadraoVinculo('GESTOR', 'edicao');
  expect(p.criarEtapas).toBe(true);
  expect(p.reordenarEtapas).toBe(true);
  expect(p.editarContrato).toBe(true);
  expect(p.enviarComprovantes).toBe(true);
  for (const { chave } of OPERACOES_CONTRATO) {
    if (chave.startsWith('excluir') || chave.startsWith('reativar')) expect(p[chave]).toBe(false);
    if (chave.startsWith('arquivar') && chave !== 'arquivarDocumentoPrincipal') expect(p[chave]).toBe(true);
  }
  expect(p.bloquearOrdemEtapas).toBe(false);
  expect(p.arquivarDocumentoPrincipal).toBe(false);
  expect(p.reativarDocumentoPrincipal).toBe(false);
  expect(p.excluirDocumentoPrincipal).toBe(false);
});

test('Colaborador editor só recebe ações expressamente delegadas, sem editar contrato ou verificar automaticamente', () => {
  const p = permissoesPadraoVinculo('COLABORADOR', 'edicao');
  expect(p.enviarComprovantes).toBe(true);
  expect(p.criarEntregaveis).toBe(true);
  expect(p.reordenarEtapas).toBe(true);
  expect(p.arquivarEtapas).toBe(true);
  expect(p.reativarEtapas).toBe(false);
  expect(p.editarContrato).toBe(false);
  expect(p.verificarComprovantes).toBe(false);
  expect(p.excluirEtapasArquivadas).toBe(false);
});

test('resumo diferencia leitura, edição e permissões personalizadas sem esconder vínculos legados', () => {
  for (const perfil of ['GESTOR', 'COLABORADOR'] as const) {
    const somenteLeitura = permissoesPadraoVinculo(perfil, 'leitura');
    const edicao = permissoesPadraoVinculo(perfil, 'edicao');
    expect(resumirAcessoVinculo(perfil, { contratoId: 'a', podeEditar: false,
      permissoesDetalhadas: somenteLeitura })).toBe('Somente leitura');
    expect(resumirAcessoVinculo(perfil, { contratoId: 'a', podeEditar: perfil === 'GESTOR',
      permissoesDetalhadas: edicao })).toBe('Pode editar');
    expect(resumirAcessoVinculo(perfil, { contratoId: 'a', podeEditar: perfil === 'GESTOR',
      permissoesDetalhadas: { ...edicao, reordenarEtapas: false } }))
      .toBe('Pode editar · permissões personalizadas ativas');
    expect(resumirAcessoVinculo(perfil, { contratoId: 'a', podeEditar: false,
      permissoesDetalhadas: { ...somenteLeitura, reativarEtapas: true } }))
      .toBe('Leitura · permissões personalizadas ativas');
    expect(resumirAcessoVinculo(perfil, { contratoId: 'a', podeEditar: true }))
      .toBe('Vínculo anterior · revise as permissões');
  }
});
