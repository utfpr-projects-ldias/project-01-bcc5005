import { jest } from '@jest/globals';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { OcorrenciasService, correcaoQuantidadePermitida, projetarHistoricoOcorrencia } from './ocorrencias.service.js';
import { resumoMedicao, quantidadeLegadaParaDecisao, medicaoLegadaReconhecida } from './medicao-ocorrencia.js';

const ator={id:'admin',perfil:PerfilUsuario.ADMINISTRADOR,supertokensUserId:'identidade',email:'qa@example.invalid'};
const o=(dados:Partial<Ocorrencia>={})=>Object.assign(new Ocorrencia(),{id:'oc',contratoId:'ct',entregavelId:'en',modoRegistro:'QUANTITATIVO',status:StatusOcorrencia.EM_ANDAMENTO,
  metaQuantidade:'999999999999999.999',minimoAtividadesVerificadas:0,minimoEvidenciasVerificadas:0,evidenciaExigida:'NENHUMA',...dados});
function medicao(manual:string,registrada:string,preliminares='0',pendencias='0') {
  return {query:jest.fn(async(sql:string)=>sql.includes('FROM ocorrencia_lancamentos')?[{total:manual,registrada}]:sql.includes('FROM atividades a')?
    [{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}]:[{total:'0',fotos:'0',relatorios:'0',preliminares,revisao_quantidade:pendencias}])} as unknown as EntityManager;
}
function retry(ativo=true){
  const query=jest.fn(async()=>[{autor:ator.id,pedido:{quantidade:'2.000',justificativa:null,data:'2026-01-01',observacao:null},excluidoEm:null,quantidade:'3.000'}]);
  const findOne=jest.fn();
  const m={getRepository:(tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo})}:null,query,findOne};
  const ds={transaction:(fn:(manager:unknown)=>Promise<unknown>)=>fn(m)};
  const service=new OcorrenciasService({} as never,{} as never,ds as never,{} as never,{} as never);
  return {service,query,findOne};
}
describe('B07 — reconhecimento e integridade de lançamentos',()=>{
  it('distingue um milésimo ainda não reconhecido de saldo já reservado',async()=>{
    const r=await resumoMedicao(medicao('999999999999999.998','999999999999999.999'),o());
    expect(r.quantidadeExecutadaExata).toBe('999999999999999.998');
    expect(r.quantidadeDisponivelExata).toBe('0.000');
    expect(r.metaAtingida).toBe(false);
    expect(r.progressoPercentual).toBeLessThan(100);
  });
  it('não encerra uma ocorrência com contribuição preliminar ou referência ainda não decidida',async()=>{
    for(const m of [medicao('10','10','1'),medicao('10','10','0','1')]){
      const r=await resumoMedicao(m,o({metaQuantidade:'10'}));
      expect(r.metaAtingida).toBe(true);
      expect(r.registrosExecucaoPendentes).toBe(true);
      expect(r.criteriosOperacionaisAtendidos).toBe(false);
    }
  });
  it('preserva a declaração quantitativa legada para decisão, sem contar antecipadamente',async()=>{
    const antiga=o({metaQuantidade:null,quantidadeRealizada:'3.125'});
    const r=await resumoMedicao(medicao('0','0'),antiga);
    expect(r.metaAtingida).toBe(true);
    expect(medicaoLegadaReconhecida(antiga)).toBe('0.000');
    expect(quantidadeLegadaParaDecisao(antiga,r)).toBe('3.125');
  });
  it('permite reduzir excedente legado mas nunca aumentar ou manter o excesso',()=>{
    expect(correcaoQuantidadePermitida(12000n,11000n,10000n)).toBe(true);
    expect(correcaoQuantidadePermitida(12000n,12000n,10000n)).toBe(false);
    expect(correcaoQuantidadePermitida(12000n,13000n,10000n)).toBe(false);
    expect(correcaoQuantidadePermitida(12000n,10000n,10000n)).toBe(true);
  });
  it('reconhece o pedido original mesmo após correção, antes de bloquear por estado do contrato',async()=>{
    const {service,findOne}=retry();
    expect(await service.registrarLancamento('ct','oc','id','2',undefined,ator,'2026-01-01')).toMatchObject({id:'id',repetido:true});
    expect(findOne).not.toHaveBeenCalled();
    await expect(service.registrarLancamento('ct','oc','id','3',undefined,ator,'2026-01-01')).rejects.toBeInstanceOf(ConflictException);
  });
  it('não autoriza sequer um reenvio se a identidade foi desativada',async()=>{
    const {service,query}=retry(false);
    await expect(service.registrarLancamento('ct','oc','id','2',undefined,ator,'2026-01-01')).rejects.toBeInstanceOf(ForbiddenException);
    expect(query).not.toHaveBeenCalled();
  });
  it('inclui decisão e justificativa no histórico sem expor identificador interno',()=>{
    expect(projetarHistoricoOcorrencia({status:'ENCERRADA',motivoEncerramento:'Motivo original',encerradaEm:'2026-01-01T10:00:00Z',encerradaPor:'id-interno'})).toEqual({status:'ENCERRADA',motivoEncerramento:'Motivo original',encerradaEm:'2026-01-01T10:00:00Z'});
  });
});


