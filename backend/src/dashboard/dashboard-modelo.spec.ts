import { describe, expect, it } from '@jest/globals';
import { projetarContrato, resumirCarteira, type Progresso, type Documental } from './dashboard-modelo.js';
import type { Contrato } from '../contratos/contrato.entity.js';
import type { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { StatusContrato } from '../contratos/status-contrato.enum.js';
import { StatusOcorrencia } from '../ocorrencias/status-ocorrencia.enum.js';
import { StatusExecucaoEntregavel } from '../entregaveis/status-execucao-entregavel.enum.js';
const hoje='2026-11-25';
const contrato={id:'a',codigoPublico:'00001',numeroContrato:'A',orgaoContratante:'Órgão',objeto:'Objeto',status:StatusContrato.EM_EXECUCAO,inicioVigencia:'2026-01-01',terminoVigencia:'2026-12-01',arquivadoEm:null,reabertoEm:null} as Contrato;
const item={entregavelId:'e',nome:'Entrega',tipo:'UNICO',statusEntregavel:StatusExecucaoEntregavel.EM_ANDAMENTO,terminoPrevisto:'2026-11-24',percentualExecucao:100,atrasado:true} as unknown as Progresso['entregaveis'][number];
const vazio={avanco:null,configuracaoPendente:false,entregaveis:[]} as unknown as Progresso;
const doc:Documental={e:{obrigatorias:2,verificadas:1,total:2,verificadasTotal:1,ocorrenciasExigidas:0,ocorrenciasAtendidas:0,situacaoComprovacao:'EVIDENCIA_PARCIAL',ocorrenciasTotal:0,ocorrenciasFinalizadas:0,atividadesTotal:0,atividadesVerificadas:0,exigenciasDocumentaisTotal:2,exigenciasDocumentaisAtendidas:1}};
const atividades={total:0,verificadas:0};
const projetar=(p:Progresso=vazio,d:Documental={},c:Contrato=contrato,os:Ocorrencia[]=[],dias=7)=>projetarContrato(c,p,d,[],os,atividades,hoje,dias);
describe('HU11 — projeção do dashboard',()=>{
  it('não inventa 0% sem base',()=>{const l=projetar();expect(l.avanco).toBeNull();expect(resumirCarteira([l],7)).toMatchObject({ativos:1,avanco:null,baseAvanco:0});});
  it('separa execução física integral de comprovação parcial e não altera status',()=>{const l=projetar({...vazio,avanco:100,entregaveis:[item]},doc);expect(l.avanco).toBe(100);expect(l.comprovacao).toEqual({feitas:1,total:2});expect(l.contrato.status).toBe(StatusContrato.EM_EXECUCAO);expect(l.alertas.map(a=>a.tipo)).toEqual(expect.arrayContaining(['ATRASO','COMPROVACAO_INCOMPLETA','ENCERRAMENTO_PROXIMO']));});
  it('preserva ausência de comprovação como indisponível',()=>{expect(projetar({...vazio,entregaveis:[item]}).comprovacao).toBeNull();});
  it('não considera ocorrência de entregável excluído do progresso e ordena prazos',()=>{const os=[{id:'o2',entregavelId:'e',titulo:'Segunda',dataPrevista:'2026-11-29',status:StatusOcorrencia.NAO_INICIADO},{id:'o1',entregavelId:'e',titulo:'Primeira',dataPrevista:'2026-11-26',status:StatusOcorrencia.NAO_INICIADO},{id:'x',entregavelId:'estrangeiro',titulo:'Invisível',dataPrevista:'2026-11-25',status:StatusOcorrencia.NAO_INICIADO}] as Ocorrencia[];const l=projetar({...vazio,entregaveis:[item]},doc,contrato,os);expect(l.prazos.map(p=>p.id)).toEqual(['e','o1','o2']);expect(l.proxima?.id).toBe('o1');expect(l.proximas).toBe(2);});
  it('não trata prazo finalizado como atraso atual',()=>{const l=projetar({...vazio,entregaveis:[{...item,statusEntregavel:StatusExecucaoEntregavel.CONCLUIDO,atrasado:false}]},doc);expect(l.atrasos).toBe(0);expect(l.entregaveis.pendentes).toBe(0);expect(l.prazos[0].aberto).toBe(false);});
  it('limiar de proximidade é configurável',()=>{expect(projetar(vazio,{},contrato,[],3).alertas.some(a=>a.tipo==='ENCERRAMENTO_PROXIMO')).toBe(false);expect(projetar().alertas.some(a=>a.tipo==='ENCERRAMENTO_PROXIMO')).toBe(true);});
  it('não agrega cancelados, arquivados nem cálculos pendentes na média ativa',()=>{const p={...vazio,avanco:80,entregaveis:[{...item,percentualExecucao:80}]};const l=projetar(p);const c=projetar(p,{}, {...contrato,status:StatusContrato.CANCELADO});const a=projetar(p,{}, {...contrato,arquivadoEm:new Date()});const i=projetar({...p,configuracaoPendente:true});expect(resumirCarteira([l,c,a,i],7)).toMatchObject({ativos:2,avanco:80,baseAvanco:1});});
});

it('fim da vigência do Contínuo não constitui atraso administrativo no dashboard',()=>{
 const l=projetar({...vazio,entregaveis:[{...item,tipo:'CONTINUO',atrasado:false}]},doc);
 expect(l.prazos[0]).toMatchObject({aberto:true,atrasado:false});
 expect(l.alertas.some(a=>a.id==='e'&&['ATRASO','PRAZO_PROXIMO'].includes(a.tipo))).toBe(false);
 expect(l.atrasos).toBe(0);
});
