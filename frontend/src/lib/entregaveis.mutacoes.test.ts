import { criarEntregavel, editarEntregavel, ErroEntregavel } from './entregaveis';
import { inicialEntregavel, validarEntregavel } from './validacao-entregavel';
const resposta = { id: 'e', contratoId: 'c', etapaId: 'etapa', tipo: 'UNICO' };
const dados = validarEntregavel({ ...inicialEntregavel('etapa'), nome: 'Reunião' });
if (!dados.sucesso) throw Error('Dados de teste inválidos');
const payload = dados.dados;
const fetchSimulado = jest.fn();
beforeEach(() => { fetchSimulado.mockReset(); global.fetch = fetchSimulado; });
test('POST real credenciado preserva payload e não envia execução/comprovação', async () => {
  fetchSimulado.mockResolvedValue({ ok: true, status: 201, json: async () => resposta });
  expect(await criarEntregavel('c', payload)).toEqual(resposta);
  expect(fetchSimulado).toHaveBeenCalledWith('http://localhost:3001/contratos/c/entregaveis', expect.objectContaining({
    method: 'POST', credentials: 'include', cache: 'no-store', body: JSON.stringify(payload),
  }));
});
test('PATCH não confunde caminho de contrato e de entregável', async () => {
  fetchSimulado.mockResolvedValue({ ok: true, status: 200, json: async () => resposta });
  await editarEntregavel('contrato-a', 'entregavel-b', payload);
  expect(fetchSimulado).toHaveBeenCalledWith('http://localhost:3001/contratos/contrato-a/entregaveis/entregavel-b', expect.objectContaining({ method: 'PATCH' }));
});
test('409 preserva formulário e informa bloqueio por ocorrências; 403 nega edição', async () => {
  fetchSimulado.mockResolvedValueOnce({ ok: false, status: 409 }).mockResolvedValueOnce({ ok: false, status: 403 });
  await expect(editarEntregavel('c', 'e', payload)).rejects.toMatchObject({ status: 409, name: 'ErroEntregavel' });
  await expect(criarEntregavel('c', payload)).rejects.toMatchObject({ status: 403, name: 'ErroEntregavel' });
  expect(new ErroEntregavel(400, 'x')).toBeInstanceOf(Error);
});
