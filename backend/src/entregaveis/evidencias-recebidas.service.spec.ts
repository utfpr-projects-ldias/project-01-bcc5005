import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { EvidenciaEsperada } from './evidencia-esperada.entity.js';
import { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';
import { EventoAuditoria } from '../auditoria/evento-auditoria.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { EvidenciasRecebidasService } from './evidencias-recebidas.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const entregavelId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const esperadaId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const comprovanteId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const autorId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const gestorId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const gestor: UsuarioAutenticado = {
  id: gestorId,
  perfil: PerfilUsuario.GESTOR,
  supertokensUserId: 'st-gestor',
  email: 'gestor@example.org',
};
const autor: UsuarioAutenticado = {
  id: autorId,
  perfil: PerfilUsuario.ADMINISTRADOR,
  supertokensUserId: 'st-admin',
  email: 'admin@example.org',
};
function cenario() {
  const status = {
    id: comprovanteId,
    contratoId,
    entregavelId,
    evidenciaEsperadaId: esperadaId,
    autorId,
    status: 'PENDENTE_VERIFICACAO' as const,
    verificadoPor: null,
    verificadoEm: null,
    nomeOriginal: 'qa.txt',
    tipoMime: 'text/plain',
    tamanho: 7,
    descricao: null,
    criadoEm: new Date('2026-11-03T21:00:00Z'),
  } as ComprovanteEvidencia;
  const esperado = {
    id: esperadaId,
    entregavelId,
    tipoEvidencia: 'Relatório',
    descricao: 'Planejado',
    obrigatoria: true,
  } as EvidenciaEsperada;
  const entregavel = {
    id: entregavelId,
    contratoId,
    responsavelId: null,
  } as Entregavel;
  const queryContrato = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => ({ id: contratoId, arquivadoEm: null })),
  };
  const queryComprovante = {
    setLock: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    addOrderBy: jest.fn().mockReturnThis(),
    getOne: jest.fn(async () => status as ComprovanteEvidencia | null),
  };
  const contrato = {
    id: contratoId,
    status: 'PLANEJAMENTO',
    arquivadoEm: null,
    reabertoEm: null as Date | null,
  };
  const contratos = {
    createQueryBuilder: jest.fn(() => queryContrato),
    findOne: jest.fn(async () => contrato),
    findOneBy: jest.fn(async () => contrato),
    save: jest.fn(async (d: unknown) => d),
  };
  const etapas = {
    findOneBy: jest.fn(async () => ({
      id: 'etapa-qa',
      contratoId,
      status: 'PLANEJADA',
      arquivadoEm: null as Date | null,
      reabertoEm: null as Date | null,
    })),

    save: jest.fn(async (d: unknown) => d),
  };
  const entregaveis = {
    findOneBy: jest.fn(async () => entregavel),
    save: jest.fn(async (d: unknown) => d),
  };
  const esperadas = {
    findOneBy: jest.fn(async () => esperado),
    update: jest.fn(async () => ({ affected: 1 })),
    count: jest.fn(async () => 0),
    create: jest.fn((d: unknown) => d),
    save: jest.fn(async (d: unknown) => d),
  };
  const comprovantes = {
    createQueryBuilder: jest.fn(() => queryComprovante),
    findOne: jest.fn(async () => null as ComprovanteEvidencia | null),
    save: jest.fn(async (d: unknown) => d),
    find: jest.fn(async () => [status]),
  };
  const vinculos = {
    findOneBy: jest.fn(async () => ({
      contratoId,
      usuarioId: gestorId,
      podeEditar: true,
    })),
  };
  const eventos = {
    find: jest.fn(async () => [
      {
        id: 'evento1',
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO,
        dadosAnteriores: null,
        dadosPosteriores: { evidenciaEsperadaId: esperadaId, comprovanteId },
        atorSupertokensUserId: 'st-admin',
        registradoEm: new Date('2026-11-03T21:01:00Z'),
      },
      {
        id: 'evento2',
        acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_ENVIADO,
        dadosAnteriores: null,
        dadosPosteriores: { evidenciaEsperadaId: 'outro-id' },
        atorSupertokensUserId: 'st-admin',
        registradoEm: new Date('2026-11-03T20:01:00Z'),
      },
    ]),
  };
  const usuarios = {
    find: jest.fn(async () => [
      {
        id: autorId,
        supertokensUserId: 'st-admin',
        nome: 'Administrador de QA',
        email: 'admin@example.org',
      },
    ]),
  };
  const m = {
    query: jest.fn(async () => [
      {
        etapas: 0,
        entregaveis: 0,
        evidencias: 0,
        verificadas: 0,
        etapas_sem_entregavel: 0,
        entregaveis_sem_evidencia: 0,
      },
    ]),
    getRepository: jest.fn((e: unknown) => {
      if (e === EventoAuditoria) return eventos;
      if (e === Usuario) return usuarios;
      if (e === Contrato) return contratos;
      if (e === Etapa) return etapas;
      if (e === Entregavel) return entregaveis;
      if (e === EvidenciaEsperada) return esperadas;
      if (e === ComprovanteEvidencia) return comprovantes;
      return vinculos;
    }),
  };
  const db = {
    manager: m,
    getRepository: m.getRepository,
    transaction: jest.fn(async (fn: (v: typeof m) => Promise<unknown>) =>
      fn(m),
    ),
  };
  const auditoria = { registrarNaTransacao: jest.fn(async () => undefined) };
  const storage = {
    salvar: jest.fn(),
    ler: jest.fn(),
    confirmarPersistencia: jest.fn(),
    removerOrfao: jest.fn(),
  };
  const service = new EvidenciasRecebidasService(
    comprovantes as never,
    db as never,
    auditoria as never,
    storage as never,
  );
  return {
    service,
    db,
    auditoria,
    storage,
    status,
    m,
    queryComprovante,
    queryContrato,
    esperadas,
    comprovantes,
    vinculos,
    entregavel,
    entregaveis,
    etapas,
    contratos,
    contrato,
    eventos,
    usuarios,
  };
}

