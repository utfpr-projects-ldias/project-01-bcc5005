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
  const contrato = { id: contratoId, arquivadoEm: null as Date | null, status: 'EM_EXECUCAO' };
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
  const repoUsuario = { findOne: jest.fn(async () => ({...ator,ativo:true})) };
  const repoAcl = { findOne: jest.fn(async () => ({podeEditar:false,permissoesDetalhadas:{arquivarEvidencias:true}})) };
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
      (entity as {name?:string})?.name === 'Usuario' ? repoUsuario
      : (entity as {name?:string})?.name === 'PermissaoContrato' ? repoAcl
      : entity === Contrato
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
    repoUsuario,
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

test('arquivar requisito não aprova automaticamente filho e etapa nem simula progresso', async () => {
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
  expect(resultado.conclusoes).toEqual([]);
  expect((a.entregue as Entregavel).statusExecucao).not.toBe('CONCLUIDO');
  expect(a.repoEntregavel.save).not.toHaveBeenCalled();
  expect(a.repoEtapa.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    ator,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA,
      dadosPosteriores: expect.objectContaining({ arquivadoEm: expect.any(Date) }),
    }),
  );
});

test('arquivamento de colaborador não concede permissão para aprovar conclusão operacional', async () => {
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
  a.repoUsuario.findOne.mockResolvedValueOnce({...colaborador,ativo:true});
  const resultado = await a.service.alterarEvidencia(
    contratoId,
    entregavelId,
    evidenciaId,
    true,
    colaborador,
  );
  expect(resultado.conclusoes).toEqual([]);
  expect((a.entregue as Entregavel).statusExecucao).not.toBe('CONCLUIDO');
  expect(a.repoEntregavel.save).not.toHaveBeenCalled();
  expect(a.repoEtapa.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    colaborador,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_ARQUIVADA,
    }),
  );
});


test('arquivamento não exige decisão dos registros e preserva solicitação própria', async () => {
  const a=base();
  Object.assign(a.entregue, {statusExecucao:'PENDENTE_CONCLUSAO', regularizacaoDocumentalSolicitada:true});
  a.m.query.mockResolvedValueOnce([{pendentes:true}]);
  await a.service.alterarEntregavel(contratoId,entregavelId,true,ator);
  expect(a.entregue).toMatchObject({arquivadoEm:expect.any(Date),statusExecucao:'PENDENTE_CONCLUSAO',regularizacaoDocumentalSolicitada:true});
  expect(a.m.query).not.toHaveBeenCalled();
  await a.service.alterarEntregavel(contratoId,entregavelId,false,ator);
  expect(a.entregue).toMatchObject({arquivadoEm:null,statusExecucao:'PENDENTE_CONCLUSAO',regularizacaoDocumentalSolicitada:true});
});

test('regularização parcial protege requisitos obrigatórios e permite arquivar evidência opcional sem contribuição', async () => {
  const a=base();
  a.contrato.status='CONCLUIDO_PARCIALMENTE';
  Object.assign(a.entregue,{statusExecucao:'CONCLUIDO_PARCIALMENTE',tipo:'UNICO'});
  Object.assign(a.esperada,{obrigatoria:true});
  await expect(a.service.alterarEvidencia(contratoId,entregavelId,evidenciaId,true,ator)).rejects.toThrow('Preserve a exigência obrigatória');
  Object.assign(a.esperada,{obrigatoria:false});
  a.m.query.mockResolvedValueOnce([{contribui:false}]);
  await a.service.alterarEvidencia(contratoId,entregavelId,evidenciaId,true,ator);
  expect(a.esperada.arquivadoEm).toBeInstanceOf(Date);
  expect(a.repoEntregavel.save).not.toHaveBeenCalled();
});
