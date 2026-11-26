import { Usuario } from '../usuarios/usuario.entity.js';
import { ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import { OcorrenciasService } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
const contratoId='11111111-1111-4111-8111-111111111111';
const ator={id:'22222222-2222-4222-8222-222222222222',perfil:'ADMINISTRADOR'};
function ambiente() {
  const o={id:'oc',contratoId,entregavelId:'ent',status:'PENDENTE_CONCLUSAO',substituidaEm:null,
    dataPrevista:'2026-11-23',metaQuantidade:'1',exigeAtividade:false,minimoAtividadesVerificadas:0,evidenciaExigida:'NENHUMA',minimoEvidenciasVerificadas:0};
  const e={id:'ent',contratoId,etapaId:'et',tipo:'CONTINUO',terminoPrevisto:'2026-11-23',arquivadoEm:null,statusExecucao:'EM_ANDAMENTO'};
  const etapa={id:'et',status:'EM_ANDAMENTO',arquivadoEm:null,conclusaoSolicitadaEm:null,encerramentoSolicitadoEm:null};
  const repo={findOne:jest.fn(async()=>o),save:jest.fn(async(x:unknown)=>x)};
  const m={getRepository:jest.fn((tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo:true})}:tipo===Ocorrencia?repo:null),
    findOne:jest.fn(async(tipo:unknown)=>tipo===Contrato?{id:contratoId,status:'EM_EXECUCAO',arquivadoEm:null}:tipo===Etapa?etapa:null),
    findOneBy:jest.fn(async(tipo:unknown)=>tipo===Entregavel?e:null),
    save:jest.fn(async(_tipo:unknown,x:unknown)=>x),
    query:jest.fn(async(sql:string)=>sql.includes('ocorrencia_lancamentos')?[{total:'1'}]:sql.includes('FROM atividades a')?
      [{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}]:[{fotos:'0',relatorios:'0'}]),
  };
  const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
  const ds={transaction:(fn:(manager:unknown)=>Promise<unknown>)=>fn(m)};
  const service=new OcorrenciasService({} as never,{} as never,ds as never,auditoria as never,{} as never);
  return {service,o,m,auditoria};
}
describe('R24 — conclusão de ocorrência contínua não contorna vigência',()=>{
  beforeEach(()=>{jest.useFakeTimers();jest.setSystemTime(new Date('2026-11-23T02:30:00Z'));});
  afterEach(()=>jest.useRealTimers());
  it('nega aprovação pendente antes de terminar o prazo civil, sem gravar/auditar',async()=>{
    const {service,o,m,auditoria}=ambiente();
    await expect(service.concluir(contratoId,o.id,ator as never)).rejects.toThrow(ConflictException);
    expect(o.status).toBe('PENDENTE_CONCLUSAO');
    expect(m.save).not.toHaveBeenCalled();
    expect(auditoria.registrarNaTransacao).not.toHaveBeenCalled();
  });
  it('permite aprovação na data civil correta, com medição completa',async()=>{
    jest.setSystemTime(new Date('2026-11-23T03:01:00Z'));
    const {service,o,auditoria}=ambiente();
    await service.concluir(contratoId,o.id,ator as never);
    expect(o.status).toBe('CONCLUIDO');
    expect(o).toMatchObject({concluidaEm: new Date('2026-11-23T03:01:00Z'),concluidaPor:ator.id});
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });
});
