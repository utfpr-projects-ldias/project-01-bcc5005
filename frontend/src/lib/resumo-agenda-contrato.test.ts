import { compararAgenda, contadoresOcorrencia, comprovacaoOcorrencia, dataOrdemAgenda } from './resumo-agenda-contrato';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
import type { Entregavel } from './entregaveis';
const o = (dados: Partial<Ocorrencia> = {}) => ({ id:'a', entregavelId:'e', ...dados } as Ocorrencia);
const e = (dados: Partial<Entregavel> = {}) => ({ id:'e', ...dados } as Entregavel);

test('cotas independentes e livres não reutilizam a mesma evidência', () => {
  expect(contadoresOcorrencia(o({minimoAtividadesVerificadas:2,atividadesVerificadas:1,minimoFotos:2,minimoRelatorios:1,minimoEvidenciasLivres:1,evidenciasFoto:3,evidenciasRelatorio:0,evidenciasOutras:0}))).toEqual({atividades:{total:2,feitas:1},evidencias:{total:4,feitas:3}});
});
test('AMBOS não fica completo com apenas fotografias', () => {
  expect(contadoresOcorrencia(o({evidenciaExigida:'AMBOS',evidenciasFoto:5,evidenciasRelatorio:0,evidenciasOutras:0})).evidencias).toEqual({total:2,feitas:1});
});
test('RELATORIO não conta fotos e requisito inexistente permanece zero', () => {
  expect(contadoresOcorrencia(o({evidenciaExigida:'RELATORIO',evidenciasFoto:3,evidenciasRelatorio:0,evidenciasOutras:0})).evidencias).toEqual({total:1,feitas:0});
  expect(contadoresOcorrencia(o()).atividades.total).toBe(0);
  expect(contadoresOcorrencia(o()).evidencias.total).toBe(0);
});
test('ordena pelo campo escolhido, com fallback de cadastro em data civil e desconhecidos no fim', () => {
  const a=o({id:'a',periodoInicio:'2026-11-19',periodoFim:'2026-11-30'});
  const b=o({id:'b',periodoInicio:'2026-11-23',periodoFim:'2026-11-24'});
  const semData=o({id:'c',entregavelId:'outro'});
  const mapa=new Map([['e',e()]]);
  expect([a,b,semData].sort((x,y)=>compararAgenda(x,y,mapa,'inicio',true)).map(x=>x.id)).toEqual(['b','a','c']);
  expect([a,b,semData].sort((x,y)=>compararAgenda(x,y,mapa,'termino',true)).map(x=>x.id)).toEqual(['a','b','c']);
  expect([a,b,semData].sort((x,y)=>compararAgenda(x,y,mapa,'inicio',false)).map(x=>x.id)).toEqual(['a','b','c']);
  expect(dataOrdemAgenda(o(),e({criadoEm:'2026-11-24T01:00:00Z'}),'inicio')).toBe('2026-11-23');
});

test('comprovação não confunde ausência de requisitos, execução e evidências verificadas', () => {
  expect(comprovacaoOcorrencia(o({progressoPercentual:100})).texto).toBe('—');
  const base={minimoFotos:1,minimoRelatorios:1,minimoEvidenciasLivres:1,evidenciasFoto:0,evidenciasRelatorio:0,evidenciasOutras:0};
  expect(comprovacaoOcorrencia(o(base))).toEqual({texto:'0/3',cor:'text-red-400'});
  expect(comprovacaoOcorrencia(o({...base,evidenciasFoto:2}))).toEqual({texto:'2/3',cor:'text-amber-400'});
  expect(comprovacaoOcorrencia(o({...base,evidenciasFoto:2,evidenciasRelatorio:1}))).toEqual({texto:'3/3',cor:'text-green-400'});
  expect(comprovacaoOcorrencia(o({...base,evidenciasFoto:2,evidenciasRelatorio:1,documentacaoAtendida:false})).cor).toBe('text-amber-400');
});


test('ordena avanço, data realizada e comprovantes efetivamente verificados, com ausência no fim',()=>{
  const a=o({id:'a',progressoPercentual:9,dataRealizada:'2026-11-25',evidenciasFoto:1,evidenciasRelatorio:1,evidenciasOutras:0});
  const b=o({id:'b',progressoPercentual:80,dataRealizada:'2026-11-23',evidenciasFoto:3,evidenciasRelatorio:1,evidenciasOutras:1});
  const c=o({id:'c'});
  const mapa=new Map<string,Entregavel>();
  expect([a,b,c].sort((x,y)=>compararAgenda(x,y,mapa,'avanco',true)).map(x=>x.id)).toEqual(['b','a','c']);
  expect([a,b,c].sort((x,y)=>compararAgenda(x,y,mapa,'avanco',false)).map(x=>x.id)).toEqual(['a','b','c']);
  expect([a,b,c].sort((x,y)=>compararAgenda(x,y,mapa,'realizado',true)).map(x=>x.id)).toEqual(['a','b','c']);
  expect([a,b,c].sort((x,y)=>compararAgenda(x,y,mapa,'comprovantes',true)).map(x=>x.id)).toEqual(['b','a','c']);
});
