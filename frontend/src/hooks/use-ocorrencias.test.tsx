import { renderHook, act } from '@testing-library/react';
import { useOcorrencias } from './use-ocorrencias';
import { useConsulta } from '@/app/components/provedor-consultas';

jest.mock('@/app/components/provedor-consultas', () => ({ useConsulta: jest.fn(), useRepositorioConsultasOpcional: () => null }));
const consulta = useConsulta as jest.Mock;
const buscar = jest.fn();
const atualizar = jest.fn(async () => []);

beforeEach(() => {
  jest.clearAllMocks();
  consulta.mockReturnValue({ dados: [], carregando: false, erro: null, atualizar });
  global.fetch = buscar as unknown as typeof fetch;
});

test('cadastro manual usa a rota com contrato + entregável e DTO sem entregavelId', async () => {
  buscar.mockResolvedValue({ ok: true, status: 201 });
  const { result } = renderHook(() => useOcorrencias('contrato-01'));
  await act(async () => {
    await result.current.criarOcorrenciaManual({ entregavelId: 'entregavel-02', titulo: 'Serviço executado', periodoInicio: '2026-11-01', periodoFim: '2026-11-30' });
  });
  expect(buscar).toHaveBeenCalledTimes(1);
  const [rota, opcoes] = buscar.mock.calls[0];
  expect(rota).toContain('/contratos/contrato-01/entregaveis/entregavel-02/ocorrencias');
  expect(opcoes.method).toBe('POST');
  expect(opcoes.credentials).toBe('include');
  const corpo = JSON.parse(opcoes.body);
  expect(corpo).toEqual({ titulo: 'Serviço executado', periodoInicio: '2026-11-01', periodoFim: '2026-11-30' });
  expect(corpo).not.toHaveProperty('entregavelId');
  expect(atualizar).toHaveBeenCalledTimes(1);
});

test('edição usa PATCH da ocorrência no contrato sem URL global e com autenticação', async () => {
  buscar.mockResolvedValue({ ok: true, status: 200 });
  const { result } = renderHook(() => useOcorrencias('contrato-01'));
  await act(async () => { await result.current.editarOcorrencia('oc-03', { status: 'EM_ANDAMENTO' }); });
  expect(buscar).toHaveBeenCalledWith(expect.stringContaining('/contratos/contrato-01/ocorrencias/oc-03'), expect.objectContaining({ method: 'PATCH', credentials: 'include', body: JSON.stringify({ status: 'EM_ANDAMENTO' }) }));
});

test('erro de permissão não aparece como sucesso nem força revalidação', async () => {
  buscar.mockResolvedValue({ ok: false, status: 403 });
  const { result } = renderHook(() => useOcorrencias('contrato-01'));
  await expect(result.current.criarOcorrenciaManual({ entregavelId: 'ent-01', titulo: 'x' })).rejects.toThrow('permissão');
  expect(atualizar).not.toHaveBeenCalled();
});


test('geração de recorrências não força regeneração, usa endpoint dedicado e lê novasGeradas', async () => {
  buscar.mockResolvedValue({ ok: true, status: 201, json: async () => ({ novasGeradas: 3, existentes: 2 }) });
  const { result } = renderHook(() => useOcorrencias('contrato-01'));
  let total = -1;
  await act(async () => { total = await result.current.gerarOcorrenciasRecorrentes('entregavel-03'); });
  expect(total).toBe(3);
  expect(buscar).toHaveBeenCalledWith(expect.stringContaining('/contratos/contrato-01/entregaveis/entregavel-03/ocorrencias/gerar'),
    expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ forcarRegeneracaoFuturas: false }) }));
  expect(atualizar).toHaveBeenCalledTimes(1);
});

test('prévia de replanejamento não atualiza nem envia confirmação; aplicação confirma token', async () => {
  const plano = { inicioFuturo:'2026-12-01', terminoPrevisto:'2026-12-31', periodicidade:'MENSAL' };
  buscar.mockResolvedValueOnce({ok:true,json:async()=>({confirmacao:'token',aplicado:false})}).mockResolvedValueOnce({ok:true,json:async()=>({confirmacao:'token',aplicado:true})});
  const { result } = renderHook(() => useOcorrencias('c'));
  await act(async()=>{await result.current.replanejar('e',plano);});
  expect(atualizar).not.toHaveBeenCalled();
  await act(async()=>{await result.current.replanejar('e',{...plano,confirmacao:'token'});});
  expect(buscar).toHaveBeenLastCalledWith(expect.stringContaining('/contratos/c/entregaveis/e/ocorrencias/replanejar'),expect.objectContaining({body:JSON.stringify({...plano,confirmacao:'token'})}));
  expect(atualizar).toHaveBeenCalledTimes(1);
});
