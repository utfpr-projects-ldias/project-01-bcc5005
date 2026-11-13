import { jest } from '@jest/globals';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { ArquivamentoPlanejamentoService } from './arquivamento-planejamento.service.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const evidenciaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const ator: UsuarioAutenticado = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  perfil: PerfilUsuario.ADMINISTRADOR,
  supertokensUserId: 'st-admin',
  email: 'a@example.test',
};

function base() {
  const contrato = { id: contratoId, arquivadoEm: null as Date | null };
  const entregue = {
    id: entregavelId,
    contratoId,
    arquivadoEm: null as Date | null,
    arquivadoPor: null as string | null,
  };
  const esperada = {
    id: evidenciaId,
    entregavelId,
    arquivadoEm: null as Date | null,
    arquivadoPor: null as string | null,
  };
  const query = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => contrato),
  };
  const repoContrato = {
    createQueryBuilder: jest.fn(() => query),
    findOneBy: jest.fn(async () => contrato),
  };
  const repoEntregavel = {
    findOneBy: jest.fn(async () => entregue as Entregavel),
    save: jest.fn(async (e: unknown) => e),
  };
  const repoComprovante = { findOne: jest.fn(async () => null) };
  const repoEtapa = {
    findOneBy: jest.fn(async () => ({
      id: 'etapa-qa',
      contratoId,
      arquivadoEm: null as Date | null,
      status: 'PLANEJADA',
      reabertoEm: null,
    })),
    save: jest.fn(async (value: unknown) => value),
  };
  const repoEvidencia = {
    find: jest.fn(async () => [esperada]),
    findOneBy: jest.fn(async () => esperada as EvidenciaEsperada),
    count: jest.fn(async () => 1),
    save: jest.fn(async (e: unknown) => e),
  };
  const m = {
    findBy: jest.fn(async () => []),
    query: jest.fn(async (_sql: string): Promise<unknown[]> => [
      {
        etapas: 1,
        entregaveis: 1,
        evidencias: 1,
        verificadas: 0,
        etapas_sem_entregavel: 0,
        entregaveis_sem_evidencia: 0,
      },
    ]),

    getRepository: jest.fn((entity: unknown) =>
      entity === Contrato
        ? repoContrato
        : entity === Entregavel
          ? repoEntregavel
          : entity === ComprovanteEvidencia
            ? repoComprovante
            : entity === Etapa
              ? repoEtapa
              : repoEvidencia,
    ),
  };
  const db = {
    getRepository: m.getRepository,
    transaction: jest.fn(async (fn: (manager: typeof m) => Promise<unknown>) =>
      fn(m),
    ),
  };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const service = new ArquivamentoPlanejamentoService(
    db as never,
    auditoria as never,
  );
  return {
    service,
    db,
    auditoria,
    contrato,
    entregue,
    esperada,
    repoEntregavel,
    repoEvidencia,
    repoEtapa,
    query,
    m,
  };
}

test('arquiva e reativa entregável com evento na mesma transação, sem exclusão', async () => {
  const a = base();
  await a.service.alterarEntregavel(contratoId, entregavelId, true, ator);
  expect(a.entregue.arquivadoEm).toBeInstanceOf(Date);
  expect(a.repoEntregavel.save).toHaveBeenCalledTimes(1);
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    ator,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_ARQUIVADO,
      entidadeId: entregavelId,
    }),
  );
  await expect(
    a.service.alterarEntregavel(contratoId, entregavelId, true, ator),
  ).rejects.toBeInstanceOf(ConflictException);
  await a.service.alterarEntregavel(contratoId, entregavelId, false, ator);
  expect(a.entregue.arquivadoEm).toBeNull();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    ator,
    expect.objectContaining({ acao: AcaoAuditoria.ENTREGAVEL_REATIVADO }),
  );
});

test('arquiva somente a evidência selecionada; não apaga nem altera o entregável', async () => {
  const a = base();
  await a.service.alterarEvidencia(
    contratoId,
    entregavelId,
    evidenciaId,
    true,
    ator,
  );
  expect(a.esperada.arquivadoEm).toBeInstanceOf(Date);
  expect(a.entregue.arquivadoEm).toBeNull();
  expect(a.repoEvidencia.save).toHaveBeenCalledTimes(1);
  await a.service.alterarEvidencia(
    contratoId,
    entregavelId,
    evidenciaId,
    false,
    ator,
  );
  expect(a.esperada.arquivadoEm).toBeNull();
});

