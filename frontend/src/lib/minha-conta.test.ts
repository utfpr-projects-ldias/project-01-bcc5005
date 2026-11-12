import { alterarMeuEmail, alterarMinhaSenha, ErroApi } from './admin-usuarios';

const antigo = global.fetch;
afterAll(() => { global.fetch = antigo; });
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'uuid-admin', email: 'novo@qa.org' }) }) as typeof fetch;
});

test('e-mail próprio envia credenciais apenas ao endpoint /me; sem ID arbitrário', async () => {
  await alterarMeuEmail('novo@qa.org', 'SenhaAtual!123');
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/usuarios/me/email', expect.objectContaining({
    method: 'PATCH', credentials: 'include', cache: 'no-store',
    body: JSON.stringify({ email: 'novo@qa.org', senhaAtual: 'SenhaAtual!123' }),
  }));
  expect((global.fetch as jest.Mock).mock.calls[0][0]).not.toContain('admin/usuarios');
});

test('senha própria exige senha atual, envia a nova por corpo e aceita 204', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 204 }) as typeof fetch;
  await alterarMinhaSenha('SenhaAtual!123', 'OutraSenha!123');
  expect(global.fetch).toHaveBeenCalledWith('http://localhost:3001/usuarios/me/senha', expect.objectContaining({
    method: 'PUT', credentials: 'include', body: JSON.stringify({ senhaAtual: 'SenhaAtual!123', novaSenha: 'OutraSenha!123' }),
  }));
});

test('401 e 403 do backend são mantidos; UI não concede autorização', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 403 }) as typeof fetch;
  await expect(alterarMeuEmail('novo@qa.org', 'senha')).rejects.toMatchObject({ status: 403 });
  expect(ErroApi).toBeDefined();
});
