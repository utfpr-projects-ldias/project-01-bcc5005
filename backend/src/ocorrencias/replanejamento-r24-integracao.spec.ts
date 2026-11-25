import { Usuario } from '../usuarios/usuario.entity.js';
import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { ReplanejamentoService } from './replanejamento.service.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';

const cid='11111111-1111-4111-8111-111111111111';
const eid='22222222-2222-4222-8222-222222222222';
const ator={id:'33333333-3333-4333-8333-333333333333',perfil:'ADMINISTRADOR'};
const dto={inicioFuturo:'2026-11-23',terminoPrevisto:'2026-11-24',periodicidade:PeriodicidadeEntregavel.DIARIA};
function ambiente(opcao:{pendenciaEtapa?:boolean;pendenciaEntregavel?:boolean;divergente?:boolean}={}) {
  const c={id:cid,status:'EM_EXECUCAO',arquivadoEm:null,inicioVigencia:'2026-11-01',terminoVigencia:'2026-12-31'};
  const e={id:eid,contratoId:cid,tipo:'RECORRENTE',etapaId:'etapa',inicioPrevisto:'2026-11-23',terminoPrevisto:opcao.divergente?'2026-11-26':'2026-11-24',
    periodicidade:PeriodicidadeEntregavel.DIARIA, statusExecucao:opcao.pendenciaEntregavel?'PENDENTE_CONCLUSAO':'EM_ANDAMENTO',
    agendaInicioFuturo:null, unidadeMedida:null,arquivadoEm:null};
  const etapa={id:'etapa',contratoId:cid,status:'EM_ANDAMENTO',arquivadoEm:null,
    conclusaoSolicitadaEm:opcao.pendenciaEtapa?new Date():null,encerramentoSolicitadoEm:null};
  const requisitos={exigeAtividade:true,minimoAtividadesVerificadas:2,evidenciaExigida:'AMBOS',minimoEvidenciasVerificadas:2,
    minimoFotos:1,minimoRelatorios:1,minimoEvidenciasLivres:0,permiteEncerramentoExcepcional:false,pesoPeriodo:null};
  const agenda=[{id:'oc1',contratoId:cid,entregavelId:eid,origem:'RECORRENTE',status:StatusOcorrencia.NAO_INICIADO,
    periodoInicio:'2026-11-23',periodoFim:'2026-11-24',dataPrevista:'2026-11-24',dataRealizada:null,quantidadeRealizada:null,
    observacoes:null,substituidaEm:null,...requisitos}];
  if(opcao.divergente) agenda.push({...agenda[0],id:'oc2',periodoInicio:'2026-11-25',periodoFim:'2026-11-26',minimoAtividadesVerificadas:1});
  const novos: Record<string,unknown>[]=[];
  const upsert=jest.fn(async()=>undefined);
  const m={
    findOne:jest.fn(async (tipo:unknown)=>tipo===Contrato?c:tipo===Entregavel?e:null),
    findOneBy:jest.fn(async(tipo:unknown)=>tipo===Etapa?etapa:tipo===ConfiguracaoOcorrencias?null:null),
    find:jest.fn(async (tipo:unknown)=>tipo===Ocorrencia?agenda:[]),
    query:jest.fn(async (_sql:string,..._args:unknown[]):Promise<Array<{id:string}>>=>[]),
    save:jest.fn(async (tipo:unknown,valor:Record<string,unknown>)=>{
      if(tipo===Ocorrencia&&!valor.id){novos.push({...valor});return {...valor,id:`nova-${novos.length}`};}
      return valor;
    }),
    create:jest.fn((_tipo:unknown,valor:Record<string,unknown>)=>({...valor})),
    getRepository:jest.fn((tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo:true})}:tipo===ConfiguracaoOcorrencias?{upsert}:null),
  };
  const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
  const ds={transaction:(fn:(manager:unknown)=>Promise<unknown>)=>fn(m)};
  return {service:new ReplanejamentoService(ds as never,auditoria as never),novos,m,e};
}

describe('R24 — replanejamento transacional de requisitos',()=>{
  beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-22T18:00:00Z'));});
  afterEach(()=>jest.useRealTimers());
  it('herda as exigências de atividades, fotos e relatórios na prévia e nos novos períodos',async()=>{
    const {service,novos}=ambiente();
    const prev=await service.executar(cid,eid,dto,ator as never) as {confirmacao:string;criteriosHerdados:{minimoAtividadesVerificadas:number;minimoFotos:number;minimoRelatorios:number};aplicado:boolean};
    expect(prev.aplicado).toBe(false);
    expect(prev.criteriosHerdados).toEqual(expect.objectContaining({minimoAtividadesVerificadas:2,minimoFotos:1,minimoRelatorios:1}));
    await service.executar(cid,eid,{...dto,confirmacao:prev.confirmacao},ator as never);
    expect(novos).toHaveLength(2);
    for(const n of novos) expect(n).toEqual(expect.objectContaining({minimoAtividadesVerificadas:2,evidenciaExigida:'AMBOS',
      minimoFotos:1,minimoRelatorios:1,permiteEncerramentoExcepcional:false}));
  });
  it('bloqueia replanejamento com decisão pendente na etapa/entregável',async()=>{
    for(const caso of [{pendenciaEtapa:true},{pendenciaEntregavel:true}]){
      const {service,novos}=ambiente(caso);
      await expect(service.executar(cid,eid,dto,ator as never)).rejects.toThrow(ConflictException);
      expect(novos).toHaveLength(0);
    }
  });
  it('exige alteração explícita do prazo e persiste planejamento somente após confirmação',async()=>{
    const {service,e,novos}=ambiente();
    const entrada={...dto,terminoPrevisto:'2026-11-25'};
    await expect(service.executar(cid,eid,entrada,ator as never)).rejects.toThrow(/explicitamente/);
    const previa=await service.executar(cid,eid,{...entrada,alterarPrazo:true},ator as never);
    expect(previa.prazoAlterado).toEqual({anterior:'2026-11-24',novo:'2026-11-25'});
    expect(e.terminoPrevisto).toBe('2026-11-24'); expect(novos).toHaveLength(0);
    await service.executar(cid,eid,{...entrada,alterarPrazo:true,confirmacao:previa.confirmacao},ator as never);
    expect(e.terminoPrevisto).toBe('2026-11-25'); expect(novos).toHaveLength(3);
  });
  it('não aceita requisitos heterogêneos sem regularização explícita',async()=>{
    const {service}=ambiente({divergente:true});
    await expect(service.executar(cid,eid,{...dto,terminoPrevisto:'2026-11-26'},ator as never)).rejects.toThrow(/exigências diferentes/);
  });
  it('preserva período referenciado por declaração preliminar de evidência',async()=>{
    const {service,m,novos}=ambiente();
    m.query.mockImplementation(async sql=>sql.includes('rascunho_envio')?[{id:'oc1'}]:[]);
    await expect(service.executar(cid,eid,dto,ator as never)).rejects.toThrow(/declarações preliminares/);
    expect(novos).toHaveLength(0);
  });
  it('não admite replanejamento retroativo nem confirma token após virada de dia',async()=>{
    const {service,novos}=ambiente();
    const prev=await service.executar(cid,eid,dto,ator as never) as {confirmacao:string};
    jest.setSystemTime(new Date('2026-11-24T03:01:00Z'));
    await expect(service.executar(cid,eid,{...dto,confirmacao:prev.confirmacao},ator as never)).rejects.toThrow(ConflictException);
    expect(novos).toHaveLength(0);
  });
});
