import { agregarFisico, calcularFisico } from './motor-progresso.js';

describe('TEC09 — motor físico independente', () => {
  it('calcula 47,5 com pesos 20/30/50', () => {
    expect(agregarFisico([{ percentual: 100, peso: '20' }, { percentual: 50, peso: '30' }, { percentual: 25, peso: '50' }]).avancoPonderado).toBe(47.5);
  });
  it.each(['99', '101', null])('não ativa peso %s', peso => {
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
