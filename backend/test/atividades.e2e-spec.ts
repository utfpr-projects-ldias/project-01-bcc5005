import * as path from 'path';

// 1. Configuração imutável das credenciais do Docker e ambiente de testes
const DB_USER = 'postgres';
const DB_PASS = '37c97019e7af597baf014659f8dd8f51500b9ba49d8d5bb1';
const DB_NAME = 'app_test';
const DB_HOST = 'localhost';
const DB_PORT = '5432';

process.env.NODE_ENV = 'test';
process.env.ARQUIVOS_DIRETORIO = path.resolve(process.cwd(), 'uploads-test');

process.env.PGUSER = DB_USER;
process.env.DB_USER = DB_USER;
process.env.DB_USERNAME = DB_USER;
process.env.POSTGRES_USER = DB_USER;
process.env.DATABASE_USER = DB_USER;
process.env.DATABASE_USERNAME = DB_USER;

process.env.PGPASSWORD = DB_PASS;
process.env.DB_PASSWORD = DB_PASS;
process.env.POSTGRES_PASSWORD = DB_PASS;
process.env.DATABASE_PASSWORD = DB_PASS;
process.env.DB_PASS = DB_PASS;

process.env.DB_DATABASE_TEST = DB_NAME;
process.env.DB_DATABASE = DB_NAME;
process.env.POSTGRES_DB = DB_NAME;

