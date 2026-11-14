import { jest } from '@jest/globals';
import { MetasMarcoService } from './metas-marco.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const usuario = {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',perfil:'COLABORADOR'};

describe('Metas do Marco — autorização fechada por contrato', () => {
  it('nega cadastrar meta quando o usuário não recebeu permissão explícita', async () => {
    const permitido=jest.fn(async()=>false);
    const ds={transaction:jest.fn()} as never;
    const service=new MetasMarcoService(ds,{permitido} as never,{} as never);
    await expect(service.criar(contratoId,entregavelId,
      {tipo:'ATIVIDADE',titulo:'Treinamento',quantidadeExigida:2},usuario as never))
      .rejects.toThrow(/Sem autorização/);
    expect((ds as {transaction:jest.Mock}).transaction).not.toHaveBeenCalled();
  });
});
