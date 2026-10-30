import { listarEntregaveis, detalharEntregavel, ErroEntregavel, dataPlanejada } from './entregaveis';
const id = 'aaaa/bbbb';
const outro = 'xxxx yyyy';
beforeEach(() => { global.fetch = jest.fn(); });
test('HU07-03: GET real por contrato, com cookie, sem cache nem corpo ficticio', async () => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: true, json: async () => [] });
  await expect(listarEntregaveis(id)).resolves.toEqual([]);
  expect(global.fetch).toHaveBeenCalledWith(
    'http://localhost:3001/contratos/aaaa%2Fbbbb/entregaveis',
    expect.objectContaining({ method: 'GET', credentials: 'include', cache: 'no-store' }),
  );
  await detalharEntregavel(id, outro);
  expect((global.fetch as jest.Mock).mock.calls[1][0]).toBe('http://localhost:3001/contratos/aaaa%2Fbbbb/entregaveis/xxxx%20yyyy');
});
test.each([401, 403, 404, 500])('HU07-03: HTTP %i rejeita consulta sem devolver dados anteriores', async (status) => {
  (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status });
  await expect(listarEntregaveis('contrato')).rejects.toMatchObject({ name: 'ErroEntregavel', status });
});
test('HU07-03: falha de rede tem codigo distinto de 401', async () => {
  (global.fetch as jest.Mock).mockRejectedValue(new Error('rede'));
  await expect(listarEntregaveis('id')).rejects.toEqual(expect.objectContaining({ status: 0 }));
  expect(new ErroEntregavel(403, 'negado')).toBeInstanceOf(Error);
});
test('data civil nao sofre conversao de timezone', () => {
  expect(dataPlanejada('2026-11-01')).toBe('01/11/2026');
  expect(dataPlanejada(null)).toBe('Não informada');
});
