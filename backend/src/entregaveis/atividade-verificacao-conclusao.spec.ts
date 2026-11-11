import 'reflect-metadata';
import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { AtividadesService } from '../atividades/atividades.service.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { EvidenciasRecebidasService } from './evidencias-recebidas.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const etapaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const entregavelId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const atividadeId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ator = { id: atividadeId, email: 'qa@example.invalid', perfil: PerfilUsuario.ADMINISTRADOR,
  supertokensUserId: 'qa' };
function cenario({ outraAtividade = false, documentoPronto = true }: {
  outraAtividade?: boolean; documentoPronto?: boolean } = {}) {
  const contrato = { id: contratoId, status: 'EM_EXECUCAO', arquivadoEm: null };
  const etapa = { id: etapaId, contratoId, status: 'EM_ANDAMENTO', arquivadoEm: null, reabertoEm: new Date() };
  const entregavel = { id: entregavelId, contratoId, etapaId, statusExecucao: 'EM_ANDAMENTO',
    arquivadoEm: null, reabertoEm: new Date() };
  const atividade = Object.assign(new AtividadeEntity(), {
    id: atividadeId, contratoId, titulo: 'Reunião', dataHora: new Date('2026-11-09T15:00:00Z'),
    tipo: 'Reunião', descricao: 'Trabalho realizado', responsavel: 'QA', status: 'REGISTRADA',
    entregaveis: [entregavel], verificadaEm: null, arquivadaEm: null, excluidaEm: null,
  });
  const repoEntregavel = { findOneBy: jest.fn(async () => entregavel), save: jest.fn(async () => entregavel) };
  const repoEtapa = { findOneBy: jest.fn(async () => etapa), save: jest.fn(async () => etapa) };
  const query = jest.fn(async (sql: string) => {
    if (sql.includes('COUNT(DISTINCT')) return [{ etapas: 1, entregaveis: 1,
      evidencias: 2, verificadas: documentoPronto ? 2 : 1,
      etapas_sem_entregavel: 0, entregaveis_sem_evidencia: 0 }];
    return [{ pendentes: sql.includes("at.status = 'REGISTRADA'") && outraAtividade }];
  });
  const manager = {
    findOne: jest.fn(async (entidade: unknown) => entidade === AtividadeEntity ? atividade : entidade === Contrato ? contrato : null),
    getRepository: jest.fn((entidade: unknown) => entidade === Entregavel ? repoEntregavel : repoEtapa),
    query,
    find: jest.fn(async (entidade: unknown) => entidade === Entregavel ? [entregavel] : entidade === Etapa ? [etapa] : []),
    save: jest.fn(async (_entidade: unknown, registro: unknown) => registro),
  };
  const acoes: AcaoAuditoria[] = [];
  const auditoria = {
    registrarNaTransacao: jest.fn(async (_m: unknown, _a: unknown, evento: { acao: AcaoAuditoria }) => {
      acoes.push(evento.acao);
    }),
    executarComAuditoria: async (_a: unknown, callback: (m: typeof manager) => Promise<{
      resultado: AtividadeEntity; evento: { acao: AcaoAuditoria };
      aposEvento?: (m: typeof manager) => Promise<void>;
    }>) => {
      const operacao = await callback(manager);
      acoes.push(operacao.evento.acao);
      if (operacao.aposEvento) await operacao.aposEvento(manager);
      return operacao.resultado;
    },
  };
  return { service: new AtividadesService({} as never, auditoria as never, {} as never),
    atividade, entregavel, etapa, manager, acoes, repoEntregavel, repoEtapa, auditoria };
}

describe('HU08 — verificação da última atividade e fechamento auditável', () => {
  it('conclui entregável e etapa quando a última atividade é verificada e os arquivos já estão verificados', async () => {
    const c = cenario();
    await c.service.verificar(contratoId, atividadeId, ator, '');
    expect(c.atividade.status).toBe('VERIFICADA');
    expect(c.entregavel.statusExecucao).toBe('CONCLUIDO');
    expect(c.entregavel.reabertoEm).toBeNull();
    expect(c.etapa.status).toBe('CONCLUIDA');
    expect(c.acoes).toEqual([
      AcaoAuditoria.ATIVIDADE_VERIFICADA, AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
      AcaoAuditoria.ETAPA_STATUS_ALTERADO,
    ]);
    // A conclusão do contrato segue exigindo confirmação própria.
    expect(c.manager.getRepository).not.toHaveBeenCalledWith(Contrato);
    // Para reabrir a atividade, primeiro é obrigatório reabrir o contexto.
    await expect(c.service.reabrir(contratoId, atividadeId, ator, 'Correção posterior necessária'))
      .rejects.toBeInstanceOf(ConflictException);
  });
  it('não conclui se outra atividade ainda está REGISTRADA', async () => {
    const c = cenario({ outraAtividade: true });
    await c.service.verificar(contratoId, atividadeId, ator, '');
    expect(c.entregavel.statusExecucao).toBe('EM_ANDAMENTO');
    expect(c.acoes).toEqual([AcaoAuditoria.ATIVIDADE_VERIFICADA]);
  });
  it('não conclui se falta verificar alguma evidência documental', async () => {
    const c = cenario({ documentoPronto: false });
    await c.service.verificar(contratoId, atividadeId, ator, '');
    expect(c.entregavel.statusExecucao).toBe('EM_ANDAMENTO');
    expect(c.acoes).toEqual([AcaoAuditoria.ATIVIDADE_VERIFICADA]);
  });
  it('verificação de uma evidência não fecha o entregável com atividade REGISTRADA', async () => {
    const c = cenario({ outraAtividade: true });
    const servico = new EvidenciasRecebidasService({} as never, {} as never, c.auditoria as never, {} as never);
    const metodo = servico as unknown as { concluirHierarquiaSeComprovada: (
      m: unknown, ator: unknown, contratoId: string, entregavel: unknown) => Promise<string[]> };
    const resultado = await metodo.concluirHierarquiaSeComprovada(c.manager, ator, contratoId, c.entregavel);
    expect(resultado).toEqual([]);
    expect(c.repoEntregavel.save).not.toHaveBeenCalled();
  });
});
