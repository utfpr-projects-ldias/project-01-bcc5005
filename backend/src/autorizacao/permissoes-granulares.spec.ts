import { CHAVES_PERMISSOES, ACAO_PERMISSAO, permissoesEfetivas, validarPermissoes } from './permissoes-granulares.js';

describe('permissões granulares por contrato', () => {
  it('não delega alteração de obrigatoriedade implicitamente nem ao Gestor com edição geral', () => {
    const g = permissoesEfetivas('GESTOR', true, null);
    expect(g.criarEntregaveis).toBe(true);
    expect(g.alterarObrigatoriedade).toBe(false);
    expect(g.reordenarEtapas).toBe(true);
    expect(g.bloquearOrdemEtapas).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', false, { reordenarEtapas: true }).bloquearOrdemEtapas).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', false, { bloquearOrdemEtapas: true }).bloquearOrdemEtapas).toBe(true);
    expect(permissoesEfetivas('ADMINISTRADOR', true, null).alterarObrigatoriedade).toBe(true);
  });
  it('colaborador somente planeja quando explicitamente autorizado e revogação prevalece sobre edição geral', () => {
    const c = permissoesEfetivas('COLABORADOR', false, { criarEvidencias: true, alterarObrigatoriedade: false });
    expect(c.criarEvidencias).toBe(true);
    expect(c.editarEntregaveis).toBe(false);
    const g = permissoesEfetivas('GESTOR', true, { arquivarEvidencias: false });
    expect(g.arquivarEvidencias).toBe(false);
  });
  it('valida todas as chaves e nega chaves inventadas e valores não booleanos', () => {
    expect(validarPermissoes({ alterarObrigatoriedade: true })).toEqual({ alterarObrigatoriedade: true });
    expect(() => validarPermissoes({ alterarObrigatoriedade: 'true' })).toThrow();
    expect(() => validarPermissoes({ admin: true })).toThrow();
    expect(() => validarPermissoes(null)).toThrow();
    expect(CHAVES_PERMISSOES).toContain('verificarComprovantes');
    expect(ACAO_PERMISSAO['evidencias:arquivaresperada']).toBe('arquivarEvidencias');
    expect(ACAO_PERMISSAO['etapas:bloquear-ordem']).toBe('bloquearOrdemEtapas');
  });
});


describe('ACL documental e atualização cadastral', () => {
  it('ADMIN sempre gerencia documentos e documento principal, gestor precisa de delegação para principal', () => {
    const admin = permissoesEfetivas('ADMINISTRADOR', true, {});
    expect(admin.administrarDocumentoPrincipal).toBe(true);
    const gestor = permissoesEfetivas('GESTOR', true, {});
    expect(gestor.editarDocumentos).toBe(true);
    expect(gestor.administrarDocumentoPrincipal).toBe(false);
    expect(gestor.arquivarDocumentoPrincipal).toBe(false);
    expect(gestor.reativarDocumentoPrincipal).toBe(false);
    expect(gestor.excluirDocumentoPrincipal).toBe(false);
    expect(permissoesEfetivas('GESTOR', true, { administrarDocumentoPrincipal: true }).arquivarDocumentoPrincipal).toBe(false);
    expect(permissoesEfetivas('GESTOR', false, { arquivarDocumentoPrincipal: true }).reativarDocumentoPrincipal).toBe(false);
    const colaborador = permissoesEfetivas('COLABORADOR', false, { anexarDocumentos: true });
    expect(colaborador.anexarDocumentos).toBe(true);
    expect(colaborador.editarContrato).toBe(false);
    expect(ACAO_PERMISSAO['documentos:editar']).toBe('editarDocumentos');
    expect(ACAO_PERMISSAO['documentos:reativar']).toBe('reativarDocumentos');
    expect(ACAO_PERMISSAO['documentos:excluir']).toBe('excluirDocumentosArquivados');
    expect(permissoesEfetivas('GESTOR', true, null).excluirDocumentosArquivados).toBe(false);
    expect(permissoesEfetivas('ADMINISTRADOR', false, null).excluirDocumentosArquivados).toBe(true);
    expect(permissoesEfetivas('COLABORADOR', false, { excluirDocumentosArquivados: true }).excluirDocumentosArquivados).toBe(true);
  });
});


