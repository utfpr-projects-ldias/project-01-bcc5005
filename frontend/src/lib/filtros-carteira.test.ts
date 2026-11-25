import { correspondeBuscaCarteira, correspondeStatusCarteira, filtroCompativel, opcoesStatusCarteira } from './filtros-carteira';
import { situacaoVisivelContrato, estadoContextualContrato } from './estado-visivel-contrato';
import type { Contrato } from './contratos';
const base = (extra:Partial<Contrato>={}) => ({status:'PLANEJAMENTO',numeroContrato:'QA-001',codigoPublico:'0042',objeto:'Instalação de computadores',orgaoContratante:'UTFPR',conclusaoSolicitadaEm:null,...extra} as Contrato);
test('fases, revisão e estados terminais não se misturam',()=>{
  expect(opcoesStatusCarteira('ativos').map(o=>o.valor)).toEqual(['PLANEJAMENTO','EM_EXECUCAO']);
  expect(opcoesStatusCarteira('concluidos').map(o=>o.valor)).toEqual(['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADO']);
  const revisao=base({reabertoEm:'2026-11-24'});
  expect(correspondeStatusCarteira(revisao,'PLANEJAMENTO')).toBe(true);
  expect(correspondeStatusCarteira(revisao,'EM_EXECUCAO')).toBe(false);
  expect(filtroCompativel('revisao','REVISAO:PLANEJAMENTO')).toBe('PLANEJAMENTO');
  expect(filtroCompativel('ativos','CONCLUIDO')).toBe('');
  expect(filtroCompativel('ativos','PLANEJAMENTO')).toBe('PLANEJAMENTO');
  expect(filtroCompativel('ativos','EM_ENCERRAMENTO')).toBe('');
  expect(correspondeStatusCarteira(base({status:'EM_ENCERRAMENTO'}),'EM_EXECUCAO')).toBe(true);
});
test('pesquisa por identificação, código, objeto e órgão é insensível à caixa',()=>{
  expect(correspondeBuscaCarteira(base(),'qa-001','todos')).toBe(true);
  expect(correspondeBuscaCarteira(base(),'#0042','codigo')).toBe(true);
  expect(correspondeBuscaCarteira(base(),'COMPUTADORES','todos')).toBe(true);
  expect(correspondeBuscaCarteira(base(),'utfpr','orgao')).toBe(true);
  expect(correspondeBuscaCarteira(base(),'não existe','todos')).toBe(false);
});
test('solicitação parcial real não desaparece por falta de aptidão remota',()=>{
  const c=base({conclusaoSolicitadaEm:'2026-11-24',conclusaoParcialSolicitada:true});
  expect(situacaoVisivelContrato(c,false)).toBe('pendentes');
  expect(estadoContextualContrato(c)).toBe('pendente');
  expect(correspondeStatusCarteira(c,'PENDENTE_CONCLUSAO_PARCIAL')).toBe(true);
  expect(correspondeStatusCarteira(c,'PENDENTE_CONCLUSAO')).toBe(false);
  expect(correspondeStatusCarteira(c,'PLANEJAMENTO')).toBe(false);
  expect(situacaoVisivelContrato(base(),true)).toBe('ativos');
});
test('dois estados administrativos agrupam-se sem alterar a execução e parcial conserva identidade',()=>{
  for(const status of ['FINALIZADO','ENCERRADO'] as const) expect(correspondeStatusCarteira(base({status}),'ENCERRADO')).toBe(true);
  expect(correspondeStatusCarteira(base({status:'CONCLUIDO_PARCIALMENTE'}),'CONCLUIDO')).toBe(false);
  expect(estadoContextualContrato(base({status:'CONCLUIDO_PARCIALMENTE'}))).toBe('parcial');
  expect(situacaoVisivelContrato(base({status:'EM_ENCERRAMENTO'}),false)).toBe('ativos');
});

test('R51: Todos filtra fases ativas e em revisão; solicitações e finais têm abas próprias', () => {
  expect(opcoesStatusCarteira('todos').map(o => o.valor)).toEqual(['PLANEJAMENTO','EM_EXECUCAO','PENDENTE_ENCERRAMENTO','SUSPENSO','CANCELADO']);
  expect(opcoesStatusCarteira('revisao')).toEqual(opcoesStatusCarteira('ativos'));
  for (const status of ['PLANEJAMENTO','EM_EXECUCAO'] as const) {
    expect(correspondeStatusCarteira(base({status}),status)).toBe(true);
    expect(correspondeStatusCarteira(base({status,reabertoEm:'2026-11-24'}),status)).toBe(true);
    expect(correspondeStatusCarteira(base({status,conclusaoSolicitadaEm:'2026-11-24'}),status)).toBe(false);
  }
  expect(filtroCompativel('todos','PENDENTE_CONCLUSAO')).toBe('');
  expect(filtroCompativel('todos','CONCLUIDO')).toBe('');
  expect(opcoesStatusCarteira('pendentes').map(o=>o.valor)).toEqual(['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO']);
});

test('encerramento solicitado fica entre os pendentes, sem misturar com conclusão ou fase preparatória',()=>{
  const c=base({status:'EM_EXECUCAO',conclusaoSolicitadaEm:'2026-11-24',encerramentoSolicitado:true});
  expect(situacaoVisivelContrato(c,false)).toBe('pendentes');
  expect(estadoContextualContrato(c)).toBe('pendente');
  expect(correspondeStatusCarteira(c,'PENDENTE_ENCERRAMENTO')).toBe(true);
  expect(correspondeStatusCarteira(c,'PENDENTE_CONCLUSAO')).toBe(false);
  expect(correspondeStatusCarteira(c,'PENDENTE_CONCLUSAO_PARCIAL')).toBe(false);
  expect(correspondeStatusCarteira(c,'EM_ENCERRAMENTO')).toBe(false);
  expect(correspondeStatusCarteira(base({status:'EM_ENCERRAMENTO'}),'PENDENTE_ENCERRAMENTO')).toBe(false);
  expect(correspondeStatusCarteira(base({status:'ENCERRADO'}),'ENCERRADO')).toBe(true);
});
