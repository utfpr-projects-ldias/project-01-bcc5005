import { Test, type TestingModule } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';

import { AppModule } from '../src/app.module.js';
import { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { ContratosService } from '../src/contratos/contratos.service.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/** HTTP real (Nest + ValidationPipe + guard), serviços e sessão simulados.
 * NÃO cobre a transação PostgreSQL ou sessão real do SuperTokens.
 */
describe('Contratos API — validação e autorização HTTP', () => {
  let app: INestApplication;
  const identificar = jest.fn<() => Promise<string>>();
  const usuario = jest.fn<() => Promise<unknown>>();
  const criar = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const listar = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const detalhar = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const atualizar = jest.fn<(...args: unknown[]) => Promise<unknown>>();
  const idContrato = '11111111-1111-4111-8111-111111111111';
  const body = {
    numeroContrato: '2026/001',
    orgaoContratante: 'UTFPR',
    objeto: 'Prestação de serviços',
    inicioVigencia: '2026-10-17',
    terminoVigencia: '2027-10-16',
    status: 'PLANEJAMENTO',
    modoCalculo: 'SIMPLES',
  };

  beforeAll(async () => {
    const fixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessaoSuperTokensService).useValue({ identificar })
      .overrideProvider(UsuariosService).useValue({ buscarAtivoPorSupertokensId: usuario })
      .overrideProvider(ContratosService).useValue({ criar, listar, detalhar, atualizar })
      .compile();
    app = fixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    jest.resetAllMocks();
    identificar.mockResolvedValue('st-admin');
    usuario.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      supertokensUserId: 'st-admin',
      email: 'admin@empresa.test',
      perfil: PerfilUsuario.ADMINISTRADOR,
      ativo: true,
    });
    criar.mockResolvedValue({ ...body, id: idContrato });
    listar.mockResolvedValue([]);
    detalhar.mockResolvedValue({ ...body, id: idContrato });
    atualizar.mockResolvedValue({ ...body, id: idContrato, status: 'EM_EXECUCAO' });
  });

  it('401: anônimo não acessa a listagem', async () => {
    identificar.mockRejectedValue(new UnauthorizedException());
    await request(app.getHttpServer()).get('/contratos').expect(401);
    expect(listar).not.toHaveBeenCalled();
  });

  it('403: usuário sem registro ativo não acessa contratos', async () => {
    usuario.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/contratos').expect(403);
    expect(listar).not.toHaveBeenCalled();
  });

  it.each([PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR])(
    '403: %s não realiza listagem global', async (perfil) => {
      usuario.mockResolvedValue({
        id: '33333333-3333-4333-8333-333333333333',
        supertokensUserId: 'st-usuario',
        email: 'usuario@empresa.test', perfil, ativo: true,
      });
      await request(app.getHttpServer()).get('/contratos').expect(403);
      expect(listar).not.toHaveBeenCalled();
    },
  );

  it('201: Administrador cria contrato validado pelo DTO', async () => {
    const resposta = await request(app.getHttpServer())
      .post('/contratos').send(body).expect(201);
    expect(resposta.body).toMatchObject({ id: idContrato, numeroContrato: body.numeroContrato });
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('400: dados financeiros extras e enum inválido são rejeitados', async () => {
    await request(app.getHttpServer()).post('/contratos')
      .send({ ...body, valorContrato: 100 }).expect(400);
    await request(app.getHttpServer()).post('/contratos')
      .send({ ...body, status: 'DESCONHECIDO' }).expect(400);
    expect(criar).not.toHaveBeenCalled();
  });

  it('200: Administrador lista e detalha contrato existente', async () => {
    await request(app.getHttpServer()).get('/contratos').expect(200);
    await request(app.getHttpServer()).get(`/contratos/${idContrato}`).expect(200);
    expect(listar).toHaveBeenCalledTimes(1);
    expect(detalhar).toHaveBeenCalledTimes(1);
  });

  it('200: PATCH aceita alteração parcial de status', async () => {
    await request(app.getHttpServer()).patch(`/contratos/${idContrato}`)
      .send({ status: 'EM_EXECUCAO' }).expect(200);
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it('404: UUID inválido não revela se existe contrato', async () => {
    await request(app.getHttpServer()).get('/contratos/invalido').expect(404);
    expect(detalhar).not.toHaveBeenCalled();
  });
});
