import { montarArvoreMeta, type RegistroArvoreMeta } from './arvore-registros-meta.js';
const o:RegistroArvoreMeta={id:'vo',tipo:'OCORRENCIA',registroId:'o',paiId:null,direto:true,versaoVinculadaAtual:true};
const a:RegistroArvoreMeta={id:'va',tipo:'ATIVIDADE',registroId:'a',paiId:null,direto:true,versaoVinculadaAtual:true};
describe('Árvore de registros da meta',()=>{
 it('mantém ocorrência, atividade e evidência numa árvore sem duplicar a prova',()=>{
  const r=montarArvoreMeta([o],[
   {tipo:'ATIVIDADE',registro_id:'a',pai_tipo:'OCORRENCIA',pai_registro_id:'o',atual:true},
   {tipo:'EVIDENCIA',registro_id:'e',pai_tipo:'OCORRENCIA',pai_registro_id:'o',atual:false},
   {tipo:'EVIDENCIA',registro_id:'e',pai_tipo:'ATIVIDADE',pai_registro_id:'a',atual:true},
  ]);
  expect(r.map(x=>[x.registroId,x.paiId,x.versaoVinculadaAtual])).toEqual([['o',null,true],['a','vo',true],['e','indireto:ATIVIDADE:a',true]]);
 });
 it('preserva o vínculo direto, sem uma segunda cópia como filho',()=>{
  expect(montarArvoreMeta([o,a],[{tipo:'ATIVIDADE',registro_id:'a',pai_tipo:'OCORRENCIA',pai_registro_id:'o',atual:true}])).toEqual([o,a]);
 });
 it('não adiciona registros de ramos sem pai na meta',()=>{
  expect(montarArvoreMeta([o],[{tipo:'EVIDENCIA',registro_id:'e',pai_tipo:'ATIVIDADE',pai_registro_id:'fora',atual:true}])).toEqual([o]);
 });
});
