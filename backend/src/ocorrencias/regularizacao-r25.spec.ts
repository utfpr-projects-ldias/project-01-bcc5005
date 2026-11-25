import { Usuario } from '../usuarios/usuario.entity.js';
import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { distribuirPesosFuturos, planoDeRevisao, ReplanejamentoService } from './replanejamento.service.js';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';

const cid = '11111111-1111-4111-8111-111111111111';
const eid = '22222222-2222-4222-8222-222222222222';
const ator = { id: '33333333-3333-4333-8333-333333333333', perfil: 'ADMINISTRADOR' };
const dto = { inicioFuturo: '2026-11-23', terminoPrevisto: '2026-12-06', periodicidade: PeriodicidadeEntregavel.DIARIA };
const periodo = (id: string, inicio: string, fim: string, peso: string | null, status = StatusOcorrencia.NAO_INICIADO) =>
  ({ id, periodoInicio: inicio, periodoFim: fim, status, pesoPeriodo: peso, substituidaEm: null,
    quantidadeRealizada: null, quantidadeAprovada: null, dataRealizada: null } as Ocorrencia);

describe('R25 — replanejamento sem perda de execução ou pesos', () => {
  it('redistribui pesos de 2 semanas para 14 dias sem gerar 700%', () => {
    const agenda = [periodo('1','2026-11-23','2026-11-29','50.0000'),periodo('2','2026-11-30','2026-12-06','50.0000')];
    const plano = planoDeRevisao(agenda,new Set(),dto,'2026-11-22');
    const pesos = distribuirPesosFuturos(agenda,plano);
    expect(pesos).toHaveLength(14);
    expect(pesos.reduce((s,v)=>s+Math.round(Number(v)*10_000),0)).toBe(1_000_000);
    expect(pesos[0]).toBe('7.1429');
  });
  it('preserva peso concluído e divide apenas o saldo dos novos períodos', () => {
    const agenda = [periodo('antiga','2026-11-01','2026-11-22','25.0000',StatusOcorrencia.CONCLUIDO),
      periodo('futura','2026-11-23','2026-12-06','75.0000')];
    const plano = planoDeRevisao(agenda,new Set(),dto,'2026-11-22');
    const pesos=distribuirPesosFuturos(agenda,plano);
    expect(pesos).toHaveLength(14);
    expect(pesos.reduce((s,v)=>s+Math.round(Number(v)*10_000),0)).toBe(750_000);
    expect(agenda[0].pesoPeriodo).toBe('25.0000');
  });
  it('recusa pesos mistos ou soma inicial inválida', () => {
    const agenda = [periodo('1','2026-11-23','2026-11-29','50.0000'), periodo('2','2026-11-30','2026-12-06',null)];
    expect(() => distribuirPesosFuturos(agenda,planoDeRevisao(agenda,new Set(),dto,'2026-11-22'))).toThrow(ConflictException);
    agenda[1].pesoPeriodo='40.0000';
    expect(() => distribuirPesosFuturos(agenda,planoDeRevisao(agenda,new Set(),dto,'2026-11-22'))).toThrow(ConflictException);
  });
  it('recusa substituir período iniciado, medido ou vinculado mesmo se ainda não concluído', () => {
    const a=periodo('1','2026-11-23','2026-11-29',null);
    for (const execucao of [Object.assign({},a,{status:StatusOcorrencia.EM_ANDAMENTO}), Object.assign({},a,{quantidadeRealizada:'2'}), Object.assign({},a,{dataRealizada:'2026-11-24'})])
      expect(()=>planoDeRevisao([execucao],new Set(),{...dto,terminoPrevisto:'2026-11-29'},'2026-11-22')).toThrow(ConflictException);
    expect(()=>planoDeRevisao([a],new Set(['1']),{...dto,terminoPrevisto:'2026-11-29'},'2026-11-22')).toThrow(ConflictException);
  });
  it('recusa dividir uma conclusão histórica em semanas ou dias', () => {
    const concluida=periodo('c','2026-11-23','2026-11-29',null,StatusOcorrencia.CONCLUIDO);
    expect(()=>planoDeRevisao([concluida],new Set(),{...dto,terminoPrevisto:'2026-11-29'},'2026-11-22')).toThrow(ConflictException);
    expect(planoDeRevisao([concluida],new Set(),{inicioFuturo:'2026-11-23',terminoPrevisto:'2026-11-29',periodicidade:PeriodicidadeEntregavel.SEMANAL},'2026-11-22').novas).toHaveLength(0);
  });
});

