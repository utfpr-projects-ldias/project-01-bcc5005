import type { DataSource, EntityManager, Repository } from 'typeorm';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { OcorrenciasService } from './ocorrencias.service.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { ResolverEscopoContratoService } from '../autorizacao/resolver-escopo-contrato.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

const ator = { id: 'administrador', perfil: 'ADMINISTRADOR' } as UsuarioAutenticado;
function ambiente(registrados = 13) {
  const ocorrencia = Object.assign(new Ocorrencia(), {
    id: 'oc', contratoId: 'co', entregavelId: 'en', status: 'EM_REVISAO',
    modoRegistro: 'QUANTITATIVO', origem: 'RECORRENTE', metaQuantidade: '20',
    exigeAtividade: false, minimoAtividadesVerificadas: 0, evidenciaExigida: 'NENHUMA',
  });
  const entregavel = Object.assign(new Entregavel(), {
    id: 'en', etapaId: 'et', contratoId: 'co', statusExecucao: 'EM_ANDAMENTO', arquivadoEm: null,
  });
  const repo = { findOne: jest.fn(async () => ocorrencia), save: jest.fn(async () => ocorrencia) };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const m = {
    getRepository: (entidade: unknown) => entidade === Ocorrencia ? repo : {
      findOneBy: async () => entidade === Entregavel ? entregavel : null,
    },
    findOne: async (entidade: unknown) => entidade === Contrato
      ? { id:'co', status: 'EM_EXECUCAO', arquivadoEm: null }
      : entidade === Etapa ? { id:'et', status:'PLANEJADA', arquivadoEm: null } : null,
    query: jest.fn(async (sql: string) => sql.includes('FROM ocorrencia_lancamentos')
      ? [{ total: String(registrados) }]
      : sql.includes('FROM atividades a')
        ? [{ registrada: '0', verificada: '0', verificadas:'0', pendentes:'0' }]
        : [{ fotos: '0', relatorios: '0' }]),
  };
  const ds = { transaction: async (callback: (manager: EntityManager) => Promise<unknown>) => callback(m as unknown as EntityManager) };
  const service = new OcorrenciasService(
    repo as unknown as Repository<Ocorrencia>, {} as Repository<Entregavel>,
    ds as DataSource, auditoria as unknown as AuditoriaService,
    {} as ResolverEscopoContratoService,
  );
  return { service, repo, auditoria, ocorrencia };
}

describe('meta individual por ocorrência — controle de escopo e auditoria', () => {
  it('não permite alterar meta pela edição geral mesmo para ADMIN', async () => {
    const { service, repo } = ambiente();
    await expect(service.atualizar('co','oc',{metaQuantidade:'25'},ator,'GERAL'))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
  it('permite alterar apenas a meta sem reescrever quantidade executada e peso', async () => {
    const { service, ocorrencia, auditoria } = ambiente(13);
    await service.atualizar('co','oc',{metaQuantidade:'25'},ator,'META');
    expect(ocorrencia.metaQuantidade).toBe('25');
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledWith(expect.anything(),ator,
      expect.objectContaining({ dadosPosteriores: expect.objectContaining({
        metaQuantidade:'25', operacao:'ALTERACAO_META_INDIVIDUAL',
      }) }));
  });
  it('não reduz meta abaixo da quantidade registrada sem justificativa', async () => {
    const { service } = ambiente(13);
    await expect(service.atualizar('co','oc',{metaQuantidade:'10'},ator,'META'))
      .rejects.toBeInstanceOf(ConflictException);
  });
  it('preserva excedente e histórico ao reduzir a meta com justificativa', async () => {
    const { service, ocorrencia, auditoria } = ambiente(13);
    await service.atualizar('co','oc',{metaQuantidade:'10'},ator,'META','Planejamento revisado por autorização');
    expect(ocorrencia.metaQuantidade).toBe('10');
    expect(auditoria.registrarNaTransacao).toHaveBeenCalledWith(expect.anything(),ator,
      expect.objectContaining({ dadosAnteriores: expect.objectContaining({metaQuantidade:'20'}),
        dadosPosteriores: expect.objectContaining({metaQuantidade:'10'}) }));
  });
});