test('ADMIN autorizado pode verificar seu próprio envio e registra autoria da verificação', async () => {
  const { service, auditoria } = cenario();
  const retorno = await service.verificar(
    contratoId,
    entregavelId,
    esperadaId,
    comprovanteId,
    autor,
  );
  expect(retorno.status).toBe('VERIFICADA');
  expect(retorno.verificadoPor).toBe(autorId);
  expect(auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    expect.anything(),
    autor,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO,
    }),
  );
});

test('verificar última evidência conclui entregável e etapa; contrato exige aceite explícito', async () => {
  const a = cenario();
  a.entregavel.etapaId = 'etapa-qa';
  a.m.query.mockResolvedValue([
    {
      etapas: 1,
      entregaveis: 1,
      evidencias: 1,
      verificadas: 1,
      etapas_sem_entregavel: 0,
      entregaveis_sem_evidencia: 0,
    },
  ]);
  const resultado = await a.service.verificar(
    contratoId,
    entregavelId,
    esperadaId,
    comprovanteId,
    autor,
  );
  expect(resultado.conclusoes).toEqual(['entregável', 'etapa']);
  expect(a.entregaveis.save).toHaveBeenCalledWith(
    expect.objectContaining({ statusExecucao: 'CONCLUIDO' }),
  );
  expect(a.etapas.save).toHaveBeenCalledWith(
    expect.objectContaining({ status: 'CONCLUIDA' }),
  );
  expect(a.contratos.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalledWith(
    a.m,
    autor,
    expect.objectContaining({ acao: AcaoAuditoria.CONTRATO_STATUS_ALTERADO }),
  );
});

test('etapa arquivada impede verificar e reabrir evidência mesmo com autorização', async () => {
  const a = cenario();

  a.entregavel.etapaId = 'etapa-qa';

  a.etapas.findOneBy.mockResolvedValue({
    id: 'etapa-qa',
    contratoId,
    arquivadoEm: new Date(),
    reabertoEm: null,
    status: 'PLANEJADA',
  });

  await expect(
    a.service.verificar(
      contratoId,
      entregavelId,
      esperadaId,
      comprovanteId,
      autor,
    ),
  ).rejects.toBeInstanceOf(ConflictException);

  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();

  await expect(
    a.service.reabrir(contratoId, entregavelId, esperadaId, autor),
  ).rejects.toBeInstanceOf(ConflictException);
});
test('gestor com vínculo de edição verifica em transação e registra auditoria', async () => {
  const a = cenario();
  const salvo = await a.service.verificar(
    contratoId,
    entregavelId,
    esperadaId,
    comprovanteId,
    gestor,
  );
  expect(salvo.status).toBe('VERIFICADA');
  expect(salvo.verificadoPor).toBe(gestorId);
  expect(salvo).not.toHaveProperty('storageKey');
  expect(a.queryComprovante.setLock).toHaveBeenCalledWith('pessimistic_write');
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    a.m,
    gestor,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_COMPROVANTE_VERIFICADO,
      entidadeTipo: 'ENTREGAVEL',
      entidadeId: entregavelId,
    }),
  );
});

