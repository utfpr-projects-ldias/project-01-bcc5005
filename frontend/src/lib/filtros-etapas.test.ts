import { etapaNaAba, filtrosEtapas, type AbaEtapas } from './filtros-etapas';
import type { Etapa } from './etapas';
const base = { status: 'PLANEJADA', arquivadoEm: null } as Etapa;
const e = (dados: Partial<Etapa>) => ({...base,...dados});

test('todas as abas oferecem opções próprias', () => {
  for (const aba of Object.keys(filtrosEtapas) as AbaEtapas[]) expect(filtrosEtapas[aba].length).toBeGreaterThan(0);
});
test('filtra planejamento e andamento sem misturar solicitações', () => {
  expect(etapaNaAba(base,'todas','PLANEJADA')).toBe(true);
  expect(etapaNaAba(base,'todas','EM_ANDAMENTO')).toBe(false);
  expect(etapaNaAba(e({status:'EM_ANDAMENTO'}),'todas','EM_ANDAMENTO')).toBe(true);
  expect(etapaNaAba(e({conclusaoSolicitadaEm:'2026-11-25'}),'todas','PLANEJADA')).toBe(false);
});
test('revisão pertence exclusivamente à sua aba e usa a fase subjacente', () => {
  const revisao=e({reabertoEm:'2026-11-25',status:'EM_ANDAMENTO'});
  expect(etapaNaAba(revisao,'todas')).toBe(false);
  expect(etapaNaAba(revisao,'todas','EM_REVISAO')).toBe(false);
  expect(etapaNaAba(revisao,'todas','EM_ANDAMENTO')).toBe(false);
  expect(etapaNaAba(revisao,'revisao','EM_ANDAMENTO')).toBe(true);
  expect(etapaNaAba(revisao,'revisao','PLANEJADA')).toBe(false);
});
test('distingue pedidos integrais, parciais e de encerramento', () => {
  expect(etapaNaAba(e({conclusaoSolicitadaEm:'2026-11-25'}),'pendentes','PENDENTE_CONCLUSAO')).toBe(true);
  expect(etapaNaAba(e({conclusaoSolicitadaEm:'2026-11-25',conclusaoParcialSolicitada:true}),'pendentes','PENDENTE_CONCLUSAO_PARCIAL')).toBe(true);
  expect(etapaNaAba(e({encerramentoSolicitadoEm:'2026-11-25'}),'pendentes','PENDENTE_ENCERRAMENTO')).toBe(true);
});
test('finalizadas e arquivadas respeitam o tipo escolhido', () => {
  expect(etapaNaAba(e({status:'FINALIZADA'}),'concluidas','FINALIZADA')).toBe(true);
  expect(etapaNaAba(e({status:'ENCERRADA'}),'concluidas','FINALIZADA')).toBe(false);
  const arquivada=e({status:'EM_ANDAMENTO',arquivadoEm:'2026-11-25'});
  expect(etapaNaAba(arquivada,'arquivadas','EM_ANDAMENTO')).toBe(true);
  expect(etapaNaAba(arquivada,'todas','EM_ANDAMENTO')).toBe(false);
});
