import { jest } from '@jest/globals';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
import { Entregavel } from './entregavel.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entrada = (tipo: TipoEntregavel, percentualExecucao: string | null = null) => Object.assign(new Entregavel(), {
  contratoId, id: entregavelId, tipo, percentualExecucao,
  inicioPrevisto: null, terminoPrevisto: null, periodicidade: null, quantidadeRealizada: null,
  quantidadePrevista: null, dataEfetivaMarco: null,
});
function manager(ocorrencias: Ocorrencia[] = []) {
  const findBy = jest.fn(async (entidade: unknown) => entidade === Ocorrencia ? ocorrencias : []);
  return { findBy };
}

describe('Regularização: conclusão física é independente do checklist e exige 100%', () => {
  it('impede conclusão automática só porque a atividade foi verificada, sem 100% físico', async () => {
    const m = manager();
    const resultado = await aptidaoFisicaParaConclusao(m as never, entrada(TipoEntregavel.UNICO, '60'));
    expect(resultado.apto).toBe(false);
    expect(resultado.percentual).toBe(60);
  });
  it('aceita entregável único quando o progresso físico é 100% e não há ocorrências abertas', async () => {
    const resultado = await aptidaoFisicaParaConclusao(manager() as never, entrada(TipoEntregavel.UNICO, '100'));
    expect(resultado.apto).toBe(true);
    expect(resultado.percentual).toBe(100);
  });
  it('uma ocorrência pendente bloqueia mesmo um marco executado', async () => {
    const o = Object.assign(new Ocorrencia(), { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'PENDENTE_CONCLUSAO' });
    const e = entrada(TipoEntregavel.MARCO);
    e.dataEfetivaMarco = '2026-11-11';
    const resultado = await aptidaoFisicaParaConclusao(manager([o]) as never, e);
    expect(resultado.apto).toBe(false);
    expect(resultado.motivo).toMatch(/ocorrências ativas/);
  });
  it('recorrente sem agenda completa não pode ser encerrado', async () => {
    const resultado = await aptidaoFisicaParaConclusao(manager() as never, entrada(TipoEntregavel.RECORRENTE));
    expect(resultado.apto).toBe(false);
  });
});


describe('RF-14 e RB-03: quantitativo pode ser executado sem ocorrências', () => {
  it('considera 115 executados de 100 previstos, sem criar ocorrências fictícias', async () => {
    const e = entrada(TipoEntregavel.QUANTITATIVO);
    e.quantidadePrevista = '100'; e.quantidadeRealizada = '115';
    const resultado = await aptidaoFisicaParaConclusao(manager() as never,e);
    expect(resultado.apto).toBe(true);
    expect(resultado.percentual).toBe(100);
  });
  it('não conclui entregável quantitativo se não houver quantidade informada', async () => {
    const e=entrada(TipoEntregavel.QUANTITATIVO);
    e.quantidadePrevista = '100';
    expect((await aptidaoFisicaParaConclusao(manager() as never,e)).apto).toBe(false);
  });
});
