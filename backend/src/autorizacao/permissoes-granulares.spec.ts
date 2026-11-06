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
