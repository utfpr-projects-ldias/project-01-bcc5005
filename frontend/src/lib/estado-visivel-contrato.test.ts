import { faseEmRevisao, situacaoVisivelContrato } from './estado-visivel-contrato';
import type { Contrato } from './contratos';
const contrato = (mudancas: Partial<Contrato> = {}) => ({
  status: 'PLANEJAMENTO', arquivadoEm: null, reabertoEm: null, ...mudancas,
} as Contrato);

test('arquivado prevalece sobre reabertura, conclusão e resposta pendente em cache', () => {
  expect(situacaoVisivelContrato(contrato({ arquivadoEm: '2026-11-06', reabertoEm: '2026-11-06', status: 'CONCLUIDO' }), true)).toBe('arquivados');
});
test('reabertura mantém em revisão até fechamento explícito, mesmo com resposta pendente em cache', () => {
  expect(situacaoVisivelContrato(contrato({ reabertoEm: '2026-11-06' }), false)).toBe('revisao');
  expect(situacaoVisivelContrato(contrato({ reabertoEm: '2026-11-06' }), true)).toBe('revisao');
});
test('concluído prevalece sobre pendência em cache', () => {
  expect(situacaoVisivelContrato(contrato({ status: 'CONCLUIDO' }), true)).toBe('concluidos');
});
test('pendente apenas sem reabertura e com estado operacional elegível', () => {
  expect(situacaoVisivelContrato(contrato(), true)).toBe('pendentes');
  expect(situacaoVisivelContrato(contrato({ status: 'SUSPENSO' }), true)).toBe('suspensos');
  expect(situacaoVisivelContrato(contrato(), false)).toBe('ativos');
});

test('cancelado é situação própria, não se confunde com arquivado nem pendente', () => {
  expect(situacaoVisivelContrato(contrato({ status: 'CANCELADO' }), true)).toBe('cancelados');
  expect(situacaoVisivelContrato(contrato({ status: 'CANCELADO', arquivadoEm: '2026-11-07' }), true)).toBe('arquivados');
});

test('suspensão contratual prevalece sobre pendência de conclusão, sem ocultar arquivamento', () => {
  expect(situacaoVisivelContrato(contrato({ status: 'SUSPENSO' }), true)).toBe('suspensos');
  expect(situacaoVisivelContrato(contrato({ status: 'SUSPENSO', reabertoEm: '2026-11-08' }), true)).toBe('suspensos');
  expect(situacaoVisivelContrato(contrato({ status: 'SUSPENSO', arquivadoEm: '2026-11-07' }), true)).toBe('arquivados');
});


test('revisão preserva a fase operacional sem criar novos filtros ou status', () => {
  expect(faseEmRevisao('PLANEJAMENTO')).toBe('Planejamento');
  expect(faseEmRevisao('EM_EXECUCAO')).toBe('Em execução');
  expect(situacaoVisivelContrato(contrato({ status: 'PLANEJAMENTO', reabertoEm: '2026-11-08' }), false)).toBe('revisao');
  expect(situacaoVisivelContrato(contrato({ status: 'EM_EXECUCAO', reabertoEm: '2026-11-08' }), false)).toBe('revisao');
});