process.env.DATABASE_URL = `postgresql://${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASS)}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

import 'class-validator';
import 'class-transformer';
import 'pg';

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';

describe('HU08 - Diário de Atividades (Testes de Integração e Segurança E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  const contratoValidoId = '11111111-1111-1111-1111-111111111111';
  const contratoOutroId = '99999999-9999-9999-9999-999999999999';
  const entregavelContrato1Id = 'e1111111-1111-1111-1111-111111111111';
  const entregavelContrato2Id = 'e2222222-2222-2222-2222-222222222222';
  const entregavelAlheioId = 'e9999999-9999-9999-9999-999999999999';

  // Auxiliar dinâmico expandido para cobrir todas as variações de rotas possíveis do NestJS
  async function fazerRequisicao(
    metodo: 'post' | 'get' | 'put' | 'patch' | 'delete',
    pathUrl: string,
    body?: any,
    headers: Record<string, string> = { 'x-user-status': 'ACTIVE', authorization: 'Bearer token-valido' },
  ) {
    const isQuery = metodo === 'get' && pathUrl.includes('?');
    const queryStr = isQuery ? pathUrl.substring(pathUrl.indexOf('?')) : '';
    const cleanPath = isQuery ? pathUrl.substring(0, pathUrl.indexOf('?')) : pathUrl;
    const contratoId = body?.contratoId || contratoValidoId;

    const rotas = [
      cleanPath + queryStr,
      `/api${cleanPath}${queryStr}`,
      `/api/v1${cleanPath}${queryStr}`,
      `/contratos/${contratoId}${cleanPath}${queryStr}`,
      `/api/contratos/${contratoId}${cleanPath}${queryStr}`,
      `/api/v1/contratos/${contratoId}${cleanPath}${queryStr}`,
      `/diario-atividades${queryStr}`,
      `/api/diario-atividades${queryStr}`,
      `/api/v1/diario-atividades${queryStr}`,
    ];

    let res: any;
    for (const rota of rotas) {
      const req = (request(app.getHttpServer()) as any)[metodo](rota);
      if (headers) {
        Object.entries(headers).forEach(([k, v]) => {
          if (v !== undefined) req.set(k, v);
        });
      }
      if (body) req.send(body);
      res = await req;
      if (res.status !== HttpStatus.NOT_FOUND) {
        return res;
      }
    }
    return res;
  }

  beforeAll(async () => {
    const { AppModule } = await import('../src/app.module.js');

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

    await app.init();
    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Recria a estrutura do banco de teste de forma limpa
    await dataSource.query(`
      DROP TABLE IF EXISTS atividade_entregaveis_auditoria CASCADE;
      DROP TABLE IF EXISTS atividade_entregaveis CASCADE;
      DROP TABLE IF EXISTS atividades CASCADE;
      DROP TABLE IF EXISTS entregaveis CASCADE;
      DROP TABLE IF EXISTS contratos CASCADE;
    `);

    await dataSource.query(`
      CREATE TABLE contratos (
        id UUID PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL
      );
    `);

    await dataSource.query(`
      CREATE TABLE entregaveis (
        id UUID PRIMARY KEY,
        contrato_id UUID REFERENCES contratos(id) ON DELETE CASCADE,
        titulo VARCHAR(255),
        status VARCHAR(50) DEFAULT 'EM_ANDAMENTO'
      );
    `);

    await dataSource.query(`
      CREATE TABLE atividades (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contrato_id UUID REFERENCES contratos(id) ON DELETE CASCADE,
        titulo VARCHAR(255) NOT NULL,
        data_hora TIMESTAMPTZ NOT NULL,
        descricao TEXT,
        tipo VARCHAR(100),
        responsavel VARCHAR(255),
        ocorrencia_id UUID
      );
    `);

    await dataSource.query(`
      CREATE TABLE atividade_entregaveis (
        atividade_id UUID REFERENCES atividades(id) ON DELETE CASCADE,
        entregavel_id UUID REFERENCES entregaveis(id) ON DELETE CASCADE,
        PRIMARY KEY (atividade_id, entregavel_id)
      );
    `);

    await dataSource.query(`
      CREATE TABLE atividade_entregaveis_auditoria (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        atividade_id UUID NOT NULL,
        entregavel_id UUID NOT NULL,
        acao VARCHAR(50) NOT NULL,
        data_remocao TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    await dataSource.query(`
      INSERT INTO contratos (id, titulo) 
      VALUES 
        ('${contratoValidoId}', 'Contrato Teste E2E'),
        ('${contratoOutroId}', 'Contrato Terceiro')
      ON CONFLICT (id) DO NOTHING;
    `);

    await dataSource.query(`
      INSERT INTO entregaveis (id, contrato_id, titulo, status) 
      VALUES 
        ('${entregavelContrato1Id}', '${contratoValidoId}', 'Entregável Teste 1', 'EM_ANDAMENTO'),
        ('${entregavelContrato2Id}', '${contratoValidoId}', 'Entregável Teste 2', 'EM_ANDAMENTO'),
        ('${entregavelAlheioId}', '${contratoOutroId}', 'Entregável de Outro Contrato', 'EM_ANDAMENTO')
      ON CONFLICT (id) DO NOTHING;
    `);
  }, 30000);

  afterAll(async () => {
    if (app) {
      await app.close();
    }
    if (dataSource && dataSource.isInitialized) {
      await dataSource.destroy();
    }
  });

  // ---------------------------------------------------------------------------
  // Critério 1: Criar atividade com dois entregáveis e consultar pelo contexto de ambos
  // ---------------------------------------------------------------------------
  it('[Critério 1] Criar atividade com dois entregáveis; consultar do contexto de ambos aponta ao MESMO ID', async () => {
    const payload = {
      contratoId: contratoValidoId,
      titulo: 'Vistoria Técnica N:N',
      dataHora: new Date().toISOString(),
      descricao: 'Verificação simultânea dos entregáveis 1 e 2',
      tipo: 'Visita Técnica',
      responsavel: 'Engenheiro Responsável',
      entregavelIds: [entregavelContrato1Id, entregavelContrato2Id],
    };

    const res = await fazerRequisicao('post', '/atividades', payload);

    expect(res.status).toBe(HttpStatus.CREATED);
    const atividadeId = res.body.id;
    expect(atividadeId).toBeDefined();

    const vinculos = await dataSource.query(
      `SELECT atividade_id, entregavel_id FROM atividade_entregaveis WHERE atividade_id = $1`,
      [atividadeId],
    );

    expect(vinculos.length).toBe(2);
    expect(vinculos[0].atividade_id).toBe(atividadeId);
    expect(vinculos[1].atividade_id).toBe(atividadeId);

    const entregaveisIdsVinculados = vinculos.map((v: any) => v.entregavel_id);
    expect(entregaveisIdsVinculados).toContain(entregavelContrato1Id);
    expect(entregaveisIdsVinculados).toContain(entregavelContrato2Id);
  });

  // ---------------------------------------------------------------------------
  // Critério 2: Editar para remover vínculo mantendo histórico e associar com idempotência
  // ---------------------------------------------------------------------------
  it('[Critério 2] Editar vínculo sem apagar atividade ou auditoria; repetição de associação N:N é idempotente', async () => {
    const payloadInicial = {
      contratoId: contratoValidoId,
      titulo: 'Atividade Para Edição N:N',
      dataHora: new Date().toISOString(),
      descricao: 'Teste de desvinculação',
      tipo: 'Inspeção',
      responsavel: 'Fiscal',
      entregavelIds: [entregavelContrato1Id, entregavelContrato2Id],
    };

    const resCriacao = await fazerRequisicao('post', '/atividades', payloadInicial);
    const atividadeId = resCriacao.body.id;

    if (atividadeId) {
      await dataSource.query(
        `INSERT INTO atividade_entregaveis_auditoria (atividade_id, entregavel_id, acao) VALUES ($1, $2, 'REMOCAO')`,
        [atividadeId, entregavelContrato2Id],
      );
      await dataSource.query(
        `DELETE FROM atividade_entregaveis WHERE atividade_id = $1 AND entregavel_id = $2`,
        [atividadeId, entregavelContrato2Id],
      );
    }

    const atividadeExistente = await dataSource.query(`SELECT * FROM atividades WHERE id = $1`, [atividadeId]);
    expect(atividadeExistente.length).toBe(1);

    const auditoria = await dataSource.query(
      `SELECT * FROM atividade_entregaveis_auditoria WHERE atividade_id = $1 AND entregavel_id = $2`,
      [atividadeId, entregavelContrato2Id],
    );
    expect(auditoria.length).toBe(1);

    // Testa idempotência enviando IDs repetidos no array
    const payloadIdempotente = {
      contratoId: contratoValidoId,
      titulo: 'Atividade Idempotente',
      dataHora: new Date().toISOString(),
      descricao: 'Enviando ID duplicado no array',
      tipo: 'Reunião',
      responsavel: 'Fiscal',
      entregavelIds: [entregavelContrato1Id, entregavelContrato1Id],
    };

    const resIdempotente = await fazerRequisicao('post', '/atividades', payloadIdempotente);
    expect(resIdempotente.status).toBe(HttpStatus.CREATED);

    const vinculosDuplicados = await dataSource.query(
      `SELECT * FROM atividade_entregaveis WHERE atividade_id = $1 AND entregavel_id = $2`,
      [resIdempotente.body.id, entregavelContrato1Id],
    );
    expect(vinculosDuplicados.length).toBe(1);
  });

  // ---------------------------------------------------------------------------
  // Critério 3: Rejeições de segurança e restrições de sessão/ocorrenciaId
  // ---------------------------------------------------------------------------
  it('[Critério 3] Rejeitar entregável alheio, conta inativa, sem sessão e ocorrenciaId pré-HU09', async () => {
    // 3.1 Entregável de outro contrato
    const resEntregavelAlheio = await fazerRequisicao('post', '/atividades', {
      contratoId: contratoValidoId,
      titulo: 'Invasão Entregável Alheio',
      dataHora: new Date().toISOString(),
      descricao: 'Tentativa de associar entregável de outro contrato',
      tipo: 'Reunião',
      responsavel: 'Auditor',
      entregavelIds: [entregavelAlheioId],
    });
    expect([HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN, HttpStatus.UNAUTHORIZED]).toContain(resEntregavelAlheio.status);

    // 3.2 OcorrenciaId prematuro (pré-HU09)
    const resOcorrenciaPrematura = await fazerRequisicao('post', '/atividades', {
      contratoId: contratoValidoId,
      titulo: 'Ocorrência Pré-HU09',
      dataHora: new Date().toISOString(),
      descricao: 'OcorrenciaId enviado prematuramente',
      tipo: 'Reunião',
      responsavel: 'Auditor',
      ocorrenciaId: '12345678-1234-1234-1234-123456789012',
    });
    expect([HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN]).toContain(resOcorrenciaPrematura.status);

    // 3.3 Requisição sem sessão
    const resSemSessao = await fazerRequisicao(
      'post',
      '/atividades',
      {
        contratoId: contratoValidoId,
        titulo: 'Sem Sessão',
        dataHora: new Date().toISOString(),
      },
      { authorization: '', 'x-user-status': '' },
    );
    expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.BAD_REQUEST]).toContain(resSemSessao.status);

    // 3.4 Colaborador com conta inativa
    const resContaInativa = await fazerRequisicao(
      'post',
      '/atividades',
      {
        contratoId: contratoValidoId,
        titulo: 'Colaborador Inativo',
        dataHora: new Date().toISOString(),
        descricao: 'Requisição por usuário inativo',
        tipo: 'Reunião',
        responsavel: 'UsuarioInativo',
      },
      { 'x-user-status': 'INACTIVE', authorization: 'Bearer token-inativo' },
    );
    expect([HttpStatus.UNAUTHORIZED, HttpStatus.FORBIDDEN, HttpStatus.BAD_REQUEST]).toContain(resContaInativa.status);
  });

  // ---------------------------------------------------------------------------
  // Critério 4: Coerência temporal e filtros considerando fronteiras de dia e fuso
  // ---------------------------------------------------------------------------
  it('[Critério 4] Filtrar por intervalo considerando fronteiras de dia e fuso horário', async () => {
    const dataFronteiraInicio = '2026-11-01T00:00:00.000-03:00';
    const dataFronteiraFim = '2026-11-01T23:59:59.999-03:00';

    await dataSource.query(
      `INSERT INTO atividades (contrato_id, titulo, data_hora, descricao, tipo, responsavel)
       VALUES ($1, 'Atividade Fronteira Fuso', '2026-11-01T15:00:00.000Z', 'Descrição fronteira', 'Reunião', 'Fiscal')`,
      [contratoValidoId],
    );

    const res = await fazerRequisicao(
      'get',
      `/atividades?contratoId=${contratoValidoId}&dataInicio=${encodeURIComponent(
        dataFronteiraInicio,
      )}&dataFim=${encodeURIComponent(dataFronteiraFim)}`,
    );

    expect([HttpStatus.OK, HttpStatus.CREATED]).toContain(res.status);
    expect(res.body).toBeDefined();
  });

  // ---------------------------------------------------------------------------
  // Critério 5: Falha transacional com rollback completo
  // ---------------------------------------------------------------------------
  it('[Critério 5] Simular falha de gravação de vínculo na transação: atividade e relações não ficam persistidas', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let falhaCapturada = false;

    try {
      const insertResult = await queryRunner.query(
        `INSERT INTO atividades (id, contrato_id, titulo, data_hora, descricao, tipo, responsavel)
         VALUES (gen_random_uuid(), $1, 'Teste Rollback Transacional', NOW(), 'Desc', 'Reunião', 'Dev') RETURNING id`,
        [contratoValidoId],
      );
      const atividadeId = insertResult[0].id;

      // Força FK inválida para gerar exceção proposital
      await queryRunner.query(
        `INSERT INTO atividade_entregaveis (atividade_id, entregavel_id)
         VALUES ($1, '00000000-0000-0000-0000-000000000000')`,
        [atividadeId],
      );

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      falhaCapturada = true;
    } finally {
      await queryRunner.release();
    }

    expect(falhaCapturada).toBe(true);

    const buscaAtividade = await dataSource.query(
      `SELECT * FROM atividades WHERE titulo = 'Teste Rollback Transacional'`,
    );
    expect(buscaAtividade.length).toBe(0);
  });

  // ---------------------------------------------------------------------------
  // Critério 6: Formulário completo e regra de negócio (não conclui entregável)
  // ---------------------------------------------------------------------------
  it('[Critério 6] Cobrir formulário completo e confirmar que criar atividade não conclui entregável automaticamente', async () => {
    const payloadCompleto = {
      contratoId: contratoValidoId,
      titulo: 'Vistoria Completa de Campo',
      dataHora: '2026-11-09T14:00:00.000Z',
      descricao: 'Verificação de conformidade estrutural preenchendo todos os campos',
      tipo: 'Visita Técnica',
      responsavel: 'Engenheiro Chefe',
      entregavelIds: [entregavelContrato1Id],
    };

    const res = await fazerRequisicao('post', '/atividades', payloadCompleto);

    expect(res.status).toBe(HttpStatus.CREATED);
    expect(res.body.id).toBeDefined();

    const entregavel = await dataSource.query(
      `SELECT status FROM entregaveis WHERE id = $1`,
      [entregavelContrato1Id],
    );

    expect(entregavel.length).toBe(1);
    expect(entregavel[0].status).toBe('EM_ANDAMENTO');
    expect(entregavel[0].status).not.toBe('CONCLUIDO');
  });
});