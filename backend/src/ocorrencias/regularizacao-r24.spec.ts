import { ConflictException } from '@nestjs/common';
import { conclusaoTemporalPermitida, proximoStatusAutomatico, type ResumoMedicao } from './medicao-ocorrencia.js';
import { planoDeRevisao } from './replanejamento.service.js';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import type { Ocorrencia } from './ocorrencia.entity.js';
import { inicioDiaCivilUtc, proximoDiaCivil } from '../common/data-civil.js';

const metaCompleta = {metaAtingida:true,requisitosAtendidos:true,quantidadeRegistrada:1,atividadesVerificadas:1,atividadesPendentes:0} as ResumoMedicao;
const ocorrencia = {status:StatusOcorrencia.EM_ANDAMENTO} as Ocorrencia;
const dto = {inicioFuturo:'2026-11-23',terminoPrevisto:'2026-11-24',periodicidade:PeriodicidadeEntregavel.DIARIA};
const modelo = (inicio:string, fim:string, status=StatusOcorrencia.NAO_INICIADO) => ({
  id:`${inicio}-${fim}`,periodoInicio:inicio,periodoFim:fim,status,substituidaEm:null,
}) as Ocorrencia;

describe('R24 — integridade temporal e de replanejamento',()=>{
  it('não envia serviço contínuo à aprovação antes do fim civil',()=>{
    expect(conclusaoTemporalPermitida('CONTINUO','2026-11-23','2026-11-22')).toBe(false);
    expect(proximoStatusAutomatico(ocorrencia,metaCompleta,false)).toBe('EM_ANDAMENTO');
    expect(conclusaoTemporalPermitida('CONTINUO','2026-11-23','2026-11-23')).toBe(true);
    expect(proximoStatusAutomatico(ocorrencia,metaCompleta,true)).toBe('PENDENTE_CONCLUSAO');
    expect(conclusaoTemporalPermitida('RECORRENTE','2026-11-23','2026-11-22')).toBe(true);
  });
  it('rejeita replanejamento retroativo e aceita hoje ou amanhã',()=>{
    expect(()=>planoDeRevisao([modelo('2026-11-20','2026-11-22')],new Set(),
      {...dto,inicioFuturo:'2026-11-21',terminoPrevisto:'2026-11-22'},'2026-11-22')).toThrow(ConflictException);
    expect(planoDeRevisao([],new Set(),{...dto,inicioFuturo:'2026-11-22'},'2026-11-22').novas).toHaveLength(3);
    expect(planoDeRevisao([],new Set(),dto,'2026-11-22').novas).toHaveLength(2);
  });
  it('converte fronteiras de um dia civil de São Paulo, inclusive à noite',()=>{
    const inicio=inicioDiaCivilUtc('2026-11-22');
    const fim=inicioDiaCivilUtc(proximoDiaCivil('2026-11-22'));
    expect(inicio.toISOString()).toBe('2026-11-22T03:00:00.000Z');
    expect(fim.toISOString()).toBe('2026-11-23T03:00:00.000Z');
    expect(new Date('2026-11-23T01:00:00.000Z') >= inicio).toBe(true);
    expect(new Date('2026-11-23T01:00:00.000Z') < fim).toBe(true);
    expect(new Date('2026-11-22T02:00:00.000Z') >= inicio).toBe(false);
    expect(proximoDiaCivil('2026-12-31')).toBe('2027-01-01');
  });
});

it('usa a primeira hora existente no dia civil de início do horário de verão',()=>{
  expect(inicioDiaCivilUtc('2018-11-04').toISOString()).toBe('2018-11-04T03:00:00.000Z');
  expect(inicioDiaCivilUtc('2018-11-05').toISOString()).toBe('2018-11-05T02:00:00.000Z');
});
