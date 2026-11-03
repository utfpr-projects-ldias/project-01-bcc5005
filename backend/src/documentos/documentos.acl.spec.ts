import { jest } from '@jest/globals';
import { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { PoliticaAcessoService } from '../autorizacao/politica-acesso.service.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const contratoA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const contratoB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const documentoId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const docScope = {
  tipo: 'recurso' as const, recurso: 'documento' as const,
  parametro: 'documentoId', parametroContratoPai: 'contratoId',
};

describe('TEC08-02: contratos raiz e IDOR (ACL sem HTTP/DB real)', () => {
  it('usa FK do recurso persistido, negando documento de B requisitado sob contrato A', async () => {
    const contratos = { findOneBy: jest.fn(async ({ id }: { id: string }) => ({ id })) };
    const etapas = { findOneBy: jest.fn() };
    const resolvedor = new ResolverEscopoContratoService(contratos as never, etapas as never);
    resolvedor.registrarAdaptador('documento', async () => contratoB);
    expect(await resolvedor.resolver(docScope, { contratoId: contratoA, documentoId })).toBeNull();
    expect(await resolvedor.resolver(docScope, { contratoId: contratoB, documentoId })).toBe(contratoB);
    expect(await resolvedor.resolver(docScope, { contratoId: contratoB, documentoId: '../path' })).toBeNull();
  });

  it('leitura autorizada por vínculo, escrita somente para gestor com poder de edição', async () => {
    const vinculos = { findOneBy: jest.fn(async () => ({ podeEditar: false })) };
    const politica = new PoliticaAcessoService(vinculos as never);
    const usuario = { id: documentoId, supertokensUserId: 'st-id', email: 'gestor@example.com', perfil: PerfilUsuario.GESTOR };
    const leitura = { acao: 'documentos:listar' as const, escopoOperacional: { tipo: 'contrato' as const, parametro: 'contratoId' } };
    const escrita = { acao: 'documentos:anexar' as const, escopoOperacional: { tipo: 'contrato' as const, parametro: 'contratoId' } };
    expect(await politica.permitido(usuario, leitura, contratoA)).toBe(true);
    expect(await politica.permitido(usuario, escrita, contratoA)).toBe(false);
    vinculos.findOneBy.mockResolvedValueOnce({ podeEditar: true });
    expect(await politica.permitido(usuario, escrita, contratoA)).toBe(true);
    const colaborador = { ...usuario, perfil: PerfilUsuario.COLABORADOR };
    expect(await politica.permitido(colaborador, escrita, contratoA)).toBe(false);
    vinculos.findOneBy.mockResolvedValueOnce(null as never);
    expect(await politica.permitido(usuario, leitura, contratoA)).toBe(false);
  });
});
