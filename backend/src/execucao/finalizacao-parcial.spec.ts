import { agregarFisico, calcularFisico } from './motor-progresso.js';
import { StatusOcorrencia } from '../ocorrencias/status-ocorrencia.enum.js';
import { StatusExecucaoEntregavel } from '../entregaveis/status-execucao-entregavel.enum.js';
import { StatusContrato } from '../contratos/status-contrato.enum.js';

describe('REG HU09/TEC09 — concluir não é finalizar', () => {
  it('preserva 83,33% quando apenas 10 de 12 ocorrências estão concluídas', () => {
    const resultado = calcularFisico({ tipo: 'RECORRENTE', ocorrenciasPrevistas: 12, ocorrenciasConcluidas: 10 });
    expect(resultado).toBeCloseTo(83.333333, 4);
    expect(resultado).toBeLessThan(100);
    expect(agregarFisico([{ percentual: resultado!, peso: '100' }]).avancoSimples).toBe(83.33);
  });
  it('não equipara encerramento administrativo a conclusão integral', () => {
    expect(StatusOcorrencia.ENCERRADA).not.toEqual(StatusOcorrencia.CONCLUIDO);
    expect(StatusOcorrencia.PENDENTE_ENCERRAMENTO).not.toEqual(StatusOcorrencia.PENDENTE_CONCLUSAO);
    expect(StatusExecucaoEntregavel.FINALIZADO).not.toEqual(StatusExecucaoEntregavel.CONCLUIDO);
    expect(StatusContrato.FINALIZADO).not.toEqual(StatusContrato.CONCLUIDO);
  });
  it('não infere progresso de uma obrigação contínua pelo tempo decorrido', () => {
    expect(calcularFisico({ tipo: 'CONTINUO', percentualManual: null })).toBeNull();
    expect(calcularFisico({ tipo: 'MARCO', dataEfetivaMarco: null })).toBe(0);
  });
});
