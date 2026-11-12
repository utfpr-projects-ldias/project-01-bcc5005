import { renderHook, act } from '@testing-library/react';
import { useProgresso } from './use-progresso';
import { useConsulta } from '@/app/components/provedor-consultas';
jest.mock('@/app/components/provedor-consultas',()=>({useConsulta:jest.fn(),useRepositorioConsultasOpcional:()=>null}));
const fetchMock=jest.fn(); const atualizar=jest.fn(async()=>undefined);
beforeEach(()=>{jest.clearAllMocks();global.fetch=fetchMock as unknown as typeof fetch;(useConsulta as jest.Mock).mockReturnValue({dados:null,carregando:false,erro:null,atualizar});});
test('TEC09 atualiza execução pela rota aninhada',async()=>{fetchMock.mockResolvedValue({ok:true});const {result}=renderHook(()=>useProgresso('c'));await act(async()=>{await result.current.atualizarExecucao('e',{percentualManual:50});});expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/contratos/c/entregaveis/e/execucao'),expect.objectContaining({method:'PATCH',credentials:'include',body:'{"percentualManual":50}'}));expect(atualizar).toHaveBeenCalledTimes(1);});
test('pesos usam versão e lote integral; conflito não atualiza consulta',async()=>{fetchMock.mockResolvedValue({ok:false,status:409});const {result}=renderHook(()=>useProgresso('c'));await expect(result.current.atualizarPesos('v',[{entregavelId:'e',peso:'100'}])).rejects.toThrow();expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/contratos/c/pesos'),expect.objectContaining({body:JSON.stringify({versao:'v',pesos:[{entregavelId:'e',peso:'100'}]})}));expect(atualizar).not.toHaveBeenCalled();});

test('troca do modo de cálculo usa API persistente e versão, não estado visual local', async () => {
  fetchMock.mockResolvedValue({ ok: true });
  const { result } = renderHook(() => useProgresso('c'));
  await act(async () => { await result.current.atualizarModoCalculo('versao', 'SIMPLES'); });
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/contratos/c/modo-calculo'), expect.objectContaining({
    method: 'PATCH', credentials: 'include', body: JSON.stringify({ versao: 'versao', modoCalculo: 'SIMPLES' }),
  }));
  expect(atualizar).toHaveBeenCalledTimes(1);
});
