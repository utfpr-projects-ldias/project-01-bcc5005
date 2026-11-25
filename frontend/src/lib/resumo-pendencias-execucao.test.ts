import { quantidadePendente } from './resumo-pendencias-execucao';
const base={id:'l1',origem:'MANUAL',ocorrenciaId:'o1',quantidade:'25',situacao:'PENDENTE',referenciaExecucao:null};
test('conta exclusivamente execuções independentes pendentes da série vigente',()=>{
 expect(quantidadePendente([base,base,{...base,id:'l2',situacao:'APROVADO'},{...base,id:'l3',referenciaExecucao:'manual:l1'},{...base,id:'l4',ocorrenciaId:'historica'},{...base,id:'l5',origem:'EVIDENCIA',quantidade:'10.5'}],new Set(['o1']))).toBe(35.5);
});
