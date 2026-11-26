import { destinosVinculadosEvidencia, registrosVinculadosEvidencia, totaisVinculosEvidencia, itensVinculosEvidencia } from './vinculos-evidencia';
import type { DetalheEvidencia, VinculoCompartilhado } from './comprovantes';
const local: DetalheEvidencia={id:'e1',contratoId:'c1',contrato:'001',entregavelId:'d1',entregavel:'Entrega 1',tipoEvidencia:'Foto',descricao:null,obrigatoria:false,status:'PENDENTE_VERIFICACAO',versoes:[],podeVerificar:false,vinculosAtuais:[]};
const destino:VinculoCompartilhado={contratoId:'c2',contrato:'002',entregavelId:'d2',entregavel:'Entrega 2',esperadaId:'e2',comprovanteId:'p2',status:'PENDENTE_VERIFICACAO',vigente:true,somenteDocumento:true,podeVerificar:true,vinculosAtuais:[{id:'o2',titulo:'Ocorrência remota',tipo:'ocorrencia'},{id:'a2',titulo:'Atividade remota',tipo:'atividade'}]};
test('uma origem sem vínculos locais ainda exibe todos os destinos e registros remotos',()=>{
 const dados={...local,compartilhamentos:[destino]};const ds=destinosVinculadosEvidencia(dados);
 expect(totaisVinculosEvidencia(ds)).toEqual({contratos:2,entregaveis:2,ocorrencias:1,atividades:1});
 expect(registrosVinculadosEvidencia(ds,'atividade')[0]).toMatchObject({id:'a2',contratoId:'c2'});
 expect(itensVinculosEvidencia(dados).map(i=>i.total)).toEqual([2,2,1,1]);
});
test('destino local duplicado, registro repetido e versão histórica não inflam contadores',()=>{
 const ds=destinosVinculadosEvidencia({...local,compartilhamentos:[destino,{...destino,entregavelId:'d3',entregavel:'Entrega 3',esperadaId:'e3',comprovanteId:'p3'},{...destino,contratoId:'c3',vigente:false},{...destino,contratoId:'c1',contrato:'001',entregavelId:'d1',esperadaId:'e1',vinculosAtuais:[]}]});
 expect(totaisVinculosEvidencia(ds)).toEqual({contratos:2,entregaveis:3,ocorrencias:1,atividades:1});
 expect(registrosVinculadosEvidencia(ds,'atividade')[0].destinos).toEqual(['Entrega 2','Entrega 3']);
});
test('reserva preliminar é consultável antes do envio e consulta incompleta não vira zero',()=>{
 const preliminar={contratoId:'c2',contrato:'002',entregavelId:'d2',entregavel:'Entrega 2',esperadaId:'e2',vinculosAtuais:destino.vinculosAtuais};
 expect(totaisVinculosEvidencia(destinosVinculadosEvidencia({...local,compartilhamentosPreliminares:[preliminar]}))).toEqual({contratos:2,entregaveis:2,ocorrencias:1,atividades:1});
 expect(totaisVinculosEvidencia(destinosVinculadosEvidencia({...local,compartilhamentos:[{...destino,vinculosAtuais:undefined}]}))).toEqual({contratos:2,entregaveis:2,ocorrencias:null,atividades:null});
});