test('contrato arquivado ou item pai arquivado bloqueia nova escrita', async () => {
  const a = base();
  a.contrato.arquivadoEm = new Date();
  await expect(
    a.service.alterarEvidencia(
      contratoId,
      entregavelId,
      evidenciaId,
      true,
      ator,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  a.contrato.arquivadoEm = null;
  a.entregue.arquivadoEm = new Date();
  await expect(
    a.service.alterarEvidencia(
      contratoId,
      entregavelId,
      evidenciaId,
      true,
      ator,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});

test('IDs fora da relação contrato-entregável não são aceitos', async () => {
  const a = base();
  a.repoEntregavel.findOneBy.mockResolvedValueOnce(null as never);
  await expect(
    a.service.alterarEvidencia(
      contratoId,
      entregavelId,
      evidenciaId,
      true,
      ator,
    ),
  ).rejects.toBeInstanceOf(NotFoundException);
});

test('reativação recusa ultrapassar dez evidências ativas preservando item arquivado', async () => {
  const a = base();
  a.esperada.arquivadoEm = new Date();
  a.repoEvidencia.count.mockResolvedValueOnce(10);
  await expect(
    a.service.alterarEvidencia(
      contratoId,
      entregavelId,
      evidenciaId,
      false,
      ator,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(a.esperada.arquivadoEm).toBeInstanceOf(Date);
  expect(a.repoEvidencia.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});

test('consulta histórica mostra filhos preservados sob entregável arquivado sem reativá-los', async () => {
  const a = base();
  a.entregue.arquivadoEm = new Date('2026-11-06T12:00:00Z');
  await a.service.listarEvidenciasArquivadas(contratoId, entregavelId);
  expect(a.repoEvidencia.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { entregavelId },
    }),
  );
  expect(a.repoEvidencia.save).not.toHaveBeenCalled();
});

test('arquivar a última evidência pendente (1/2 → 1/1) conclui filho e etapa como efeito derivado auditado', async () => {
  const a = base();
  Object.assign(a.entregue, {
    etapaId: 'etapa-qa',
    statusExecucao: 'NAO_INICIADO',
    tipo: 'UNICO', percentualExecucao: 100,
    reabertoEm: null,
  });
  // A primeira consulta conta 1/1 verificada; a consulta EXISTS diz que
  // não existe filho nem evidência ativa em revisão.
  a.m.query.mockImplementation(async (sql: string) =>
    sql.includes('COUNT(DISTINCT')
      ? [
          {
            etapas: 1,
            entregaveis: 1,
            evidencias: 1,
            verificadas: 1,
            etapas_sem_entregavel: 0,
            entregaveis_sem_evidencia: 0,
          },
        ]
      : [{ pendentes: false }],
  );
  a.repoEvidencia.count.mockResolvedValue(0);
  const resultado = await a.service.alterarEvidencia(
    contratoId,
    entregavelId,
    evidenciaId,
    true,
    ator,
  );
  expect(resultado.conclusoes).toEqual(['entregável', 'etapa']);
  expect((a.entregue as Entregavel).statusExecucao).toBe('CONCLUIDO');
  expect(a.repoEntregavel.save).toHaveBeenCalled();
  expect(a.repoEtapa.save).toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    ator,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_STATUS_ALTERADO,
      dadosPosteriores: expect.objectContaining({
        motivo: 'COMPROVACAO_COMPLETA_APOS_ARQUIVAMENTO',
      }),
    }),
  );
});

test('arquivamento autorizado pode causar conclusão DERIVADA, mas não concede permissão de conclusão manual', async () => {
  const a = base();
  Object.assign(a.entregue, {
    etapaId: 'etapa-qa',
    statusExecucao: 'EM_ANDAMENTO',
    tipo: 'UNICO', percentualExecucao: 100,
    reabertoEm: null,
  });
  a.m.query.mockImplementation(async (sql: string) =>
    sql.includes('COUNT(DISTINCT')
      ? [
          {
            etapas: 1,
            entregaveis: 1,
            evidencias: 1,
            verificadas: 1,
            etapas_sem_entregavel: 0,
            entregaveis_sem_evidencia: 0,
          },
        ]
      : [{ pendentes: false }],
  );
  a.repoEvidencia.count.mockResolvedValue(0); // Nenhuma evidência ativa em revisão.
  const colaborador = { ...ator, perfil: PerfilUsuario.COLABORADOR };
  const resultado = await a.service.alterarEvidencia(
    contratoId,
    entregavelId,
    evidenciaId,
    true,
    colaborador,
  );
  expect(resultado.conclusoes).toEqual(['entregável', 'etapa']);
  expect((a.entregue as Entregavel).statusExecucao).toBe('CONCLUIDO');
  expect(a.repoEntregavel.save).toHaveBeenCalled();
  expect(a.repoEtapa.save).toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    colaborador,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA,
    }),
  );
});