test('nova verificação encerra entregável e etapa; contrato reaberto depende de conclusão manual', async () => {
  const a = cenario();
  a.entregavel.etapaId = 'etapa-qa';
  a.entregavel.reabertoEm = new Date('2026-11-05T10:00:00Z');
  a.entregavel.statusExecucao = StatusExecucaoEntregavel.EM_ANDAMENTO;
  const etapa = {
    id: 'etapa-qa',
    contratoId,
    status: 'EM_ANDAMENTO',
    reabertoEm: new Date('2026-11-05T10:00:00Z'),
    arquivadoEm: null,
  };
  a.etapas.findOneBy.mockImplementation(async () => etapa);
  a.contrato.reabertoEm = new Date('2026-11-05T10:00:00Z');
  a.m.query.mockResolvedValue([
    {
      etapas: 1,
      entregaveis: 1,
      evidencias: 1,
      verificadas: 1,
      etapas_sem_entregavel: 0,
      entregaveis_sem_evidencia: 0,
    },
  ]);
  const resultado = await a.service.verificar(
    contratoId,
    entregavelId,
    esperadaId,
    comprovanteId,
    autor,
  );
  expect(resultado.conclusoes).toEqual(['entregável', 'etapa']);
  expect(a.entregavel.reabertoEm).toBeNull();
  expect(etapa.reabertoEm).toBeNull();
  expect(a.contrato.reabertoEm).toEqual(new Date('2026-11-05T10:00:00Z'));
  expect(a.contratos.save).not.toHaveBeenCalled();
});

