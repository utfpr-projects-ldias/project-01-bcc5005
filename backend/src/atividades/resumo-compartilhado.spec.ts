import { contarAprovacoes } from './resumo-compartilhado.js';

describe('aprovação multicontrato', () => {
  it('deriva 2/6 e depois 3/6 de estados independentes', () => {
    const locais = ['VERIFICADA','VERIFICADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO','REGISTRADA','REGISTRADA'];
    expect(contarAprovacoes(locais)).toEqual({total:6,aprovadas:2,pendentes:2});
    locais[2] = 'VERIFICADA';
    expect(contarAprovacoes(locais).aprovadas).toBe(3);
  });
  it('reabertura em um contrato diminui 3/6 sem afetar os demais', () => {
    const locais = ['VERIFICADA','VERIFICADA','VERIFICADA','REGISTRADA','REGISTRADA','REGISTRADA'];
    locais[1] = 'REGISTRADA';
    expect(contarAprovacoes(locais).aprovadas).toBe(2);
  });
});
