import { jest } from '@jest/globals';
import { OcorrenciasService } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
const cid='11111111-1111-4111-8111-111111111111';
const ator={id:'22222222-2222-4222-8222-222222222222',perfil:'ADMINISTRADOR'};

describe('R24 — ativação em lotes sob hierarquia fechada',()=>{
  beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-22T15:00:00Z'));});
  afterEach(()=>jest.useRealTimers());
  it('não deixa 500 ocorrências inelegíveis ocultarem a ocorrência 501',async()=>{
    const linhas=Array.from({length:501},(_,i)=>({id:String(i+1).padStart(3,'0'),contratoId:cid,
      entregavelId:i===500?'aberto':'pendente',periodoInicio:'2026-11-21',dataPrevista:'2026-11-21',
      status:'NAO_INICIADO',substituidaEm:null}));
    const repo={find:jest.fn(async(opts:{skip?:number;take?:number})=>linhas.filter(o=>o.status==='NAO_INICIADO')
      .slice(opts.skip??0,(opts.skip??0)+(opts.take??500)))};
    const m={getRepository:jest.fn((tipo:unknown)=>tipo===Ocorrencia?repo:null),
      findOne:jest.fn(async(tipo:unknown)=>tipo===Contrato?{id:cid,status:'EM_EXECUCAO',arquivadoEm:null}:null),
      findOneBy:jest.fn(async(tipo:unknown,where:{id:string})=>tipo===Entregavel?
        {id:where.id,etapaId:where.id,contratoId:cid,statusExecucao:where.id==='pendente'?'PENDENTE_CONCLUSAO':'EM_ANDAMENTO',arquivadoEm:null}:
        tipo===Etapa?{id:where.id,contratoId:cid,status:'EM_ANDAMENTO',arquivadoEm:null,conclusaoSolicitadaEm:null,encerramentoSolicitadoEm:null}:null),
      save:jest.fn(async(_tipo:unknown,item:unknown)=>item)};
    const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
    const ds={transaction:(fn:(manager:unknown)=>Promise<unknown>)=>fn(m)};
    const s=new OcorrenciasService({} as never,{} as never,ds as never,auditoria as never,{} as never);
    expect(await s.iniciarPrevistas(cid,ator as never)).toEqual({iniciadas:1,dataReferencia:'2026-11-22'});
    expect(linhas[500].status).toBe('EM_ANDAMENTO');
    expect(linhas[0].status).toBe('NAO_INICIADO');
    expect(repo.find).toHaveBeenCalledTimes(2);
    expect(await s.iniciarPrevistas(cid,ator as never)).toEqual({iniciadas:0,dataReferencia:'2026-11-22'});
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });
});
