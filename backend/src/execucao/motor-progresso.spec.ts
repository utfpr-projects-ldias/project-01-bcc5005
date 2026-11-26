import { agregarFisico, calcularFisico } from './motor-progresso.js';

describe('TEC09 — motor físico independente', () => {
  it('calcula 47,5 com pesos 20/30/50', () => {
    expect(agregarFisico([{ percentual: 100, peso: '20' }, { percentual: 50, peso: '30' }, { percentual: 25, peso: '50' }]).avancoPonderado).toBe(47.5);
  });
  it.each(['99', '101', null])('não considera completa a distribuição %s', peso => {
    expect(agregarFisico([{ percentual: 100, peso }]).pesosValidos).toBe(false);
  });
  it('não inventa zero na ausência de dados', () => {
    expect(agregarFisico([]).avancoSimples).toBeNull();
    expect(agregarFisico([{ percentual: null, peso: '100' }]).avancoPonderado).toBeNull();
    expect(calcularFisico({ tipo: 'RECORRENTE', ocorrenciasPrevistas: 0, ocorrenciasConcluidas: 0 })).toBeNull();
    expect(calcularFisico({ tipo: 'CONTINUO' })).toBeNull();
  });
  it('limita a meta e inclui futuros', () => {
    expect(calcularFisico({ tipo: 'QUANTITATIVO', quantidadePrevista: 10, quantidadeRealizada: 15 })).toBe(100);
    expect(calcularFisico({ tipo: 'RECORRENTE', ocorrenciasPrevistas: 4, ocorrenciasConcluidas: 1 })).toBe(25);
    expect(calcularFisico({ tipo: 'UNICO', percentualManual: 35 })).toBe(35);
    expect(calcularFisico({ tipo: 'MARCO', dataEfetivaMarco: '2026-11-01' })).toBe(100);
    expect(calcularFisico({ tipo: 'MARCO' })).toBe(0);
  });
});

test('ponderação parcial usa denominador 100 sem normalizar', () => {
  expect(agregarFisico([{percentual:100,peso:'20'}])).toMatchObject({avancoPonderado:20,pesosValidos:false,somaPesos:20});
  expect(agregarFisico([{percentual:50,peso:'20'},{percentual:null,peso:null}]).avancoPonderado).toBe(10);
  expect(agregarFisico([{percentual:100,peso:'101'}]).avancoPonderado).toBeNull();
  expect(agregarFisico([{percentual:null,peso:'20'}]).avancoPonderado).toBeNull();
});


test('EC-01: excesso físico limita o percentual, sem arredondar a medição de origem', () => {
  const entrada = { tipo: 'QUANTITATIVO' as const, quantidadePrevista: 20, quantidadeRealizada: 20.125 };
  expect(calcularFisico(entrada)).toBe(100);
  expect(entrada.quantidadeRealizada).toBe(20.125);
  expect(calcularFisico({ ...entrada, quantidadeRealizada: 0.125 })).toBe(0.625);
});

test('tipos de entregável não convertem ausência ou dados inválidos em execução inventada', () => {
  expect(calcularFisico({ tipo: 'UNICO' })).toBe(0);
  expect(calcularFisico({ tipo: 'UNICO', percentualManual: 101 })).toBeNull();
  expect(calcularFisico({ tipo: 'CONTINUO', percentualManual: 37.5 })).toBeNull();
  expect(calcularFisico({ tipo: 'CONTINUO', percentualManual: -1 })).toBeNull();
  expect(calcularFisico({ tipo: 'QUANTITATIVO', quantidadePrevista: 0, quantidadeRealizada: 1 })).toBeNull();
  expect(calcularFisico({ tipo: 'RECORRENTE', ocorrenciasPrevistas: 12, ocorrenciasConcluidas: 3 })).toBe(25);
  expect(calcularFisico({ tipo: 'MARCO', dataEfetivaMarco: null })).toBe(0);
});

test('pesos decimais e parcela não distribuída preservam a base contratual de 100%', () => {
  expect(agregarFisico([{ percentual: 100, peso: '33.3333' }, { percentual: 50, peso: '66.6667' }])).toEqual({ pesosValidos: true, somaPesos: 100, avancoSimples: 75, avancoPonderado: 66.67 });
  expect(agregarFisico([{ percentual: 100, peso: '20' }, { percentual: 0, peso: null }])).toEqual({ pesosValidos: false, somaPesos: 20, avancoSimples: 50, avancoPonderado: 20 });
});

test('B10: arredondamento nunca antecipa a execução integral', () => {
  expect(agregarFisico([{percentual:99.9999,peso:'100'}])).toMatchObject({avancoSimples:99.99,avancoPonderado:99.99});
  expect(agregarFisico([{percentual:100,peso:'99.9999'}])).toMatchObject({avancoSimples:100,avancoPonderado:99.99,pesosValidos:false});
  expect(agregarFisico([{percentual:100,peso:'99.9999'},{percentual:0,peso:'0.0001'}]).avancoPonderado).toBe(99.99);
  expect(agregarFisico([{percentual:100,peso:'33.3333'},{percentual:100,peso:'66.6667'}]).avancoPonderado).toBe(100);
  expect(agregarFisico([{percentual:100,peso:'100'},{percentual:NaN,peso:'0'}])).toMatchObject({avancoSimples:null,avancoPonderado:100});
});
