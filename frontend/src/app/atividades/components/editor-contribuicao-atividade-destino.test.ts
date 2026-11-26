import {modoContribuicaoAtividade,resumoDireto,resumoOcorrencia,temOcorrenciaVinculada} from './editor-contribuicao-atividade-destino';
import type {Entregavel} from '@/lib/entregaveis';
import type {Ocorrencia} from '@/hooks/use-ocorrencias';
const item=(tipo:Entregavel['tipo'])=>({id:'e',tipo,quantidadePrevista:'10',quantidadeRealizada:'0'} as Entregavel);
const o=(id:string,modoRegistro:Ocorrencia['modoRegistro'],entregavelId='e')=>({id,entregavelId,modoRegistro,status:'EM_ANDAMENTO',metaQuantidade:'10'} as Ocorrencia);
test('somente a ocorrência vinculada do próprio entregável desloca a contribuição',()=>{
 const agenda=[o('a','QUANTITATIVO'),o('b','DESCRITIVO','outro')];
 expect(temOcorrenciaVinculada('e',agenda,['b'])).toBe(false);
 expect(temOcorrenciaVinculada('e',agenda,['a'])).toBe(true);
 expect(modoContribuicaoAtividade(item('QUANTITATIVO'),undefined,agenda,true,true,true)).toBeUndefined();
 expect(modoContribuicaoAtividade(item('QUANTITATIVO'),agenda[0],agenda,true,true,true)).toBe('quantidade');
 expect(modoContribuicaoAtividade(item('QUANTITATIVO'),agenda[1],agenda,true,true,true)).toBeUndefined();
});
test('preserva execução direta e percentual por ocorrência conforme modalidade',()=>{
 expect(modoContribuicaoAtividade(item('UNICO'),undefined,[],true,true,false)).toBe('percentual');
 expect(modoContribuicaoAtividade(item('CONTINUO'),undefined,[],true,true,false)).toBe('percentual');
 expect(modoContribuicaoAtividade(item('QUANTITATIVO'),undefined,[],true,true,false)).toBe('quantidade');
 const periodo=o('a','DESCRITIVO');
 expect(modoContribuicaoAtividade(item('RECORRENTE'),periodo,[periodo],true,true,false)).toBe('percentual');
 expect(modoContribuicaoAtividade(item('RECORRENTE'),periodo,[periodo],true,false,true)).toBeUndefined();
 expect(modoContribuicaoAtividade(item('MARCO'),undefined,[],true,true,true)).toBeUndefined();
});
test('o valor de uma ocorrência não é repetido no cartão do entregável',()=>{
 const parcelas=[{entregavelId:'e',ocorrenciaId:'a',percentual:'20'}];
 expect(resumoDireto('e','unidades',[],parcelas)).toBe('');
 expect(resumoOcorrencia('a','unidades',[],parcelas)).toBe('20%');
 expect(resumoOcorrencia('b','unidades',[],parcelas)).toBe('');
});
