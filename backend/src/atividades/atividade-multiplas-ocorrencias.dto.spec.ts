import { validate } from 'class-validator';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('HU08/HU09 — vínculos N:N de atividades', () => {
  it('aceita várias ocorrências distintas, vinculadas explicitamente no DTO', async () => {
    const entrada = Object.assign(new CreateAtividadeDto(), {
      contratoId: A, titulo: 'Visita técnica', dataHora: '2027-03-15T13:00:00.000Z',
      descricao: 'Atividade compartilhada', tipo: 'Visita', entregavelIds: [B, C],
      ocorrenciaIds: [B, C],
    });
    expect(await validate(entrada)).toHaveLength(0);
  });

  it('recusa duplicação de ocorrências e IDs inválidos no cadastro', async () => {
    const entrada = Object.assign(new CreateAtividadeDto(), {
      contratoId: A, titulo: 'Visita técnica', dataHora: '2027-03-15T13:00:00.000Z',
      descricao: 'Atividade compartilhada', tipo: 'Visita', entregavelIds: [B],
      ocorrenciaIds: [B, B],
    });
    expect((await validate(entrada)).some(e => e.property === 'ocorrenciaIds')).toBe(true);
    entrada.ocorrenciaIds = ['não-é-uuid'];
    expect((await validate(entrada)).some(e => e.property === 'ocorrenciaIds')).toBe(true);
  });

  it('permite retirar todas as ocorrências sem retirar os entregáveis', async () => {
    const alteracao = Object.assign(new UpdateAtividadeDto(), { ocorrenciaIds: [] });
    expect(await validate(alteracao)).toHaveLength(0);
  });
});
