import { jest } from '@jest/globals';
import type { EntityManager } from 'typeorm';
import { protegerReferenciaManual } from './proteger-referencia-execucao.js';

describe('proteção de referências de execução',()=>{
  it('impede alterar uma fonte com comprovação reconhecida dependente',async()=>{
    const query=jest.fn(async (..._args: unknown[]) => [{dependente:true}]);
    await expect(protegerReferenciaManual({query} as unknown as EntityManager,'contrato','fonte','QUANTIDADE')).rejects.toThrow('Reabra primeiro');
    expect(query).toHaveBeenCalledWith(expect.any(String),['contrato','manual:fonte']);
  });
  it('usa a identidade da evidência quando esta é a fonte',async()=>{
    const query=jest.fn(async (..._args: unknown[]) => [{dependente:false}]);
    await expect(protegerReferenciaManual({query} as unknown as EntityManager,'contrato','fonte','QUANTIDADE','evidencia')).resolves.toBeUndefined();
    expect(query).toHaveBeenCalledWith(expect.any(String),['contrato','evidencia:fonte']);
  });
});
