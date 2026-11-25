import { BadRequestException } from '@nestjs/common';
import { jest } from '@jest/globals';
import type { EntityManager, DataSource, Repository } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { TipoEntregavel } from '../entregaveis/tipo-entregavel.enum.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { OcorrenciasService } from './ocorrencias.service.js';

const contratoId = '11111111-1111-4111-8111-111111111111';
const entregavelId = '22222222-2222-4222-8222-222222222222';
const ator = { id: 'admin-qa', perfil: PerfilUsuario.ADMINISTRADOR, supertokensUserId: 'admin-qa', email: 'qa@example.invalid' };
function montar() {
  const entregavel = Object.assign(new Entregavel(), {
    id: entregavelId, contratoId, etapaId: 'etapa-qa', tipo: TipoEntregavel.UNICO,
    arquivadoEm: null, statusExecucao: 'EM_ANDAMENTO', quantidadeRealizada: null,
    quantidadePrevista: null, unidadeMedida: null,
  });
  const salvar = jest.fn(async (item: Ocorrencia) => ({ ...item, id: 'ocorrencia-qa' }));
  const repo = { findOneBy: jest.fn(async () => entregavel) };
  const ocorrenciaRepo = { create: jest.fn((x: object) => Object.assign(new Ocorrencia(), x)), save: salvar };
  const manager = {
    findOne: jest.fn(async (entidade: unknown) => entidade === Contrato
      ? { status: 'EM_EXECUCAO', arquivadoEm: null }
      : entidade === Etapa ? { status: 'EM_ANDAMENTO', arquivadoEm: null, conclusaoSolicitadaEm: null, encerramentoSolicitadoEm: null } : null),
    getRepository: (entidade: unknown) => entidade === Entregavel ? repo : ocorrenciaRepo,
    count: jest.fn(async () => 0),
  } as unknown as EntityManager;
  const dataSource = { transaction: async (fn: (m: EntityManager) => Promise<unknown>) => fn(manager) } as unknown as DataSource;
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) } as unknown as AuditoriaService;
  const service = new OcorrenciasService({} as Repository<Ocorrencia>, {} as Repository<Entregavel>, dataSource, auditoria, {} as ResolverEscopoContratoService);
  return { service, salvar, auditoria };
}
describe('RB-03 — ocorrência opcional no entregável ÚNICO', () => {
  it('cria ocorrência manual DESCRITIVA, com auditoria, sem transformá-la em medição', async () => {
    const { service, salvar, auditoria } = montar();
    const resultado = await service.criarManualQuantitativa(contratoId, entregavelId, { titulo: 'Reunião de implantação', modoRegistro: 'DESCRITIVO' }, ator);
    expect(resultado).toMatchObject({ id: 'ocorrencia-qa', modoRegistro: 'DESCRITIVO', metaQuantidade: null, quantidadeRealizada: null });
    expect(salvar).toHaveBeenCalledTimes(1);
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledTimes(1);
  });
  it('continua proibindo lançamento quantitativo para o tipo ÚNICO', async () => {
    const { service, salvar } = montar();
    await expect(service.criarManualQuantitativa(contratoId, entregavelId, {
      titulo: 'Medição indevida', modoRegistro: 'QUANTITATIVO', metaQuantidade: '3',
    }, ator)).rejects.toBeInstanceOf(BadRequestException);
    expect(salvar).not.toHaveBeenCalled();
  });
});