function ambienteReplanejamento(comDependencia = false) {
  const contrato={id:cid,status:'EM_EXECUCAO',arquivadoEm:null,inicioVigencia:'2026-11-01',terminoVigencia:'2026-12-31'};
  const entregavel={id:eid,contratoId:cid,tipo:'RECORRENTE',etapaId:'et',inicioPrevisto:'2026-11-23',terminoPrevisto:'2026-11-29',
    periodicidade:PeriodicidadeEntregavel.SEMANAL,statusExecucao:'EM_ANDAMENTO',agendaInicioFuturo:null,unidadeMedida:'unidades',arquivadoEm:null};
  const etapa={id:'et',contratoId:cid,status:'EM_ANDAMENTO',arquivadoEm:null,conclusaoSolicitadaEm:null,encerramentoSolicitadoEm:null};
  const agenda=[Object.assign({},periodo('44444444-4444-4444-8444-444444444444','2026-11-23','2026-11-29',null),{contratoId:cid,entregavelId:eid,
    origem:'RECORRENTE',modoRegistro:'QUANTITATIVO',metaQuantidade:'12.000',exigeAtividade:false,minimoAtividadesVerificadas:0,
    evidenciaExigida:'NENHUMA',minimoEvidenciasVerificadas:0,minimoFotos:null,minimoRelatorios:null,minimoEvidenciasLivres:null,
    permiteEncerramentoExcepcional:true})];
  const novos: Array<Record<string,unknown>>=[];
  const manager={
    findOne:jest.fn(async(tipo:unknown)=>tipo===Contrato?contrato:tipo===Entregavel?entregavel:null),
    findOneBy:jest.fn(async(tipo:unknown)=>tipo===Etapa?etapa:tipo===ConfiguracaoOcorrencias?null:null),
    find:jest.fn(async(tipo:unknown)=>tipo===Ocorrencia?agenda:[]),
    query:jest.fn(async(sql:string)=> sql.includes('SELECT o.id FROM ocorrencias') && comDependencia ? [{id:agenda[0].id}] : []),
    create:jest.fn((_tipo:unknown,valor:Record<string,unknown>)=>({...valor})),
    save:jest.fn(async(tipo:unknown,valor:Record<string,unknown>)=>{ if(tipo===Ocorrencia&&!valor.id) novos.push({...valor});return valor; }),
    getRepository:jest.fn((tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo:true})}:{upsert:jest.fn(async()=>undefined)}),
  };
  const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
  const ds={transaction:(fn:(m:EntityManager)=>Promise<unknown>)=>fn(manager as unknown as EntityManager)};
  return {service:new ReplanejamentoService(ds as never,auditoria as never), manager, novos,agenda};
}
describe('R25 — integração da prévia/confirmacão com a API transacional',()=>{
  beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-22T18:00:00Z'));});
  afterEach(()=>jest.useRealTimers());
  const entrada={inicioFuturo:'2026-11-23',terminoPrevisto:'2026-11-29',periodicidade:PeriodicidadeEntregavel.DIARIA};
  it('preserva modalidade e meta quantitativa quando a API omite modoRegistro',async()=>{
    const {service,novos}=ambienteReplanejamento();
    const previo=await service.executar(cid,eid,entrada,ator as never) as {confirmacao:string;modoRegistro:string;metaQuantidade:string};
    expect(previo.modoRegistro).toBe('QUANTITATIVO'); expect(previo.metaQuantidade).toBe('12.000');
    await service.executar(cid,eid,{...entrada,confirmacao:previo.confirmacao},ator as never);
    expect(novos).toHaveLength(7);
    for(const o of novos) expect(o).toEqual(expect.objectContaining({modoRegistro:'QUANTITATIVO',metaQuantidade:'12.000'}));
  });
  it('recusa substituição de ocorrência com lançamento/evidência mesmo NAO_INICIADO',async()=>{
    const {service,novos}=ambienteReplanejamento(true);
    await expect(service.executar(cid,eid,entrada,ator as never)).rejects.toThrow(ConflictException);
    expect(novos).toHaveLength(0);
  });
});

it('redistribui saldo zero sem modificar períodos históricos com 100% de peso',()=>{
  const agenda=[periodo('antigo','2026-11-01','2026-11-22','100.0000',StatusOcorrencia.CONCLUIDO),periodo('futuro','2026-11-23','2026-12-06','0.0000')];
  expect(distribuirPesosFuturos(agenda,planoDeRevisao(agenda,new Set(),dto,'2026-11-22'))).toEqual(Array(14).fill('0.0000'));
});
