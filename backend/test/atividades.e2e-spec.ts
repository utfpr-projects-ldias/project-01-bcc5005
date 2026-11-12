import 'reflect-metadata';
import { UnauthorizedException } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AtividadesController } from '../src/atividades/atividades.controller.js';
import { AtividadesService } from '../src/atividades/atividades.service.js';
import { AutorizacaoGuard } from '../src/autorizacao/autorizacao.guard.js';
import { PoliticaAcessoService } from '../src/autorizacao/politica-acesso.service.js';
import { ResolverEscopoContratoService } from '../src/autorizacao/resolver-escopo-contrato.service.js';
import { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/**
 * Teste HTTP do contrato de API, DTO e guard de produção, com dependências externas simuladas.
 * Não abre PostgreSQL, não usa segredos reais, não altera o ambiente e NÃO prova persistência.
 * Persistência verdadeira deve ser validada no QA real de HU08-05, em DEV isolado.
 */
describe('HU08 — contrato HTTP e segurança sem banco destrutivo', () => {
  const contratoId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const contratoAlheio = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const atividadeId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const entregavel1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const entregavel2 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  let app: INestApplication;
  let criar: ReturnType<typeof jest.fn>;
  let listar: ReturnType<typeof jest.fn>;

  function payload(ids: string[]) {
    return { contratoId, titulo: 'Vistoria', descricao: 'Inspeção do contrato',
      tipo: 'Vistoria', dataHora: '2026-11-09T13:30:00-03:00', entregavelIds: ids };
  }
  function post(contrato: string, corpo: object) {
    return request(app.getHttpServer())
      .post(`/contratos/${contrato}/atividades`)
      .set('Authorization', 'Bearer sessao-qa-local')
      .send(corpo);
  }

  beforeAll(async () => {
    criar = jest.fn(async (...args: unknown[]) => ({ id: atividadeId, ...((args[1] ?? {}) as object) }));
    listar = jest.fn(async (..._args: unknown[]) => ({ data: [], meta: { total: 0, page: 1, limit: 20, lastPage: 1 } }));
    const servico = { create: criar, findAllPaginated: listar,
      findOne: jest.fn(async () => ({ id: atividadeId, contratoId })),
      update: jest.fn(async () => ({ id: atividadeId, contratoId })) };
    const sessoes = { identificar: jest.fn(async (requisicao: { headers: Record<string, string | undefined> }) => {
      if (requisicao.headers.authorization !== 'Bearer sessao-qa-local') throw new UnauthorizedException();
      return 'sessao-qa-local';
    }) };
    const usuarios = { buscarAtivoPorSupertokensId: jest.fn(async () => ({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', supertokensUserId: 'sessao-qa-local',
      email: 'usuario@example.invalid', nome: 'Usuário de QA', perfil: PerfilUsuario.COLABORADOR,
    })) };
    const escopos = { resolver: jest.fn(async (
      escopo: { tipo: string }, parametros: Record<string, string>,
    ) => {
      if (escopo.tipo === 'contrato') return parametros.contratoId ?? null;
      return parametros.id === atividadeId && parametros.contratoId === contratoId ? contratoId : null;
    }) };
    const autorizacao = { permitido: jest.fn(async (_ator: unknown, _politica: unknown, contrato: string) => contrato === contratoId) };
    const modulo = await Test.createTestingModule({
      controllers: [AtividadesController],
      providers: [
        { provide: AtividadesService, useValue: servico },
        { provide: SessaoSuperTokensService, useValue: sessoes },
        { provide: UsuariosService, useValue: usuarios },
        { provide: PoliticaAcessoService, useValue: autorizacao },
        { provide: ResolverEscopoContratoService, useValue: escopos },
        AutorizacaoGuard,
        { provide: APP_GUARD, useExisting: AutorizacaoGuard },
      ],
    }).compile();
    app = modulo.createNestApplication();
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('aceita um ou dois entregáveis distintos, sem impor exatamente dois', async () => {
    expect((await post(contratoId, payload([entregavel1]))).status).toBe(201);
    expect((await post(contratoId, payload([entregavel1, entregavel2]))).status).toBe(201);
    expect(criar).toHaveBeenCalledTimes(2);
    expect(criar).toHaveBeenLastCalledWith(contratoId, expect.objectContaining({ entregavelIds: [entregavel1, entregavel2] }), expect.objectContaining({ perfil: PerfilUsuario.COLABORADOR }));
  });
  it('rejeita vínculos vazios, repetidos e ocorrenciaId antes da HU09', async () => {
    expect((await post(contratoId, payload([]))).status).toBe(400);
    expect((await post(contratoId, payload([entregavel1, entregavel1]))).status).toBe(400);
    expect((await post(contratoId, { ...payload([entregavel1]), ocorrenciaId: entregavel2 })).status).toBe(400);
  });
  it('nega leitura e escrita em outro contrato sem revelar dados', async () => {
    expect((await post(contratoAlheio, payload([entregavel1]))).status).toBe(404);
    const resposta = await request(app.getHttpServer())
      .get(`/contratos/${contratoAlheio}/atividades`).set('Authorization', 'Bearer sessao-qa-local');
    expect(resposta.status).toBe(404);
    expect(listar).not.toHaveBeenCalled();
  });
  it('nega sessão ausente e não chama o serviço de criação', async () => {
    const antes = criar.mock.calls.length;
    const resposta = await request(app.getHttpServer()).post(`/contratos/${contratoId}/atividades`)
      .send(payload([entregavel1]));
    expect(resposta.status).toBe(401);
    expect(criar.mock.calls.length).toBe(antes);
  });
  it('listagem retorna paginação, não consulta global', async () => {
    const resposta = await request(app.getHttpServer()).get(`/contratos/${contratoId}/atividades?page=1`)
      .set('Authorization', 'Bearer sessao-qa-local');
    expect(resposta.status).toBe(200);
    expect(resposta.body.meta.total).toBe(0);
    expect(listar).toHaveBeenCalledWith(contratoId, expect.objectContaining({ page: '1' }));
  });
});
