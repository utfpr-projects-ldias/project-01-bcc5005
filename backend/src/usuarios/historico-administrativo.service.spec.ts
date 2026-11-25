import { jest } from '@jest/globals';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { HistoricoAdministrativoService } from './historico-administrativo.service.js';
import { PerfilUsuario } from './perfil-usuario.enum.js';

const ator = { id: 'admin', email: 'admin@qa.org', supertokensUserId: 'st-admin', perfil: PerfilUsuario.ADMINISTRADOR };
const cursor = '0c34d19e-2b28-4d3d-bb76-284f29973a10';
function cenario() {
  const findOne = jest.fn(async () => ({ ...ator, ativo: true, bloqueioSessoesId: null as string | null }));
  const query = jest.fn(async (_sql: string, _params: unknown[]) => Array.from({ length: 101 }, (_, i) => ({ id: `evt-${i}` })));
  const m = { getRepository: () => ({ findOne }), query } as unknown as EntityManager;
  const transaction = jest.fn(async (f: (manager: EntityManager) => Promise<unknown>) => f(m));
  const service = new HistoricoAdministrativoService({ transaction } as unknown as DataSource);
  return { service, findOne, query, transaction };
}
it('pagina histórico exclusivo de usuários, sem selecionar snapshots', async () => {
  const c = cenario();
  const r = await c.service.consultar(ator, cursor);
  expect(r.itens).toHaveLength(100); expect(r.proximo).toBe('evt-99');
  expect(c.query).toHaveBeenCalledWith(expect.stringContaining("e.entidade_tipo='USUARIO'"), [cursor]);
  expect(c.query.mock.calls[0][0]).not.toContain('e.dados_anteriores');
});
it('rejeita cursor inválido e colaborador antes de acessar banco', async () => {
  const c = cenario();
  await expect(c.service.consultar(ator, 'invalido')).rejects.toBeInstanceOf(BadRequestException);
  await expect(c.service.consultar({ ...ator, perfil: PerfilUsuario.COLABORADOR })).rejects.toBeInstanceOf(ForbiddenException);
  expect(c.transaction).not.toHaveBeenCalled();
});
it('revalida bloqueio de credenciais da conta do administrador', async () => {
  const c = cenario();
  c.findOne.mockResolvedValueOnce({ ...ator, ativo: true, bloqueioSessoesId: cursor });
  await expect(c.service.consultar(ator)).rejects.toBeInstanceOf(ForbiddenException);
  expect(c.query).not.toHaveBeenCalled();
});
