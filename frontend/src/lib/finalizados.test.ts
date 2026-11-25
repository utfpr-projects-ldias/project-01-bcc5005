import { etiquetaFinalizacao, resultadoFinalizacao } from './finalizados';
import { STATUS } from './contratos';
import { STATUS_ETAPA } from './etapas';

describe('Finalizados distingue conclusão de encerramento sem fabricar 100%', () => {
  it.each([
    ['contrato', 'CONCLUIDO', 'concluido', 'Concluído'],
    ['contrato', 'FINALIZADO', 'encerrado', 'Encerrado'],
    ['contrato', 'ENCERRADO', 'encerrado', 'Encerrado'],
    ['etapa', 'CONCLUIDA', 'concluido', 'Concluída'],
    ['etapa', 'FINALIZADA', 'encerrado', 'Encerrada'],
    ['etapa', 'ENCERRADA', 'encerrado', 'Encerrada'],
    ['entregavel', 'CONCLUIDO', 'concluido', 'Concluído'],
    ['entregavel', 'FINALIZADO', 'encerrado', 'Encerrado'],
    ['ocorrencia', 'CONCLUIDO', 'concluido', 'Concluída'],
    ['ocorrencia', 'ENCERRADA', 'encerrado', 'Encerrada'],
    ['atividade', 'VERIFICADA', 'concluido', 'Verificada'],
    ['evidencia', 'VERIFICADA', 'concluido', 'Verificada'],
  ] as const)('reconhece %s / %s', (recurso, status, resultado, rotulo) => {
    expect(resultadoFinalizacao(recurso, status)).toBe(resultado);
    expect(etiquetaFinalizacao(recurso, status)).toBe(rotulo);
  });
  it.each([
    ['contrato','EM_EXECUCAO'], ['entregavel','PENDENTE_ENCERRAMENTO'],
    ['ocorrencia','PENDENTE_CONCLUSAO'], ['atividade','REGISTRADA'],
    ['atividade','ARQUIVADA'], ['evidencia','ARQUIVADA'],
  ] as const)('não promove %s %s a finalizado', (recurso, status) => {
    expect(resultadoFinalizacao(recurso, status)).toBeNull();
  });
});


test('as etiquetas do contrato e da etapa distinguem resultado, preservando enums', () => {
  expect(STATUS.CONCLUIDO).toBe('Concluído');
  expect(STATUS.FINALIZADO).toBe('Encerrado');
  expect(STATUS.ENCERRADO).toBe('Encerrado');
  expect(STATUS_ETAPA.CONCLUIDA).toBe('Concluída');
  expect(STATUS_ETAPA.FINALIZADA).toBe('Encerrada');
  expect(STATUS_ETAPA.ENCERRADA).toBe('Encerrada');
});