describe('separação entre arquivar, reativar e excluir', () => {
  for (const [acaoArquivar, acaoReativar, chaveArquivar, chaveReativar] of [
    ['etapas:arquivar', 'etapas:reativar', 'arquivarEtapas', 'reativarEtapas'],
    ['entregaveis:arquivar', 'entregaveis:reativar', 'arquivarEntregaveis', 'reativarEntregaveis'],
    ['evidencias:arquivaresperada', 'evidencias:reativaresperada', 'arquivarEvidencias', 'reativarEvidencias'],
    ['documentos:arquivar', 'documentos:reativar', 'arquivarDocumentos', 'reativarDocumentos'],
  ] as const) {
    it(`${acaoArquivar} não libera ${acaoReativar}`, () => {
      expect(ACAO_PERMISSAO[acaoArquivar]).toBe(chaveArquivar);
      expect(ACAO_PERMISSAO[acaoReativar]).toBe(chaveReativar);
      const escopo = { [chaveArquivar]: true, [chaveReativar]: false };
      const delegadas = permissoesEfetivas('COLABORADOR', false, escopo);
      expect(delegadas[chaveArquivar]).toBe(true);
      expect(delegadas[chaveReativar]).toBe(false);
      expect(permissoesEfetivas('ADMINISTRADOR', false, escopo)[chaveReativar]).toBe(true);
    });
  }
  it('reativar depende de concessão própria, mesmo em vínculo legado de gestor editor', () => {
    expect(permissoesEfetivas('GESTOR', true, null).reativarEtapas).toBe(false);
    expect(permissoesEfetivas('GESTOR', true, { reativarEtapas: true }).reativarEtapas).toBe(true);
    expect(validarPermissoes({ reativarEtapas: true, arquivarEtapas: false })).toEqual({ reativarEtapas: true, arquivarEtapas: false });
  });
});


describe('cancelar um contrato não é arquivar, concluir ou reabrir conclusão', () => {
  it('não delega cancelamento nem reversão automaticamente ao Gestor editor', () => {
    const gestor = permissoesEfetivas('GESTOR', true, null);
    expect(gestor.cancelarContrato).toBe(false);
    expect(gestor.reverterCancelamentoContrato).toBe(false);
    expect(permissoesEfetivas('GESTOR', true, { cancelarContrato: true }).reverterCancelamentoContrato).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', false, { reverterCancelamentoContrato: true }).cancelarContrato).toBe(false);
    const admin = permissoesEfetivas('ADMINISTRADOR', false, null);
    expect(admin.cancelarContrato).toBe(true);
    expect(admin.reverterCancelamentoContrato).toBe(true);
  });
});


describe('encerramento antecipado tem competência independente', () => {
  it('não concede encerrarContrato automaticamente ao Gestor editor ou Colaborador', () => {
    expect(permissoesEfetivas('GESTOR', true, {}).encerrarContrato).toBe(false);
    expect(permissoesEfetivas('COLABORADOR', true, {}).encerrarContrato).toBe(false);
  });
  it('permite delegação explícita e mantém concluirContrato independente', () => {
    const p = permissoesEfetivas('GESTOR', false, { encerrarContrato: true });
    expect(p.encerrarContrato).toBe(true);
    expect(p.concluirContrato).toBe(false);
  });
});


describe('HU08-05-01 — ciclo de vida e segregação de permissões', () => {
  it('não concede poderes de verificação, arquivamento, reabertura ou reativação automaticamente', () => {
    const padrao = permissoesEfetivas('GESTOR', true, null);
    expect(padrao.registrarAtividades).toBe(true);
    expect(padrao.editarAtividades).toBe(true);
    for (const chave of ['verificarAtividades', 'reabrirAtividades', 'arquivarAtividades', 'reativarAtividades', 'excluirAtividadesArquivadas'] as const)
      expect(padrao[chave]).toBe(false);
  });
  it('exige autorização independente para cada transição', () => {
    const base = permissoesEfetivas('COLABORADOR', false, { arquivarAtividades: true, verificarAtividades: false });
    expect(base.arquivarAtividades).toBe(true);
    expect(base.verificarAtividades).toBe(false);
    expect(ACAO_PERMISSAO['atividades:reativar']).toBe('reativarAtividades');
    expect(ACAO_PERMISSAO['atividades:excluir']).toBe('excluirAtividadesArquivadas');
    expect(() => validarPermissoes({ verificarAtividades: 'true' })).toThrow();
  });
});


test('vínculo sem acesso de edição não herda escrita no diário, mas aceita delegação explícita', () => {
  const somenteLeitura = permissoesEfetivas('COLABORADOR', false, null);
  expect(somenteLeitura.registrarAtividades).toBe(false);
  expect(somenteLeitura.editarAtividades).toBe(false);
  const delegado = permissoesEfetivas('COLABORADOR', false, { registrarAtividades: true, editarAtividades: false });
  expect(delegado.registrarAtividades).toBe(true);
  expect(delegado.editarAtividades).toBe(false);
});
