import {dataAcompanhamentoValida,resumirAcompanhamento,envioAtrasadoContinuo,fimPeriodoContinuo,indicadoresPrazoContinuo,type RegistroContinuo} from './acompanhamento-continuo.js';
const inicio='2026-11-01',fim='2026-11-30';
const registro=(id:string,status:string,apto=false,extra:Partial<RegistroContinuo>={}):RegistroContinuo=>({id,tipo:'ATIVIDADE',data:'2026-11-26',status,apto,...extra});
describe('Contínuo: acompanhamento por registros, não por obrigações diárias',()=>{
 test('vigência sem registro é válida para solicitar ao atingir o término, mas não atribui avanço',()=>{
  const antes=resumirAcompanhamento(inicio,fim,[],'2026-11-29',null);expect([antes.apto,antes.percentualOficial,antes.total]).toEqual([false,0,0]);
  const r=resumirAcompanhamento(inicio,fim,[],fim,null);expect([r.apto,r.percentualOficial,r.prazo,r.total,r.diasRegistrados]).toEqual([true,0,100,0,[]]);
 });
 test('prazo independe do cumprimento; dias sem registros não geram atraso',()=>{
  const r=resumirAcompanhamento(inicio,fim,[],'2026-11-26',null);expect([r.prazo,r.transcorridos,r.dias,r.diasRegistrados]).toEqual([86.67,26,30,[]]);
 });
 test('contagens são exclusivas e deduplicadas por tipo e id, não porcentagem física',()=>{
  const a=registro('a','VERIFICADA',true),b=registro('b','PENDENTE_CONCLUSAO'),c=registro('c','EM_ANDAMENTO');
  const r=resumirAcompanhamento(inicio,fim,[a,a,b,c],'2026-11-26',null);expect([r.concluidos,r.pendentes,r.emExecucao,r.total,r.percentualOficial]).toEqual([1,1,1,3,0]);expect(r.diasRegistrados[0].estado).toBe('PENDENTE');
 });
 test('atraso decorre de registro realmente atrasado',()=>{
  const r=resumirAcompanhamento(inicio,fim,[registro('x','EM_ANDAMENTO',false,{tipo:'OCORRENCIA',enviadoEm:'2026-11-27'})],fim,null);expect([r.diasRegistrados[0].estado,r.apto]).toEqual(['ATRASADO',false]);
 });
 test('pendência documental não impede reconhecimento físico, aprovação continua necessária',()=>{
  const e=registro('e','SEM_ENVIO',false,{tipo:'EVIDENCIA'});const r=resumirAcompanhamento(inicio,fim,[e],fim,'PENDENTE_CONCLUSAO_PARCIAL');expect([r.apto,r.percentualOficial,r.pendentes]).toEqual([true,0,1]);
  expect(resumirAcompanhamento(inicio,fim,[e],fim,'CONCLUIDO_PARCIALMENTE').percentualOficial).toBe(100);
 });
 test('pendência operacional impede conclusão mesmo no último dia',()=>{
  expect(resumirAcompanhamento(inicio,fim,[registro('a','EM_ANDAMENTO')],fim,null).apto).toBe(false);
 });
 test('aprovação integral reconhece 100%; reabertura restaura o avanço operacional anterior',()=>{
  expect(resumirAcompanhamento(inicio,fim,[],fim,'CONCLUIDO',40).percentualOficial).toBe(100);
  expect(resumirAcompanhamento(inicio,fim,[],fim,'EM_REVISAO',40).percentualOficial).toBe(40);
 });
 test('data obrigatória, civil válida e dentro da vigência',()=>{
  expect(dataAcompanhamentoValida('2026-02-30','2026-01-01',fim)).toBe(false);expect(dataAcompanhamentoValida('2026-12-01',inicio,fim)).toBe(false);expect(dataAcompanhamentoValida(fim,inicio,fim)).toBe(true);
  expect(resumirAcompanhamento(inicio,fim,[registro('x','VERIFICADA',true,{data:''})],fim,null).apto).toBe(false);
 });
 test('vigência longa não cria milhares de obrigações nem dias artificiais',()=>{
  const r=resumirAcompanhamento('2026-01-01','2030-12-31',[],'2028-02-29',null);expect([r.dias,r.total,r.diasRegistrados]).toEqual([1826,0,[]]);
 });
 test('arquivados não entram no acompanhamento',()=>{
  expect(resumirAcompanhamento(inicio,fim,[registro('a','ARQUIVADA')],fim,null).total).toBe(0);
 });
});

