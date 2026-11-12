import { criarEtapa, editarEtapa, ErroEtapa, listarEtapas, reordenarEtapas, type DadosEtapa } from './etapas';

const fetchOriginal = global.fetch;
const idContrato = '11111111-1111-4111-8111-111111111111';
const api = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const dados: DadosEtapa = {
  nome: 'Fase inicial', codigo: null, descricao: null, inicioPrevisto: null,
  terminoPrevisto: null, status: 'PLANEJADA', observacoes: null,
};
const resposta = (status: number, json: unknown = {}) => ({ ok: status >= 200 && status < 300, status, json: async () => json }) as Response;
let fetchMock: jest.Mock;

beforeEach(() => { fetchMock = jest.fn(); global.fetch = fetchMock; });
afterAll(() => { global.fetch = fetchOriginal; });

describe('HU06-03 — consumo HTTP real', () => {
  test('GET usa cookie de sessão e cache no-store sem armazenar credenciais', async () => {
    fetchMock.mockResolvedValue(resposta(200, []));
    await expect(listarEtapas(idContrato)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(`${api}/contratos/${idContrato}/etapas`,
      expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
  });
  test('POST/PATCH transportam dados sem id, contratoId ou sequencia no body', async () => {
    fetchMock.mockResolvedValue(resposta(201, { id: 'e' }));
    await criarEtapa(idContrato, dados);
    const [, initCriar] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(initCriar.body as string)).toEqual(dados);
    expect(initCriar.method).toBe('POST');
    fetchMock.mockResolvedValue(resposta(200, { id: 'e' }));
    await editarEtapa(idContrato, 'etapa-A', dados);
    const [url, initEditar] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain('/etapas/etapa-A');
    expect(initEditar.method).toBe('PATCH');
  });
  test('reordenação envia ordem observada e desejada', async () => {
    fetchMock.mockResolvedValue(resposta(200, []));
    await reordenarEtapas(idContrato, ['a', 'b'], ['b', 'a']);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/etapas/reordenar');
    expect(JSON.parse(init.body as string)).toEqual({ idsOrdemAtual: ['a', 'b'], idsOrdemNova: ['b', 'a'] });
  });
  const errosHttp: [number, RegExp][] = [[400, /campos/i], [401, /sessão/i], [403, /permissão/i], [404, /indisponível/i], [409, /alteradas/i], [500, /tente novamente/i]];
  test.each(errosHttp)(
    'trata erro HTTP %i sem expor resposta interna', async (status, esperado) => {
      fetchMock.mockResolvedValue(resposta(status, { internalSql: 'NEVER-LEAK' }));
      await expect(listarEtapas(idContrato)).rejects.toMatchObject({ status, message: expect.stringMatching(esperado) });
      await expect(listarEtapas(idContrato)).rejects.toBeInstanceOf(ErroEtapa);
    },
  );
  test('falha de rede é mensagem amigável', async () => {
    fetchMock.mockRejectedValue(new Error('socket IP private'));
    await expect(listarEtapas(idContrato)).rejects.toMatchObject({ status: 0, message: expect.not.stringContaining('socket') });
  });
});
