import { jest } from '@jest/globals';
import { BadRequestException } from '@nestjs/common';
import type { DataSource, Repository, EntityManager } from 'typeorm';
import { OcorrenciasService } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { resumoMedicao } from './medicao-ocorrencia.js';

function ambiente(comEntregavel = true) {
  const o=Object.assign(new Ocorrencia(), {id:'o',contratoId:'c',entregavelId:'e',status:'EM_ANDAMENTO',
    modoRegistro:'DESCRITIVO',origem:'RECORRENTE',exigeAtividade:false,minimoAtividadesVerificadas:0,
    evidenciaExigida:'AMBOS',minimoEvidenciasVerificadas:2,minimoFotos:1,minimoRelatorios:1,
    minimoEvidenciasLivres:0,metaQuantidade:null,quantidadeRealizada:null,substituidaEm:null});
  const e=Object.assign(new Entregavel(), {id:'e',contratoId:'c',etapaId:'t',statusExecucao:'EM_ANDAMENTO',arquivadoEm:null,tipo:'RECORRENTE'});
  const repo={findOne:jest.fn(async()=>o),save:jest.fn(async()=>o)};
  const m={
    findOne:jest.fn(async(entidade:unknown)=>entidade===Contrato?{id:'c',status:'EM_EXECUCAO',arquivadoEm:null}:entidade===Etapa?{id:'t',arquivadoEm:null,status:'PLANEJADA'}:null),
    findOneBy:jest.fn(async(entidade:unknown)=>entidade===Entregavel?e:entidade===Etapa?{id:'t',arquivadoEm:null,status:'PLANEJADA'}:null),
    getRepository:jest.fn((entidade:unknown)=>entidade===Ocorrencia?repo:{
      findOneBy:jest.fn(async()=>entidade===Entregavel && comEntregavel?e:null),
    }),
    query:jest.fn(async(sql:string)=>sql.includes('FROM ocorrencia_lancamentos')?[{total:'0'}]:
      sql.includes('FROM atividades a')?[{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}]:
      [{total:'0',fotos:'0',relatorios:'0'}]),
  };
  const auditoria={registrarNaTransacao:jest.fn(async()=>undefined)};
  const ds={transaction:async(fn:(manager:EntityManager)=>Promise<unknown>)=>fn(m as unknown as EntityManager)};
  const service=new OcorrenciasService(repo as unknown as Repository<Ocorrencia>,{} as Repository<Entregavel>,ds as DataSource,auditoria as never,{} as never);
  return {service,o,repo};
}
const ator={id:'administrador',perfil:'ADMINISTRADOR'} as never;
describe('R25 — requisitos individuais e PATCH parcial',()=>{
  it('recalcula o mínimo total ao editar somente fotos',async()=>{
    const {service,o}=ambiente();
    await service.atualizar('c','o',{minimoFotos:3},ator,'EXIGENCIAS');
    expect(o.minimoFotos).toBe(3);
    expect(o.minimoEvidenciasVerificadas).toBe(4);
  });
  it('recusa total informado que difere da soma de cotas',async()=>{
    const {service,repo}=ambiente();
    await expect(service.atualizar('c','o',{minimoFotos:3,minimoEvidenciasVerificadas:2},ator,'EXIGENCIAS'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('não altera a ocorrência se o entregável foi removido do contrato',async()=>{
    const {service,repo}=ambiente(false);
    await expect(service.atualizar('c','o',{minimoFotos:3},ator,'EXIGENCIAS'))
      .rejects.toThrow('Entregável não encontrado neste contrato');
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('R25 — uma evidência livre pode ser Ata ou Laudo',()=>{
  const o=Object.assign(new Ocorrencia(),{id:'o',contratoId:'c',status:'EM_ANDAMENTO',metaQuantidade:'1',
    exigeAtividade:false,minimoAtividadesVerificadas:0,evidenciaExigida:'AMBOS',
    minimoEvidenciasVerificadas:3,minimoFotos:1,minimoRelatorios:1,minimoEvidenciasLivres:1});
  function manager(total:number):EntityManager {
    return {query:jest.fn(async(sql:string)=>sql.includes('FROM ocorrencia_lancamentos')?[{total:'1'}]:
      sql.includes('FROM atividades a')?[{registrada:'0',verificada:'0',verificadas:'0',pendentes:'0'}]:
      [{total:String(total),fotos:'1',relatorios:'1'}])} as unknown as EntityManager;
  }
  it('três comprovantes válidos, inclusive outro tipo, atendem uma cota livre',async()=>{
    const r=await resumoMedicao(manager(3),o);
    expect(r.evidenciasFoto).toBe(1);expect(r.evidenciasRelatorio).toBe(1);
    expect(r.evidenciasOutras).toBe(1);expect(r.requisitosAtendidos).toBe(true);
  });
  it('não conta os mesmos dois comprovantes duas vezes',async()=>{
    const r=await resumoMedicao(manager(2),o);
    expect(r.requisitosAtendidos).toBe(false);
  });
});

describe('R28 — mínimos documentais não aceitam null ambíguo', () => {
  it.each(['minimoFotos', 'minimoRelatorios', 'minimoEvidenciasLivres', 'minimoEvidenciasVerificadas', 'minimoAtividadesVerificadas'] as const)(
    'recusa %s null sem alterar os dados', async campo => {
      const {service, o, repo} = ambiente();
      const antes = {fotos: o.minimoFotos, total: o.minimoEvidenciasVerificadas};
      await expect(service.atualizar('c', 'o', { [campo]: null } as unknown as Parameters<OcorrenciasService['atualizar']>[2], ator, 'EXIGENCIAS'))
        .rejects.toThrow('Mínimos não aceitam null');
      expect(repo.save).not.toHaveBeenCalled();
      expect(o.minimoFotos).toBe(antes.fotos);
      expect(o.minimoEvidenciasVerificadas).toBe(antes.total);
    },
  );
  it('zero remove a cota sem criar divergência com a soma', async () => {
    const {service, o} = ambiente();
    await service.atualizar('c', 'o', { minimoFotos: 0 }, ator, 'EXIGENCIAS');
    expect(o.minimoFotos).toBe(0);
    expect(o.minimoRelatorios).toBe(1);
    expect(o.minimoEvidenciasVerificadas).toBe(1);
  });
  it('a cotagem total explícita incoerente continua bloqueada', async () => {
    const {service, repo} = ambiente();
    await expect(service.atualizar('c', 'o', { minimoFotos: 0, minimoEvidenciasVerificadas: 2 }, ator, 'EXIGENCIAS'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});