describe('Atraso de envio do Contínuo',()=>{
 test('fechar depois do término sem registros não gera atraso',()=>{
  const r=resumirAcompanhamento(inicio,fim,[],'2026-12-01','CONCLUIDO');
  expect(indicadoresPrazoContinuo('CONCLUIDO',false,false,r.temAtrasos)).toEqual({atrasado:false,finalizadoComAtraso:false});
 });
 test('envio posterior ao dia de referência permanece vermelho após verificação',()=>{
  const r=resumirAcompanhamento(inicio,fim,[registro('e','VERIFICADA',true,{tipo:'EVIDENCIA',data:'2026-11-25',enviadoEm:'2026-11-30'})], '2026-12-01','CONCLUIDO');
  expect(r.diasRegistrados[0].estado).toBe('ATRASADO');expect(r.concluidos).toBe(1);
  expect(r.registrosAtrasados).toEqual([{id:'e',tipo:'EVIDENCIA',data:'2026-11-25',prazo:'2026-11-25',enviadoEm:'2026-11-30'}]);
  expect(indicadoresPrazoContinuo('CONCLUIDO',false,false,r.temAtrasos)).toEqual({atrasado:false,finalizadoComAtraso:true});
 });
 test('semana de domingo a sábado: envio dia 28 é pontual, dia 30 é tardio',()=>{
  expect(fimPeriodoContinuo('2026-11-25',inicio,fim,'SEMANAL')).toBe('2026-11-28');
  expect(envioAtrasadoContinuo('2026-11-25','2026-11-28',inicio,fim,'SEMANAL')).toBe(false);
  expect(envioAtrasadoContinuo('2026-11-25','2026-11-30',inicio,fim,'SEMANAL')).toBe(true);
 });
 test('mês: último dia e limites da vigência',()=>{
  expect(fimPeriodoContinuo('2026-11-25',inicio,fim,'MENSAL')).toBe(fim);
  expect(envioAtrasadoContinuo('2026-11-25','2026-11-30',inicio,fim,'MENSAL')).toBe(false);
  expect(envioAtrasadoContinuo('2026-11-25','2026-12-01',inicio,fim,'MENSAL')).toBe(true);
  expect(fimPeriodoContinuo('2026-11-25',inicio,'2026-11-26','SEMANAL')).toBe('2026-11-26');
  expect(fimPeriodoContinuo('2028-02-20','2028-02-01','2028-03-01','MENSAL')).toBe('2028-02-29');
 });
 test('sem envio não é atraso, mesmo após a vigência',()=>{
  const r=resumirAcompanhamento(inicio,fim,[registro('e','SEM_ENVIO',false,{tipo:'EVIDENCIA',enviadoEm:null})],'2026-12-01',null);
  expect(r.temAtrasos).toBe(false);expect(r.diasRegistrados[0].estado).toBe('PENDENTE');
 });
 test('entregável aberto, em revisão ou arquivado não recebe tag histórica de conclusão',()=>{
  expect(indicadoresPrazoContinuo('EM_ANDAMENTO',false,false,true)).toEqual({atrasado:false,finalizadoComAtraso:false});
  expect(indicadoresPrazoContinuo('CONCLUIDO',false,true,true).finalizadoComAtraso).toBe(false);
  expect(indicadoresPrazoContinuo('CONCLUIDO',true,false,true).finalizadoComAtraso).toBe(false);
 });
});
