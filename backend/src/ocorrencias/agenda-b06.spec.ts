import { jest } from '@jest/globals';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OcorrenciasService, validarVigenciaOcorrencia } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { ConfiguracaoOcorrencias } from './configuracao-ocorrencias.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';

const ator={id:'admin',perfil:PerfilUsuario.ADMINISTRADOR,supertokensUserId:'admin-st',email:'qa@example.invalid'};
const entrega={id:'e',contratoId:'c',etapaId:'et',tipo:'RECORRENTE',inicioPrevisto:'2026-12-01',terminoPrevisto:'2026-12-02',periodicidade:'DIARIA',configuracaoPeriodicidade:{modoRegistro:'QUANTITATIVO',versao:1},unidadeMedida:'unidades',statusExecucao:'EM_ANDAMENTO',arquivadoEm:null,agendaInicioFuturo:null as string|null};
const contrato={inicioVigencia:'2026-11-01',terminoVigencia:'2026-12-31',status:'EM_EXECUCAO',arquivadoEm:null};
const periodo=(dia:string)=>({periodoInicio:dia,periodoFim:dia,status:'NAO_INICIADO',modoRegistro:'QUANTITATIVO',metaQuantidade:'999999999999999.998',pesoPeriodo:null as string|null,exigeAtividade:true,minimoAtividadesVerificadas:2,evidenciaExigida:'FOTO',minimoEvidenciasVerificadas:1,minimoFotos:1,minimoRelatorios:0,minimoEvidenciasLivres:0,permiteEncerramentoExcepcional:false});
function ambiente(itens:ReturnType<typeof periodo>[], replanejado=false, ativo=true) {
  const e={...entrega,agendaInicioFuturo:replanejado?'2026-12-02':null};
  const repo={find:jest.fn(async()=>itens),create:jest.fn((v:Record<string,unknown>)=>v),save:jest.fn(async(v:Record<string,unknown>)=>({...v,id:'novo'}))};
  const m={getRepository:(tipo:unknown)=>tipo===Usuario?{findOne:async()=>({...ator,ativo})}:tipo===Entregavel?{findOne:async()=>e}:tipo===Ocorrencia?repo:null,
    findOne:async(tipo:unknown)=>tipo===Contrato?contrato:tipo===Etapa?{status:'EM_ANDAMENTO',arquivadoEm:null}:null,
    findOneBy:async(tipo:unknown)=>tipo===ConfiguracaoOcorrencias?{terminoPrevisto:'2026-12-02'}:null};
  const ds={transaction:(fn:(m:unknown)=>Promise<unknown>)=>fn(m)};
  const service=new OcorrenciasService({} as never,{} as never,ds as never,{registrarNaTransacao:jest.fn(async()=>undefined)} as never,{} as never);
  return {service,repo};
}

describe('B06 — repetição da geração quantitativa e vigência',()=>{
  it('uma agenda completa não exige informar novamente a meta e não grava',async()=>{
    const {service,repo}=ambiente([periodo('2026-12-01'),periodo('2026-12-02')]);
    expect(await service.gerarRecorrentes('c','e',false,ator)).toEqual({entregavelId:'e',periodosPrevistos:2,novasGeradas:0});
    expect(repo.save).not.toHaveBeenCalled();
    expect(repo.find).toHaveBeenCalledTimes(1);
  });
  it('não ignora alteração de um milésimo na meta informada',async()=>{
    const {service,repo}=ambiente([periodo('2026-12-01'),periodo('2026-12-02')]);
    await expect(service.gerarRecorrentes('c','e',false,ator,{metaQuantidade:'999999999999999.999'})).rejects.toThrow(ConflictException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('conta os períodos preservados após replanejamento e não recria os históricos',async()=>{
    const {service}=ambiente([periodo('2026-12-01'),periodo('2026-12-02')],true);
    expect(await service.gerarRecorrentes('c','e',false,ator)).toEqual({entregavelId:'e',periodosPrevistos:2,novasGeradas:0});
    const faltante=ambiente([periodo('2026-12-01')],true);
    await expect(faltante.service.gerarRecorrentes('c','e',false,ator)).rejects.toThrow(ConflictException);
    expect(faltante.repo.save).not.toHaveBeenCalled();
  });
  it('completa somente a lacuna existente, herdando critérios e meta exata',async()=>{
    const {service,repo}=ambiente([periodo('2026-12-01')]);
    expect(await service.gerarRecorrentes('c','e',false,ator,{recuperarFaltantes:true})).toEqual({entregavelId:'e',periodosPrevistos:2,novasGeradas:1});
    expect(repo.save).toHaveBeenCalledTimes(1);
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({periodoInicio:'2026-12-02',status:'NAO_INICIADO',metaQuantidade:'999999999999999.998',minimoFotos:1,minimoAtividadesVerificadas:2}));
  });
  it('não inventa uma referência de recuperação ou pesos',async()=>{
    const sem=ambiente([]); const peso=ambiente([{...periodo('2026-12-01'),pesoPeriodo:'100.0000'}]);
    for(const x of [sem,peso]){await expect(x.service.gerarRecorrentes('c','e',false,ator,{recuperarFaltantes:true})).rejects.toThrow(ConflictException);expect(x.repo.save).not.toHaveBeenCalled();}
  });
  it('revalida inclusive a identidade do administrador dentro da transação',async()=>{
    const {service,repo}=ambiente([],false,false);
    await expect(service.gerarRecorrentes('c','e',false,ator)).rejects.toThrow(ForbiddenException);
    expect(repo.find).not.toHaveBeenCalled();
  });
  it('não aceita planejamento fora dos limites civis do entregável e contrato',()=>{
    expect(()=>validarVigenciaOcorrencia(['2026-12-01','2026-12-02'],contrato,entrega)).not.toThrow();
    expect(()=>validarVigenciaOcorrencia(['2026-12-03'],contrato,entrega)).toThrow(BadRequestException);
    expect(()=>validarVigenciaOcorrencia(['2026-10-31'],contrato,entrega)).toThrow(BadRequestException);
  });
});
