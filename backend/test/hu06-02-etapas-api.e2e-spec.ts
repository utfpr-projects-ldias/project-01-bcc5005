import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import request from 'supertest';

import { CriarUsuarios1792540000000 } from '../src/database/migrations/1792540000000-CriarUsuarios.js';
import { CriarPermissoesContrato1793000000000 } from '../src/database/migrations/1793000000000-CriarPermissoesContrato.js';
import { CriarEventosAuditoria1793100000000 } from '../src/database/migrations/1793100000000-CriarEventosAuditoria.js';
import { CriarContratos1793200000000 } from '../src/database/migrations/1793200000000-CriarContratos.js';
import { AdicionarNomeUsuarios1793300000000 } from '../src/database/migrations/1793300000000-AdicionarNomeUsuarios.js';
import { FkPermissaoContrato1793400000000 } from '../src/database/migrations/1793400000000-FkPermissaoContrato.js';
import { CriarEtapas1793500000000 } from '../src/database/migrations/1793500000000-CriarEtapas.js';
import { ContextoAuditoriaOperacional1793600000000 } from '../src/database/migrations/1793600000000-ContextoAuditoriaOperacional.js';
import { Contrato } from '../src/contratos/contrato.entity.js';
import { Usuario } from '../src/usuarios/usuario.entity.js';
import { Etapa } from '../src/etapas/etapa.entity.js';
import { PermissaoContrato } from '../src/autorizacao/permissao-contrato.entity.js';
import { EventoAuditoria } from '../src/auditoria/evento-auditoria.entity.js';
import { PoliticaAcessoService } from '../src/autorizacao/politica-acesso.service.js';
import { ResolverEscopoContratoService } from '../src/autorizacao/resolver-escopo-contrato.service.js';
import { AutorizacaoGuard } from '../src/autorizacao/autorizacao.guard.js';
import type { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import type { UsuariosService } from '../src/usuarios/usuarios.service.js';
import type { RequisicaoAutorizada } from '../src/autorizacao/usuario-autenticado.js';
import { AuditoriaService } from '../src/auditoria/auditoria.service.js';
import { EtapasService } from '../src/etapas/etapas.service.js';
import { EtapasController } from '../src/etapas/etapas.controller.js';

/** API DE PRODUÇÃO real, guard real, banco PostgreSQL real; sessão SuperTokens simulada. */
const url = process.env.HU06_API_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('HU06-02 — API real e ordenação transacional PostgreSQL isolado', () => {
  let db: DataSource;
  let app: INestApplication;
  let auditoria: AuditoriaService;
  let contrato: string;
  let alheio: string;
  let vinculoGestor: string;
  const idTeste = randomUUID();
  const st = {
    admin: `hu06-admin-${idTeste}`,
    gestor: `hu06-gestor-${idTeste}`,
    colaborador: `hu06-colaborador-${idTeste}`,
  };
  const usuarios: string[] = [];
  const contratos: string[] = [];
  const header = (tipo: keyof typeof st) => ({ 'x-hu06-session': st[tipo] });
  const rota = (id: string) => `/contratos/${id}/etapas`;
  const etapaDto = (nome: string) => ({ nome, codigo: 'E-01', inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-12-01' });

  beforeAll(async () => {
    if (!url) throw new Error('URL de teste isolado é obrigatória');
    const nome = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!nome.endsWith('_hu06_api_test')) throw new Error('Use apenas banco terminado em _hu06_api_test');
    db = await new DataSource({
      type: 'postgres', url, synchronize: false,
      entities: [Contrato, Usuario, Etapa, PermissaoContrato, EventoAuditoria],
      migrations: [
        CriarUsuarios1792540000000, CriarPermissoesContrato1793000000000,
        CriarEventosAuditoria1793100000000, CriarContratos1793200000000,
        AdicionarNomeUsuarios1793300000000, FkPermissaoContrato1793400000000,
        CriarEtapas1793500000000, ContextoAuditoriaOperacional1793600000000,
      ],
    }).initialize();
    await db.runMigrations();
    const criarContrato = async (sufixo: string) => {
      const [r] = await db.query(`INSERT INTO contratos
        (numero_contrato, orgao_contratante, objeto, inicio_vigencia,
        termino_vigencia, status, modo_calculo)
        VALUES ($1, 'Órgão HU06', 'Execução QA', '2026-10-01', '2027-01-01',
        'PLANEJAMENTO', 'SIMPLES') RETURNING id`, [`HU06-02-${sufixo}-${idTeste}`]) as Array<{ id: string }>;
      contratos.push(r.id);
      return r.id;
    };
    contrato = await criarContrato('permitido');
    alheio = await criarContrato('alheio');
    for (const [tipo, sessao] of Object.entries(st)) {
      const perfil = tipo === 'admin' ? 'ADMINISTRADOR' : tipo === 'gestor' ? 'GESTOR' : 'COLABORADOR';
      const [r] = await db.query(`INSERT INTO usuarios (supertokens_user_id, email, nome, perfil, ativo)
        VALUES ($1, $2, 'Pessoa QA', $3, true) RETURNING id`,
      [sessao, `${tipo}-${idTeste}@invalid`, perfil]) as Array<{ id: string }>;
      usuarios.push(r.id);
      if (tipo !== 'admin') {
        const [v] = await db.query(`INSERT INTO permissoes_contrato (usuario_id, contrato_id, pode_editar)
          VALUES ($1, $2, $3) RETURNING id`, [r.id, contrato, tipo === 'gestor']) as Array<{ id: string }>;
        if (tipo === 'gestor') vinculoGestor = v.id;
      }
    }
    auditoria = new AuditoriaService(db);
    const svc = new EtapasService(db.getRepository(Etapa), db.getRepository(Contrato), db, auditoria);
    const modulo = await Test.createTestingModule({
      controllers: [EtapasController],
      providers: [{ provide: EtapasService, useValue: svc }],
    }).compile();
    const sessoes = {
      identificar: async (req: RequisicaoAutorizada) => {
        const session = req.headers['x-hu06-session'];
        if (typeof session !== 'string' || !session) throw new UnauthorizedException('Sem sessão');
        return session;
      },
    } as unknown as SessaoSuperTokensService;
    const dominio = {
      buscarAtivoPorSupertokensId: (supertokensUserId: string) =>
        db.getRepository(Usuario).findOneBy({ supertokensUserId, ativo: true }),
    } as unknown as UsuariosService;
    const acesso = new PoliticaAcessoService(db.getRepository(PermissaoContrato));
    const escopo = new ResolverEscopoContratoService(db.getRepository(Contrato), db.getRepository(Etapa));
    app = modulo.createNestApplication();
    app.useGlobalGuards(new AutorizacaoGuard(modulo.get(Reflector), sessoes, dominio, acesso, escopo));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db?.isInitialized) return;
    try {
      await db.query('DELETE FROM eventos_auditoria WHERE contrato_id = ANY($1::uuid[])', [contratos]);
      await db.query('DELETE FROM etapas WHERE contrato_id = ANY($1::uuid[])', [contratos]);
      await db.query('DELETE FROM permissoes_contrato WHERE contrato_id = ANY($1::uuid[])', [contratos]);
      await db.query('DELETE FROM contratos WHERE id = ANY($1::uuid[])', [contratos]);
      await db.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [usuarios]);
    } finally { await db.destroy(); }
  });

  let primeira: string;
  let segunda: string;

  it('bloqueia sessão ausente e usuário Colaborador em escrita', async () => {
    await request(app.getHttpServer()).post(rota(contrato)).send(etapaDto('Invasão')).expect(401);
    await request(app.getHttpServer()).post(rota(contrato)).set(header('colaborador'))
      .send(etapaDto('Invasão')).expect(404);
  });

  it('cria e lista etapas reais com sequência atribuída pelo servidor', async () => {
    const a = await request(app.getHttpServer()).post(rota(contrato)).set(header('gestor'))
      .send(etapaDto('Planejamento')).expect(201);
    const b = await request(app.getHttpServer()).post(rota(contrato)).set(header('gestor'))
      .send({ nome: 'Execução' }).expect(201);
    primeira = a.body.id as string;
    segunda = b.body.id as string;
    expect([a.body.sequencia, b.body.sequencia]).toEqual([1, 2]);
    const res = await request(app.getHttpServer()).get(rota(contrato)).set(header('colaborador')).expect(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([primeira, segunda]);
    expect(res.body[0].vigenciaContrato).toEqual({ inicioVigencia: '2026-10-01', terminoVigencia: '2027-01-01' });
  });

  it('rejeita campos extra, calendário impossível e datas invertidas sem persistir', async () => {
    await request(app.getHttpServer()).post(rota(contrato)).set(header('admin'))
      .send({ nome: 'Errado', contratoId: alheio }).expect(400);
    await request(app.getHttpServer()).post(rota(contrato)).set(header('admin'))
      .send({ nome: 'Errado', inicioPrevisto: '2026-02-30' }).expect(400);
    await request(app.getHttpServer()).post(rota(contrato)).set(header('admin'))
      .send({ nome: 'Errado', inicioPrevisto: '2026-12-01', terminoPrevisto: '2026-11-01' }).expect(400);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/${primeira}`).set(header('gestor'))
      .send({ sequencia: 99 }).expect(400);
    const res = await request(app.getHttpServer()).get(rota(contrato)).set(header('admin')).expect(200);
    expect(res.body).toHaveLength(2);
  });

  it('reordena atomicamente, audita cada alteração e preserva ordem no banco', async () => {
    const res = await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor'))
      .send({ idsOrdemAtual: [primeira, segunda], idsOrdemNova: [segunda, primeira] }).expect(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([segunda, primeira]);
    const registros = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    expect(registros.map((e) => e.id)).toEqual([segunda, primeira]);
    const r = await db.query(`SELECT COUNT(*)::int AS total FROM eventos_auditoria WHERE
      contrato_id = $1 AND acao = 'ETAPA_REORDENADA'`, [contrato]) as Array<{ total: number }>;
    expect(r[0].total).toBe(2);
  });

  it('retorna 409 ao receber ordem desatualizada, duplicada ou com UUID de outro contrato', async () => {
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor'))
      .send({ idsOrdemAtual: [primeira, segunda], idsOrdemNova: [segunda, primeira] }).expect(409);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor'))
      .send({ idsOrdemAtual: [segunda, primeira], idsOrdemNova: [segunda, segunda] }).expect(400);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor'))
      .send({ idsOrdemAtual: [segunda, primeira], idsOrdemNova: [segunda, randomUUID()] }).expect(409);
    const res = await request(app.getHttpServer()).get(rota(contrato)).set(header('admin')).expect(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([segunda, primeira]);
  });

  it('duas reordenações simultâneas com o mesmo estado não sobrescrevem entre si', async () => {
    const payload = { idsOrdemAtual: [segunda, primeira], idsOrdemNova: [primeira, segunda] };
    const respostas = await Promise.all([
      request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor')).send(payload),
      request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('gestor')).send(payload),
    ]);
    expect(respostas.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const res = await request(app.getHttpServer()).get(rota(contrato)).set(header('admin')).expect(200);
    expect(res.body.map((e: { id: string }) => e.id)).toEqual([primeira, segunda]);
  });

  it('falha de auditoria durante a reordenação desfaz todas as sequências', async () => {
    const antes = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    const original = auditoria.registrarNaTransacao.bind(auditoria);
    let chamadas = 0;
    auditoria.registrarNaTransacao = async (...args) => {
      chamadas++;
      if (chamadas === 2) throw new Error('Auditoria falhou na segunda etapa');
      return original(...args);
    };
    try {
      await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(header('admin'))
        .send({ idsOrdemAtual: [primeira, segunda], idsOrdemNova: [segunda, primeira] }).expect(500);
    } finally { auditoria.registrarNaTransacao = original; }
    const depois = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    expect(depois.map((e) => [e.id, e.sequencia])).toEqual(antes.map((e) => [e.id, e.sequencia]));
  });

  it('rejeita ID aninhado cruzado e Gestor sem vínculo ao contrato alheio', async () => {
    await request(app.getHttpServer()).get(`${rota(alheio)}/${primeira}`).set(header('admin')).expect(404);
    await request(app.getHttpServer()).patch(`${rota(alheio)}/${primeira}`).set(header('admin'))
      .send({ nome: 'Invasão' }).expect(404);
    await request(app.getHttpServer()).get(rota(alheio)).set(header('gestor')).expect(404);
    await request(app.getHttpServer()).get(`${rota(contrato)}/${randomUUID()}`).set(header('admin')).expect(404);
  });

  it('edita datas/status, registra auditoria específica e apresenta aviso de vigência sem corrigir data', async () => {
    const res = await request(app.getHttpServer()).patch(`${rota(contrato)}/${primeira}`).set(header('gestor'))
      .send({ status: 'EM_ANDAMENTO', terminoPrevisto: '2027-05-01' }).expect(200);
    expect(res.body.avisoVigencia).toBe(true);
    expect(res.body.terminoPrevisto).toBe('2027-05-01');
    const eventos = await db.query(`SELECT acao FROM eventos_auditoria WHERE
      entidade_id = $1 ORDER BY registrado_em`, [primeira]) as Array<{ acao: string }>;
    expect(eventos.map((e) => e.acao)).toEqual(expect.arrayContaining([
      'ETAPA_CRIADA', 'ETAPA_REORDENADA', 'ETAPA_STATUS_ALTERADO', 'ETAPA_PRAZO_ALTERADO', 'ETAPA_EDITADA',
    ]));
    await db.query(`UPDATE contratos SET termino_vigencia = '2027-06-01' WHERE id = $1`, [contrato]);
    const detalhe = await request(app.getHttpServer()).get(`${rota(contrato)}/${primeira}`)
      .set(header('gestor')).expect(200);
    expect(detalhe.body.avisoVigencia).toBe(false);
    expect(detalhe.body.terminoPrevisto).toBe('2027-05-01');
  });

  it('revogação do vínculo de Gestor impede edição subsequente', async () => {
    await db.query('UPDATE permissoes_contrato SET pode_editar=false WHERE id=$1', [vinculoGestor]);
    try {
      await request(app.getHttpServer()).patch(`${rota(contrato)}/${primeira}`)
        .set(header('gestor')).send({ nome: 'Proibido' }).expect(404);
      await request(app.getHttpServer()).get(`${rota(contrato)}/${primeira}`)
        .set(header('gestor')).expect(200);
    } finally {
      await db.query('UPDATE permissoes_contrato SET pode_editar=true WHERE id=$1', [vinculoGestor]);
    }
  });

  it('falha de auditoria realiza rollback da criação e evita órfãos', async () => {
    const anterior = (await db.getRepository(Etapa).countBy({ contratoId: contrato }));
    const original = auditoria.registrarNaTransacao.bind(auditoria);
    auditoria.registrarNaTransacao = async () => { throw new Error('Falha de auditoria simulada'); };
    try {
      await request(app.getHttpServer()).post(rota(contrato)).set(header('admin'))
        .send({ nome: 'NÃO PERSISTIR' }).expect(500);
    } finally { auditoria.registrarNaTransacao = original; }
    expect(await db.getRepository(Etapa).countBy({ contratoId: contrato })).toBe(anterior);
  });
});
