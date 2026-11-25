import { identidadeEtapa } from './identidade-etapa';
import type { Etapa } from './etapas';
const e=(extra:Partial<Etapa>={})=>({status:'PLANEJADA',...extra} as Etapa);
test.each([
  [{},'nao-iniciado','planejamento'],
  [{status:'EM_ANDAMENTO'},'andamento','andamento'],
  [{reabertoEm:'2026-11-24'},'revisao','revisao'],
  [{conclusaoSolicitadaEm:'2026-11-24'},'pendente','pendente'],
  [{encerramentoSolicitadoEm:'2026-11-24'},'pendente','encerramento-pendente'],
  [{status:'CONCLUIDA'},'concluido','concluida'],
  [{status:'CONCLUIDO_PARCIALMENTE'},'parcial','parcial'],
  [{status:'FINALIZADA'},'finalizado','encerrada'],
  [{status:'ENCERRADA'},'encerrado','encerrada'],
] as const)('identidade de etapa %o é %s', (extra,estado,icone)=>{
  expect(identidadeEtapa(e(extra as Partial<Etapa>))).toMatchObject({estado,icone});
});
test('pedido de regularização prevalece sobre conclusão parcial anterior',()=>{
  expect(identidadeEtapa(e({status:'CONCLUIDO_PARCIALMENTE',conclusaoSolicitadaEm:'2026-11-24'}))).toMatchObject({estado:'pendente',rotulo:'Pendente de conclusão'});
});
