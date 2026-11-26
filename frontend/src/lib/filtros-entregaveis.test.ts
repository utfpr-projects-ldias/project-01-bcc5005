import { abaDoEntregavel, filtrosEntregaveis, situacaoFiltroEntregavel } from './filtros-entregaveis';
import type { Entregavel } from './entregaveis';
const base = {statusExecucao:'NAO_INICIADO'} as Entregavel;
const e = (dados: Partial<Entregavel>) => ({...base,...dados});
test('ativos não duplicam registros em revisão, pendentes ou finalizados', () => {
  expect(abaDoEntregavel(base)).toBe('ativos');
  expect(abaDoEntregavel(e({reabertoEm:'2026-11-25',statusExecucao:'EM_ANDAMENTO'}))).toBe('revisao');
  expect(abaDoEntregavel(e({reabertoEm:'2026-11-25',statusExecucao:'PENDENTE_CONCLUSAO'}))).toBe('pendentes');
  expect(abaDoEntregavel(e({statusExecucao:'CONCLUIDO'}))).toBe('comprovados');
  expect(abaDoEntregavel(e({arquivadoEm:'2026-11-25',statusExecucao:'CONCLUIDO'}))).toBe('arquivados');
});
test('revisão e arquivo usam situação subjacente no filtro', () => {
  expect(situacaoFiltroEntregavel(e({reabertoEm:'2026-11-25',statusExecucao:'EM_ANDAMENTO'}))).toBe('Em andamento');
  expect(situacaoFiltroEntregavel(e({arquivadoEm:'2026-11-25',statusExecucao:'CONCLUIDO'}))).toBe('Concluído');
  expect(filtrosEntregaveis.revisao).toEqual(['Não iniciado','Em andamento']);
  expect(filtrosEntregaveis.ativos).not.toContain('Pendente de conclusão');
});
