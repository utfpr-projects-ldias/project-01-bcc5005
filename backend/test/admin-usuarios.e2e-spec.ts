import { Test, type TestingModule } from '@nestjs/testing';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { jest } from '@jest/globals';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { UsuariosService } from '../src/usuarios/usuarios.service.js';
import { AdministracaoUsuariosService } from '../src/usuarios/administracao-usuarios.service.js';
import { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/** E2E HTTP do guard + validação; sessão simulada. Fluxo SuperTokens REAL: guia manual. */
describe('TEC07-04 - API admin (E2E)', () => {
  let app: INestApplication;
  const identificar = jest.fn<() => Promise<string>>();
  const usuario = jest.fn<() => Promise<unknown>>();
  const criar = jest.fn<() => Promise<unknown>>();
  const listar = jest.fn<() => Promise<unknown>>();
  const atualizar = jest.fn<() => Promise<unknown>>();
  const buscarPorId = jest.fn<() => Promise<unknown>>();
  const body = {
    nome: 'Funcionario de Teste', email: 'funcionario@empresa.test', perfil: PerfilUsuario.COLABORADOR,
    senhaInicial: 'SenhaForte!1234',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(SessaoSuperTokensService).useValue({ identificar })
      .overrideProvider(UsuariosService).useValue({ buscarAtivoPorSupertokensId: usuario })
      .overrideProvider(AdministracaoUsuariosService).useValue({ criar, listar, atualizar, buscarPorId })
      .compile();
    app = moduleFixture.createNestApplication();
    await app.init();
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    jest.resetAllMocks();
    identificar.mockResolvedValue('st-id');
    usuario.mockResolvedValue({ id: 'u1', supertokensUserId: 'st-id', email: 'adm@empresa.test', perfil: PerfilUsuario.ADMINISTRADOR, ativo: true });
    criar.mockResolvedValue({ id: 'u2', email: body.email, perfil: body.perfil, ativo: true });
    listar.mockResolvedValue([]);
    atualizar.mockResolvedValue({ id: "b2b28766-c374-43b0-b2b6-3e84608d3ca1", nome: "Pessoa de Teste", perfil: PerfilUsuario.GESTOR, ativo: false });
    buscarPorId.mockResolvedValue({ id: "b2b28766-c374-43b0-b2b6-3e84608d3ca1", email: "funcionario@empresa.test", perfil: PerfilUsuario.GESTOR, ativo: true });
  });

  it('401: sem sessão não cria conta', async () => {
    identificar.mockRejectedValue(new UnauthorizedException());
    await request(app.getHttpServer()).post('/admin/usuarios').send(body).expect(401);
    expect(criar).not.toHaveBeenCalled();
  });

  it.each([PerfilUsuario.GESTOR, PerfilUsuario.COLABORADOR])('403: %s não cria funcionário', async (perfil) => {
    usuario.mockResolvedValue({ id: 'u1', supertokensUserId: 'st-id', email: 'outro@empresa.test', perfil, ativo: true });
    await request(app.getHttpServer()).post('/admin/usuarios').send(body).expect(403);
    expect(criar).not.toHaveBeenCalled();
  });

  it('403: conta sem registro ativo', async () => {
    usuario.mockResolvedValue(null);
    await request(app.getHttpServer()).get('/admin/usuarios').expect(403);
    expect(listar).not.toHaveBeenCalled();
  });

  it('201: admin cria funcionário com DTO validado', async () => {
    const res = await request(app.getHttpServer()).post('/admin/usuarios').send(body).expect(201);
    expect(res.body).toMatchObject({ email: body.email, perfil: body.perfil });
    expect(criar).toHaveBeenCalledTimes(1);
  });

  it('400: novos funcionários exigem nome completo', async () => {
    const semNome = { email: body.email, perfil: body.perfil, senhaInicial: body.senhaInicial };
    await request(app.getHttpServer()).post('/admin/usuarios').send(semNome).expect(400);
    expect(criar).not.toHaveBeenCalled();
  });

  it('200: admin lista funcionários', async () => {
    await request(app.getHttpServer()).get('/admin/usuarios').expect(200);
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it('200: administrador busca funcionário por UUID para editar', async () => {
    const id = 'b2b28766-c374-43b0-b2b6-3e84608d3ca1';
    await request(app.getHttpServer()).get(`/admin/usuarios/${id}`).expect(200);
    expect(buscarPorId).toHaveBeenCalledWith(id);
  });
  it('403: gestor não consegue abrir dados administrativos individuais', async () => {
    usuario.mockResolvedValue({ id: 'u1', supertokensUserId: 'st-id', perfil: PerfilUsuario.GESTOR, ativo: true });
    await request(app.getHttpServer()).get('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1').expect(403);
    expect(buscarPorId).not.toHaveBeenCalled();
  });
  it('401: acesso direto ao detalhe administrativo exige sessão', async () => {
    identificar.mockRejectedValue(new UnauthorizedException());
    await request(app.getHttpServer()).get('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1').expect(401);
    expect(buscarPorId).not.toHaveBeenCalled();
  });

  it('403: Colaborador não consulta funcionário por identificador', async () => {
    usuario.mockResolvedValue({ id: 'u1', supertokensUserId: 'st-id', perfil: PerfilUsuario.COLABORADOR, ativo: true });
    await request(app.getHttpServer()).get('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1').expect(403);
    expect(buscarPorId).not.toHaveBeenCalled();
  });

  it('400: identificador administrativo inválido é recusado', async () => {
    await request(app.getHttpServer()).get('/admin/usuarios/id-invalido').expect(400);
    expect(buscarPorId).not.toHaveBeenCalled();
  });

  it('400: role inventado e campos estranhos são recusados', async () => {
    await request(app.getHttpServer()).post('/admin/usuarios').send({ ...body, perfil: 'SUPERADMIN' }).expect(400);
    await request(app.getHttpServer()).post('/admin/usuarios').send({ ...body, supertokensUserId: 'forjado' }).expect(400);
    expect(criar).not.toHaveBeenCalled();
  });
  it('200: PATCH autorizado para o Administrador', async () => {
    await request(app.getHttpServer()).patch('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1')
      .send({ nome: 'Pessoa de Teste', ativo: false }).expect(200);
    expect(atualizar).toHaveBeenCalledTimes(1);
  });
  it('403: Gestor não pode fazer PATCH', async () => {
    usuario.mockResolvedValue({ id: 'u1', supertokensUserId: 'st-id', perfil: PerfilUsuario.GESTOR, ativo: true });
    await request(app.getHttpServer()).patch('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1')
      .send({ ativo: false }).expect(403);
    expect(atualizar).not.toHaveBeenCalled();
  });
  it('400: PATCH rejeita campos desconhecidos, ID incorreto e Admin como destino', async () => {
    await request(app.getHttpServer()).patch('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1')
      .send({ senha: 'segredo' }).expect(400);
    await request(app.getHttpServer()).patch('/admin/usuarios/b2b28766-c374-43b0-b2b6-3e84608d3ca1')
      .send({ perfil: PerfilUsuario.ADMINISTRADOR }).expect(400);
    await request(app.getHttpServer()).patch('/admin/usuarios/invalido')
      .send({ ativo: false }).expect(400);
    expect(atualizar).not.toHaveBeenCalled();
  });
});