describe('Regularização — exclusão de lançamento', () => {
  function ambiente(bloqueado = false, dependente = false) {
    const ocorrencia = o({metaQuantidade:'10.000', execucoesPercentuais:false});
    const contrato = {id:'ct', status:'EM_EXECUCAO'};
    const entregavel = {id:'en', contratoId:'ct', etapaId:'et', tipo:'QUANTITATIVO', statusExecucao:'EM_ANDAMENTO'};
    const etapa = {id:'et', contratoId:'ct', status:'EM_ANDAMENTO'};
    let excluido = false;
    const query = jest.fn(async (sql:string) => {
      if (sql.includes('SELECT quantidade::text AS quantidade,bloqueado_em')) return [{quantidade:'2.000',bloqueadoEm:bloqueado?'2026-01-01':null}];
      if (sql.includes('SELECT EXISTS(')) return [{dependente}];
      if (sql.includes('UPDATE ocorrencia_lancamentos SET excluido_em')) { excluido=true; return []; }
      if (sql.includes('FROM ocorrencia_lancamentos')) return [{total:excluido?'3.000':'5.000',registrada:excluido?'3.000':'5.000'}];
      if (sql.includes('FROM atividades a')) return [{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}];
      return [{total:'0',fotos:'0',relatorios:'0'}];
    });
    const buscar = async (tipo:unknown) => tipo===Contrato?contrato:tipo===Ocorrencia?ocorrencia:tipo===Entregavel?entregavel:tipo===Etapa?etapa:null;
    const m = {getRepository:(tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo:true})}:null,query,findOne:buscar,findOneBy:buscar};
    const ds = {transaction:(fn:(manager:unknown)=>Promise<unknown>)=>fn(m)};
    const auditoria = {registrarNaTransacao:jest.fn(async()=>undefined)};
    const service = new OcorrenciasService({} as never,{} as never,ds as never,auditoria as never,{} as never);
    return {service,query,auditoria};
  }
  const excluir = (service:OcorrenciasService) => service.excluirLancamento('ct','oc','lancamento','Corrigir lançamento duplicado.',ator);
  it('exclui o lançamento sem exigir uma versão inexistente e recalcula o progresso', async()=>{
    const {service,query,auditoria}=ambiente();
    await expect(excluir(service)).resolves.toEqual({id:'lancamento',excluido:true,quantidadeExecutada:3});
    expect(query).toHaveBeenCalledWith(expect.stringContaining('SET excluido_em=now()'),expect.arrayContaining(['lancamento','ct','oc']));
    expect(auditoria.registrarNaTransacao).toHaveBeenCalled();
  });
  it.each([[true,false],[false,true]])('preserva bloqueio e referências verificadas (%s, %s)',async(bloqueado,dependente)=>{
    const {service,query}=ambiente(bloqueado,dependente);
    await expect(excluir(service)).rejects.toBeInstanceOf(ConflictException);
    expect(query.mock.calls.some(([sql])=>sql.includes('SET excluido_em=now()'))).toBe(false);
  });
});
