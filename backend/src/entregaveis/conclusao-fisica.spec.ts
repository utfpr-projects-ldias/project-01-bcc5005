import { jest } from '@jest/globals';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
import { Entregavel } from './entregavel.entity.js';
import { TipoEntregavel } from './tipo-entregavel.enum.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entrada = (tipo: TipoEntregavel, percentualExecucao: string | null = null): Entregavel => Object.assign(new Entregavel(), {
  contratoId, id: entregavelId, tipo, percentualExecucao,
  inicioPrevisto: null, terminoPrevisto: null, periodicidade: null, quantidadeRealizada: null,
  quantidadePrevista: null, dataEfetivaMarco: null,
});
function manager(ocorrencias: Ocorrencia[] = []) {
  const findBy = jest.fn(async (entidade: unknown) => entidade === Ocorrencia ? ocorrencias : []);
  return { findBy, find: jest.fn(async () => []), findOneBy: jest.fn(async () => null) };
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
  it('RB-03: ÚNICO com ocorrência descritiva concluída e execução 100% é apto', async () => {
    const ocorrencia = Object.assign(new Ocorrencia(), { status: 'CONCLUIDO', modoRegistro: 'DESCRITIVO' });
    const resultado = await aptidaoFisicaParaConclusao(manager([ocorrencia]) as never, entrada(TipoEntregavel.UNICO, '100'));
    expect(resultado).toEqual({ apto: true, percentual: 100, motivo: '' });
  });
  it('RB-03: ÚNICO com ocorrência pendente permanece bloqueado, mesmo a 100%', async () => {
    const ocorrencia = Object.assign(new Ocorrencia(), { status: 'EM_ANDAMENTO', modoRegistro: 'DESCRITIVO' });
    const resultado = await aptidaoFisicaParaConclusao(manager([ocorrencia]) as never, entrada(TipoEntregavel.UNICO, '100'));
    expect(resultado.apto).toBe(false);
    expect(resultado.motivo).toMatch(/Conclua todas as ocorrências/);
  });
  it('RB-03: ÚNICO concluído com ocorrência não exige cadastro compulsório de outra', async () => {
    const ocorrencia = Object.assign(new Ocorrencia(), { status: 'CONCLUIDO', modoRegistro: 'DESCRITIVO' });
    const resultado = await aptidaoFisicaParaConclusao(manager([ocorrencia]) as never, entrada(TipoEntregavel.UNICO, '45'));
    expect(resultado.apto).toBe(false);
    expect(resultado.percentual).toBe(45);
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