test('vínculo somente leitura não concede verificação ao gestor', async () => {
  const a = cenario();
  a.vinculos.findOneBy.mockResolvedValueOnce({
    contratoId,
    usuarioId: gestorId,
    podeEditar: false,
  });
  await expect(
    a.service.verificar(
      contratoId,
      entregavelId,
      esperadaId,
      comprovanteId,
      gestor,
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
});

test('versão anterior não pode ser verificada após novo envio', async () => {
  const a = cenario();
  await expect(
    a.service.verificar(
      contratoId,
      entregavelId,
      esperadaId,
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab',
      gestor,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
});

test('a edição individual preserva obrigatoriedade e não substitui o checklist', async () => {
  const a = cenario();
  const saida = await a.service.editarEsperada(
    contratoId,
    entregavelId,
    esperadaId,
    { descricao: 'Descrição ajustada' },
    gestor,
  );
  expect(saida.obrigatoria).toBe(true);
  expect(saida.descricao).toBe('Descrição ajustada');
  expect(a.esperadas.save).toHaveBeenCalledTimes(1);
  expect(a.auditoria.registrarNaTransacao).toHaveBeenCalledWith(
    a.m,
    gestor,
    expect.objectContaining({
      acao: AcaoAuditoria.ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA,
    }),
  );
});

test('gestor sem delegação explícita não pode tornar evidência opcional', async () => {
  const a = cenario();
  await expect(
    a.service.editarEsperada(
      contratoId,
      entregavelId,
      esperadaId,
      { obrigatoria: false },
      gestor,
    ),
  ).rejects.toBeInstanceOf(ForbiddenException);
  expect(a.esperadas.save).not.toHaveBeenCalled();
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});

test('ADMIN pode alterar a obrigatoriedade de uma única evidência', async () => {
  const a = cenario();
  const saida = await a.service.editarEsperada(
    contratoId,
    entregavelId,
    esperadaId,
    { obrigatoria: false },
    autor,
  );
  expect(saida.obrigatoria).toBe(false);
  expect(a.esperadas.save).toHaveBeenCalledTimes(1);
});

test('detalhe atribui autoria/consulta somente eventos da evidência corrente, sem vazar outra', async () => {
  const a = cenario();
  const resultado = await a.service.detalhar(
    contratoId,
    entregavelId,
    esperadaId,
    autor,
  );
  expect(resultado.versoes).toHaveLength(1);
  expect(resultado.versoes[0].enviadoPor).toEqual({
    nome: 'Administrador de QA',
    email: 'admin@example.org',
  });
  expect(resultado.historico).toHaveLength(1);
  expect(resultado.historico[0].id).toBe('evento1');
  expect(resultado.historico[0].nomeArquivo).toBe('qa.txt');
  expect(resultado.historico[0].ator).toEqual({
    nome: 'Administrador de QA',
    email: 'admin@example.org',
  });
  expect(resultado.podeVerificar).toBe(true);
  expect(a.eventos.find).toHaveBeenCalledWith(
    expect.objectContaining({
      where: {
        contratoId,
        entidadeTipo: 'ENTREGAVEL',
        entidadeId: entregavelId,
      },
    }),
  );
});

test('cadastro exige limite de dez evidências incluindo itens arquivados', async () => {
  const a = cenario();
  a.esperadas.count.mockResolvedValue(10);
  await expect(
    a.service.criarEsperada(
      contratoId,
      entregavelId,
      { tipoEvidencia: 'Foto', obrigatoria: true },
      autor,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(a.esperadas.save).not.toHaveBeenCalled();
  expect(a.esperadas.count).toHaveBeenCalledWith({ where: { entregavelId } });
});

test('novo tipo Foto recusa texto antes de gravar blob; registros antigos continuam compatíveis', async () => {
  const a = cenario();
  a.esperadas.findOneBy.mockResolvedValue({
    id: esperadaId,
    entregavelId,
    tipoEvidencia: 'Foto',
    obrigatoria: true,
  } as never);
  const arquivo = {
    originalname: 'texto.txt',
    mimetype: 'text/plain',
    buffer: Buffer.from('qa'),
    size: 2,
  };
  await expect(
    a.service.enviar(contratoId, entregavelId, esperadaId, arquivo, {}, autor),
  ).rejects.toBeInstanceOf(BadRequestException);
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});

test('comprovante já verificado não pode receber nova versão nem substituir o arquivo', async () => {
  const a = cenario();
  const bloqueado = {
    ...a.status,
    status: 'VERIFICADA' as const,
  } as ComprovanteEvidencia;
  a.queryComprovante.getOne.mockResolvedValueOnce(bloqueado);
  a.storage.salvar.mockResolvedValueOnce({
    chave: 'a'.repeat(32),
    tokenCompensacao: 's'.repeat(64),
    nomeOriginal: 'novo.txt',
    mimeEfetivo: 'text/plain',
    tamanho: 7,
    sha256: 'b'.repeat(64),
  } as never);
  await expect(
    a.service.enviar(
      contratoId,
      entregavelId,
      esperadaId,
      {
        buffer: Buffer.from('novo QA'),
        size: 7,
        originalname: 'novo.txt',
        mimetype: 'text/plain',
      },
      {},
      autor,
    ),
  ).rejects.toBeInstanceOf(ConflictException);
  expect(a.comprovantes.save).not.toHaveBeenCalled();
  expect(a.storage.removerOrfao).toHaveBeenCalledTimes(1);
  expect(a.auditoria.registrarNaTransacao).not.toHaveBeenCalled();
});
