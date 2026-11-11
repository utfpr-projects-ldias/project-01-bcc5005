import { BadRequestException, ConflictException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { Repository, DataSource, EntityManager } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { PeriodicidadeEntregavel } from '../entregaveis/periodicidade-entregavel.enum.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { OcorrenciasService, calcularPeriodosRecorrentes } from './ocorrencias.service.js';

const CONTRATO = '11111111-1111-4111-8111-111111111111';

describe('HU09 — escopo persistido e limites seguros da recorrência', () => {
  it('registra no guard e na auditoria adaptadores da ocorrência persistida', async () => {
    let adaptador: ((id: string) => Promise<string | null>) | undefined;
    let resolvedorAuditoria:
      | ((manager: { getRepository: (tipo: typeof Ocorrencia) => unknown }, id: string) => Promise<string | null>)
      | undefined;
    const repo = {
      findOne: async (query: { where: { id: string } }) =>
        query.where.id === 'conhecida' ? { contratoId: CONTRATO } : null,
    };
    const escopos = {
      registrarAdaptador: (tipo: string, cb: (id: string) => Promise<string | null>) => {
        expect(tipo).toBe('ocorrencia');
        adaptador = cb;
      },
    };
    const auditoria = {
      registrarResolvedorContexto: (
        tipo: string,
        cb: (manager: { getRepository: (tipo: typeof Ocorrencia) => unknown }, id: string) => Promise<string | null>,
      ) => {
        expect(tipo).toBe('OCORRENCIA');
        resolvedorAuditoria = cb;
      },
    };
    const service = new OcorrenciasService(
      repo as unknown as Repository<Ocorrencia>,
      {} as Repository<Entregavel>,
      {} as DataSource,
      auditoria as unknown as AuditoriaService,
      escopos as unknown as ResolverEscopoContratoService,
    );
    service.onModuleInit();
    expect(adaptador).toBeDefined();
    expect(resolvedorAuditoria).toBeDefined();
    expect(await adaptador!('conhecida')).toBe(CONTRATO);
    expect(await adaptador!('inexistente')).toBeNull();
    expect(await resolvedorAuditoria!(
      { getRepository: () => repo }, 'conhecida',
    )).toBe(CONTRATO);
  });

  it('gera intervalos semanais completos em datas civis', () => {
    const itens = calcularPeriodosRecorrentes('2026-01-01', '2026-01-14', PeriodicidadeEntregavel.SEMANAL);
    expect(itens.map((v) => [v.inicio, v.fim])).toEqual([
      ['2026-01-01', '2026-01-07'],
      ['2026-01-08', '2026-01-14'],
    ]);
  });

  it('rejeita períodos parciais sem política homologada', () => {
    expect(() => calcularPeriodosRecorrentes('2026-01-01', '2026-01-10', PeriodicidadeEntregavel.SEMANAL))
      .toThrow(BadRequestException);
  });

  it('não produz períodos mensais ambíguos a partir de 29, 30 ou 31', () => {
    expect(() => calcularPeriodosRecorrentes('2026-01-31', '2026-04-30', PeriodicidadeEntregavel.MENSAL))
      .toThrow(BadRequestException);
  });

  it('não trunca silenciosamente uma geração com mais de 500 períodos', () => {
    expect(() => calcularPeriodosRecorrentes('2024-01-01', '2026-01-01', PeriodicidadeEntregavel.DIARIA))
      .toThrow(BadRequestException);
  });
});


describe('HU09 — mutações respeitam o ciclo de vida da hierarquia', () => {
  const ator = { id: 'qa', perfil: PerfilUsuario.ADMINISTRADOR, supertokensUserId: 'qa', email: 'qa@example.invalid' };
  function cenario(statusContrato: string, statusEtapa: string, statusExecucao: string) {
    const entregavel = { id: 'e', etapaId: 'et', contratoId: CONTRATO, arquivadoEm: null, statusExecucao };
    const repo = { findOne: jest.fn(async () => entregavel), findOneBy: jest.fn(async () => entregavel), save: jest.fn() };
    const ocorrenciaRepo = { findOne: jest.fn(async () => ({ id: 'o', entregavelId: 'e' })), save: jest.fn() };
    const manager = {
      findOne: jest.fn(async (tipo: unknown) => tipo === Contrato ? { status: statusContrato, arquivadoEm: null } : tipo === Etapa ? { status: statusEtapa, arquivadoEm: null } : null),
      getRepository: (tipo: unknown) => tipo === Entregavel ? repo : ocorrenciaRepo,
    } as unknown as EntityManager;
    const dataSource = { transaction: async (fn: (m: EntityManager) => Promise<unknown>) => fn(manager) } as unknown as DataSource;
    return { service: new OcorrenciasService({} as Repository<Ocorrencia>, {} as Repository<Entregavel>, dataSource, {} as AuditoriaService, {} as ResolverEscopoContratoService), repo, ocorrenciaRepo, manager };
  }
  it.each([
    ['SUSPENSO', 'PLANEJADA', 'EM_ANDAMENTO'],
    ['PLANEJAMENTO', 'CONCLUIDA', 'EM_ANDAMENTO'],
    ['PLANEJAMENTO', 'PLANEJADA', 'CONCLUIDO'],
  ])('bloqueia geração, cadastro e edição sob %s/%s/%s, sem gravar', async (contrato, etapa, entregavel) => {
    const { service, repo, ocorrenciaRepo, manager } = cenario(contrato, etapa, entregavel);
    await expect(service.gerarRecorrentes(CONTRATO, 'e', false, ator)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.criarManualQuantitativa(CONTRATO, 'e', { titulo: 'QA' }, ator)).rejects.toBeInstanceOf(ConflictException);
    await expect(service.atualizar(CONTRATO, 'o', {}, ator)).rejects.toBeInstanceOf(ConflictException);
    expect(manager.findOne).toHaveBeenCalledWith(Contrato, { where: { id: CONTRATO }, lock: { mode: 'pessimistic_write' } });
    expect(repo.save).not.toHaveBeenCalled();
    expect(ocorrenciaRepo.save).not.toHaveBeenCalled();
  });
});
