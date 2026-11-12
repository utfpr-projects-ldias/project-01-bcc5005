import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CriarEtapaDto } from './criar-etapa.dto.js';
import { AtualizarEtapaDto } from './atualizar-etapa.dto.js';
import { ReordenarEtapasDto } from './reordenar-etapas.dto.js';

const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

describe('HU06-02 — contratos de entrada da API', () => {
  it('aceita nome e datas civis válidas no cadastro', async () => {
    const dto = plainToInstance(CriarEtapaDto, {
      nome: 'Execução', inicioPrevisto: '2026-10-30', terminoPrevisto: '2026-11-30',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('recusa nome obrigatório omitido, status desconhecido e data sem formato civil', async () => {
    const dto = plainToInstance(CriarEtapaDto, {
      status: 'CANCELADA', inicioPrevisto: '2026-10-30T15:00:00Z',
    });
    expect((await validate(dto)).map((erro) => erro.property).sort())
      .toEqual(['inicioPrevisto', 'nome', 'status']);
  });

  it('PATCH parcial aceita limpeza explícita de campos opcionais, mas não null em obrigatórios', async () => {
    expect(await validate(plainToInstance(AtualizarEtapaDto, { descricao: null }))).toHaveLength(0);
    const campos = (await validate(plainToInstance(AtualizarEtapaDto, {
      nome: null, status: null,
    }))).map((erro) => erro.property).sort();
    expect(campos).toEqual(['nome', 'status']);
  });

  it('reordenação exige dois arrays completos de UUID sem duplicações', async () => {
    expect(await validate(plainToInstance(ReordenarEtapasDto, {
      idsOrdemAtual: [ID_A, ID_B], idsOrdemNova: [ID_B, ID_A],
    }))).toHaveLength(0);
    expect((await validate(plainToInstance(ReordenarEtapasDto, {
      idsOrdemAtual: [ID_A, ID_A], idsOrdemNova: ['id-invalido'],
    }))).map((e) => e.property).sort()).toEqual(['idsOrdemAtual', 'idsOrdemNova']);
  });
});
