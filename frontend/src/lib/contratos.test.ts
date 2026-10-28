import { criarContrato, editarContrato, listarContratos, terminoPorMeses, ErroContrato } from './contratos';
const fetchMock = jest.fn();
beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock as typeof fetch; });

test('GET lista por API com cookie, nunca fixture local', async () => {
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => [] });
  expect(await listarContratos()).toEqual([]);
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/contratos'), expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
});
test('POST envia JSON camelCase e retorna contrato real', async () => {
  const item = { numeroContrato: '2026/001', modoCalculo: 'SIMPLES', status: 'PLANEJAMENTO' };
  fetchMock.mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: 'uuid', ...item }) });
  const retorno = await criarContrato(item as Parameters<typeof criarContrato>[0]);
  expect(retorno.id).toBe('uuid');
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/contratos'), expect.objectContaining({ method: 'POST', body: JSON.stringify(item) }));
});
test('PATCH não mascara falha, mantém resposta 403', async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 403 });
  await expect(editarContrato('uuid', { status: 'CONCLUIDO' })).rejects.toMatchObject({ status: 403, name: 'ErroContrato' });
});
test('falha de rede é detectada sem confirmação fictícia', async () => {
  fetchMock.mockRejectedValue(new Error('offline'));
  await expect(listarContratos()).rejects.toBeInstanceOf(ErroContrato);
});
test('vigência inclusiva e fim de mês curto não homologado', () => {
  expect(terminoPorMeses('2026-10-17', 12)).toBe('2027-10-16');
  expect(terminoPorMeses('2026-01-31', 1)).toBeNull();
  expect(terminoPorMeses('2024-02-29', 12)).toBeNull();
  expect(terminoPorMeses('2026-01-01', 0)).toBeNull();
});
