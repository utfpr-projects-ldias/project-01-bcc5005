import 'reflect-metadata';
import { jest } from '@jest/globals';
import { CHAVE_POLITICA } from '../autorizacao/politica.decorator.js';
import { MinhaContaController } from './minha-conta.controller.js';
import type { MinhaContaService } from './minha-conta.service.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';

it('as rotas usam somente a identidade do guard; não recebem ID de outro usuário', async () => {
  const alterarEmail = jest.fn<(...args: unknown[]) => Promise<{ id: string; email: string }>>().mockResolvedValue({ id: 'proprio', email: 'novo@qa.org' });
  const alterarSenha = jest.fn<(...args: unknown[]) => Promise<void>>().mockResolvedValue(undefined);
  const c = new MinhaContaController({ alterarEmail, alterarSenha } as unknown as MinhaContaService);
  const ator = { id: 'proprio', perfil: PerfilUsuario.ADMINISTRADOR, email: 'admin@qa.org', supertokensUserId: 'st-admin' };
  const req = { usuarioDominio: ator } as unknown as RequisicaoAutorizada;
  await c.alterarMeuEmail({ email: 'novo@qa.org', senhaAtual: 'senha' }, req);
  await c.alterarMinhaSenha({ senhaAtual: 'antiga', novaSenha: 'nova' }, req);
  expect(alterarEmail).toHaveBeenCalledWith('novo@qa.org', 'senha', ator);
  expect(alterarSenha).toHaveBeenCalledWith('antiga', 'nova', ator);
  const politica = Reflect.getMetadata(CHAVE_POLITICA, MinhaContaController);
  expect(politica).toEqual({ acao: 'perfil:proprio', parametroContrato: undefined });
});
