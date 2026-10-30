import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
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
import { ContratosController } from '../src/contratos/contratos.controller.js';
import { ContratosService } from '../src/contratos/contratos.service.js';
import { Usuario } from '../src/usuarios/usuario.entity.js';
import { Etapa } from '../src/etapas/etapa.entity.js';
import { EtapasController } from '../src/etapas/etapas.controller.js';
import { EtapasService } from '../src/etapas/etapas.service.js';
import { PermissaoContrato } from '../src/autorizacao/permissao-contrato.entity.js';
import { EventoAuditoria } from '../src/auditoria/evento-auditoria.entity.js';
import { PoliticaAcessoService } from '../src/autorizacao/politica-acesso.service.js';
import { ResolverEscopoContratoService } from '../src/autorizacao/resolver-escopo-contrato.service.js';
import { AutorizacaoGuard } from '../src/autorizacao/autorizacao.guard.js';
import type { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import type { UsuariosService } from '../src/usuarios/usuarios.service.js';
import type { RequisicaoAutorizada } from '../src/autorizacao/usuario-autenticado.js';
import { AuditoriaService } from '../src/auditoria/auditoria.service.js';

/**
 * HU06-04 — Controllers, serviços, DTOs, guard, TypeORM e PostgreSQL REAIS.
 * A única simulação é a identificação de sessão do SuperTokens, sem rede externa.
 * O schema nasce das migrations históricas, sem synchronize/dropSchema.
 * Banco obrigatoriamente isolado e sem limpeza global de dados pré-existentes.
 */
const databaseUrl = process.env.HU06_QA_TEST_DATABASE_URL;
const suite = databaseUrl ? describe : describe.skip;

suite('HU06-04 — regressão HTTP + PostgreSQL em base migrada', () => {
  let db: DataSource;
  let app: INestApplication;
  let auditoria: AuditoriaService;
  let contrato: string;
  let alheio: string;
  let etapaLegada: string;
  let gestorId: string;
  const usuarioIds: string[] = [];
  const contratoIds: string[] = [];
  const sufixo = randomUUID();
  const sessoes = {
    admin: `qa-hu06-04-admin-${sufixo}`,
    gestor: `qa-hu06-04-gestor-${sufixo}`,
    colaborador: `qa-hu06-04-colaborador-${sufixo}`,
  };
  const autenticar = (papel: keyof typeof sessoes) => ({ 'x-hu06-qa': sessoes[papel] });
  const rota = (id: string) => `/contratos/${id}/etapas`;
  const idsDaLista = (registros: Array<{ id: string }>): string[] => registros.map((item) => item.id);

  async function iniciarApi(): Promise<void> {
    auditoria = new AuditoriaService(db);
    const etapaService = new EtapasService(db.getRepository(Etapa), db.getRepository(Contrato), db, auditoria);
    const contratoService = new ContratosService(db.getRepository(Contrato), auditoria);
    const modulo = await Test.createTestingModule({
      controllers: [EtapasController, ContratosController],
      providers: [
        { provide: EtapasService, useValue: etapaService },
        { provide: ContratosService, useValue: contratoService },
      ],
    }).compile();
    const sessao = {
      identificar: async (req: RequisicaoAutorizada) => {
        const token = req.headers['x-hu06-qa'];
        if (typeof token !== 'string' || !token) throw new UnauthorizedException('Sessão ausente');
        return token;
      },
    } as unknown as SessaoSuperTokensService;
    const usuarios = {
      buscarAtivoPorSupertokensId: (supertokensUserId: string) =>
        db.getRepository(Usuario).findOneBy({ supertokensUserId, ativo: true }),
    } as unknown as UsuariosService;
    app = modulo.createNestApplication();
    app.useGlobalGuards(new AutorizacaoGuard(
      modulo.get(Reflector), sessao, usuarios,
      new PoliticaAcessoService(db.getRepository(PermissaoContrato)),
      new ResolverEscopoContratoService(db.getRepository(Contrato), db.getRepository(Etapa)),
    ));
    await app.init();
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('Banco isolado não informado');
    const nome = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
    if (!/^integrador_hu06_qa_test$/.test(nome)) {
      throw new Error('Proteção: HU06-04 só aceita o banco integrador_hu06_qa_test');
    }
    db = await new DataSource({
      type: 'postgres', url: databaseUrl, synchronize: false,
      entities: [Contrato, Usuario, Etapa, PermissaoContrato, EventoAuditoria],
      migrations: [
        CriarUsuarios1792540000000, CriarPermissoesContrato1793000000000,
        CriarEventosAuditoria1793100000000, CriarContratos1793200000000,
        AdicionarNomeUsuarios1793300000000, FkPermissaoContrato1793400000000,
        CriarEtapas1793500000000, ContextoAuditoriaOperacional1793600000000,
      ],
    }).initialize();
    await db.runMigrations();

    // Contrato e etapa HISTÓRICOS persistidos ANTES de iniciar o Nest.
    const novoContrato = async (numero: string) => {
      const [linha] = await db.query(`INSERT INTO contratos
        (numero_contrato, orgao_contratante, objeto, inicio_vigencia, termino_vigencia, status, modo_calculo)
        VALUES ($1, 'Órgão QA', 'Contrato legado', '2026-10-01', '2027-03-31', 'PLANEJAMENTO', 'SIMPLES')
        RETURNING id`, [`${numero}-${sufixo}`]) as Array<{ id: string }>;
      contratoIds.push(linha.id);
      return linha.id;
    };
    contrato = await novoContrato('HU06-PREEXISTENTE');
    alheio = await novoContrato('HU06-ALHEIO');
    const [etapa] = await db.query(`INSERT INTO etapas
      (contrato_id, codigo, nome, descricao, sequencia, inicio_previsto, termino_previsto, status, observacoes)
      VALUES ($1, 'LEG-01', 'Etapa histórica', 'Persistida antes do Nest', 1, '2026-11-01', '2027-02-15', 'PLANEJADA', 'Não alterar')
      RETURNING id`, [contrato]) as Array<{ id: string }>;
    etapaLegada = etapa.id;

    for (const [papel, session] of Object.entries(sessoes)) {
      const perfil = papel === 'admin' ? 'ADMINISTRADOR' : papel === 'gestor' ? 'GESTOR' : 'COLABORADOR';
      const [u] = await db.query(`INSERT INTO usuarios (supertokens_user_id, email, nome, perfil, ativo)
        VALUES ($1, $2, 'Usuário QA', $3, true) RETURNING id`,
      [session, `${papel}-${sufixo}@invalid`, perfil]) as Array<{ id: string }>;
      usuarioIds.push(u.id);
      if (papel === 'gestor') gestorId = u.id;
      if (papel !== 'admin') await db.query(`INSERT INTO permissoes_contrato
        (usuario_id, contrato_id, pode_editar) VALUES ($1, $2, $3)`,
      [u.id, contrato, papel === 'gestor']);
    }
    await iniciarApi();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db?.isInitialized) return;
    try {
      // Não apagar quaisquer fixtures ou registros anteriores de outros testes.
      await db.query('DELETE FROM eventos_auditoria WHERE contrato_id = ANY($1::uuid[])', [contratoIds]);
      await db.query('DELETE FROM etapas WHERE contrato_id = ANY($1::uuid[])', [contratoIds]);
      await db.query('DELETE FROM permissoes_contrato WHERE contrato_id = ANY($1::uuid[])', [contratoIds]);
      await db.query('DELETE FROM contratos WHERE id = ANY($1::uuid[])', [contratoIds]);
      await db.query('DELETE FROM usuarios WHERE id = ANY($1::uuid[])', [usuarioIds]);
    } finally { await db.destroy(); }
  });

  it('exige schema histórico real migrado, FK e UNIQUE de sequência para HU07', async () => {
    const [regra] = await db.query(`SELECT
      (SELECT count(*)::int FROM pg_constraint WHERE conname = 'fk_etapas_contrato') AS fk,
      (SELECT count(*)::int FROM pg_constraint WHERE conname = 'uq_etapas_contrato_sequencia') AS sequencia,
      (SELECT count(*)::int FROM migrations WHERE name LIKE '%CriarEtapas%') AS migracao`) as
      Array<{ fk: number; sequencia: number; migracao: number }>;
    expect(regra).toEqual({ fk: 1, sequencia: 1, migracao: 1 });
    const [r] = await db.query('SELECT contrato_id, sequencia FROM etapas WHERE id = $1', [etapaLegada]) as
      Array<{ contrato_id: string; sequencia: number }>;
    expect(r).toEqual({ contrato_id: contrato, sequencia: 1 });
  });

  it('protege todas as operações contra anônimo, usuário inativo, gestor alheio e colaborador escritor', async () => {
    await request(app.getHttpServer()).get(rota(contrato)).expect(401);
    await request(app.getHttpServer()).get(`${rota(contrato)}/${etapaLegada}`).expect(401);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/${etapaLegada}`).send({ nome: 'X' }).expect(401);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).send({
      idsOrdemAtual: [etapaLegada], idsOrdemNova: [etapaLegada],
    }).expect(401);
    await request(app.getHttpServer()).get(rota(alheio)).set(autenticar('gestor')).expect(404);
    await request(app.getHttpServer()).get(`${rota(alheio)}/${etapaLegada}`)
      .set(autenticar('admin')).expect(404);
    await request(app.getHttpServer()).patch(`${rota(alheio)}/${etapaLegada}`)
      .set(autenticar('admin')).send({ nome: 'X' }).expect(404);
    await request(app.getHttpServer()).post(rota(contrato)).set(autenticar('colaborador'))
      .send({ nome: 'Não permitido' }).expect(404);
    await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('colaborador')).expect(200);
    await db.query('UPDATE usuarios SET ativo=false WHERE id=$1', [gestorId]);
    try {
      await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('gestor')).expect(403);
    } finally { await db.query('UPDATE usuarios SET ativo=true WHERE id=$1', [gestorId]); }
  });

  let primeira: string;
  let segunda: string;
  it('cria duas etapas sobre contrato histórico, sem duplicar sequência, e rejeita 400/404', async () => {
    const respostas = await Promise.all([
      request(app.getHttpServer()).post(rota(contrato)).set(autenticar('gestor')).send({
        nome: 'Execução', codigo: 'EXE', descricao: 'Descrição Exec', observacoes: 'Planejado',
        inicioPrevisto: '2026-12-01', terminoPrevisto: '2027-02-20',
      }),
      request(app.getHttpServer()).post(rota(contrato)).set(autenticar('admin')).send({
        nome: 'Encerramento', status: 'PLANEJADA',
      }),
    ]);
    expect(respostas.map((r) => r.status)).toEqual([201, 201]);
    primeira = respostas[0].body.id as string;
    segunda = respostas[1].body.id as string;
    const lista = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('admin')).expect(200);
    expect(lista.body.map((e: { sequencia: number }) => e.sequencia)).toEqual([1, 2, 3]);
    expect(idsDaLista(lista.body)).toContain(etapaLegada);
    await request(app.getHttpServer()).post(rota(contrato)).set(autenticar('admin'))
      .send({ nome: 'Inválida', contratoId: alheio }).expect(400);
    await request(app.getHttpServer()).post(rota(contrato)).set(autenticar('admin'))
      .send({ nome: 'Inválida', inicioPrevisto: '2026-02-30' }).expect(400);
    await request(app.getHttpServer()).post(rota(contrato)).set(autenticar('admin'))
      .send({ nome: 'Inválida', codigo: '    ' }).expect(400);
    await request(app.getHttpServer()).post(rota(contrato)).set(autenticar('admin'))
      .send({ nome: 'Inválida', status: 'CANCELADA' }).expect(400);
    await request(app.getHttpServer()).post(rota(randomUUID())).set(autenticar('admin'))
      .send({ nome: 'Sem FK' }).expect(404);
    expect(await db.getRepository(Etapa).countBy({ contratoId: contrato })).toBe(3);
  });

  it('reordena de forma atômica, rejeita array incompleto/duplicado e conflito de versão', async () => {
    const anterior = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('gestor')).expect(200);
    const ordem = idsDaLista(anterior.body);
    const nova = [ordem[1], ordem[2], ordem[0]];
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('gestor'))
      .send({ idsOrdemAtual: ordem, idsOrdemNova: nova }).expect(200);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('gestor'))
      .send({ idsOrdemAtual: nova, idsOrdemNova: nova.slice(0, 2) }).expect(409);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('gestor'))
      .send({ idsOrdemAtual: nova, idsOrdemNova: [nova[0], nova[0], nova[1]] }).expect(400);
    await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('gestor'))
      .send({ idsOrdemAtual: ordem, idsOrdemNova: nova }).expect(409);
    const banco = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    expect(idsDaLista(banco)).toEqual(nova);
    expect(banco.map((e) => e.sequencia)).toEqual([1, 2, 3]);
  });

  it('duas reordenações HTTP concorrentes produzem um único vencedor e conflito 409', async () => {
    const inicial = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('admin')).expect(200);
    const ids = idsDaLista(inicial.body);
    const destino = [ids[2], ids[0], ids[1]];
    const respostas = await Promise.all([
      request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('gestor'))
        .send({ idsOrdemAtual: ids, idsOrdemNova: destino }),
      request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('admin'))
        .send({ idsOrdemAtual: ids, idsOrdemNova: destino }),
    ]);
    expect(respostas.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    const persistida = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('admin')).expect(200);
    expect(idsDaLista(persistida.body)).toEqual(destino);
  });

  it('PostgreSQL rejeita diretamente FK inexistente e sequência duplicada sem afetar o contrato', async () => {
    const linhasAntes = await db.getRepository(Etapa).countBy({ contratoId: contrato });
    await expect(db.query(`INSERT INTO etapas (contrato_id, nome, sequencia, status)
      VALUES ($1, 'FK inexistente', 1, 'PLANEJADA')`, [randomUUID()]))
      .rejects.toMatchObject({ code: '23503' });
    await expect(db.query(`INSERT INTO etapas (contrato_id, nome, sequencia, status)
      VALUES ($1, 'Sequência repetida', 1, 'PLANEJADA')`, [contrato]))
      .rejects.toMatchObject({ code: '23505' });
    expect(await db.getRepository(Etapa).countBy({ contratoId: contrato })).toBe(linhasAntes);
  });

  it('recusa erro na última auditoria de reordenação com rollback de TODAS as etapas e eventos', async () => {
    const antes = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    const eventosAntes = await db.getRepository(EventoAuditoria).countBy({ contratoId: contrato });
    const idsOriginais = idsDaLista(antes);
    expect(idsOriginais.length).toBeGreaterThan(1);
    const novaOrdem = [...idsOriginais.slice(1), idsOriginais[0]];
    const original = auditoria.registrarNaTransacao.bind(auditoria);
    let vezes = 0;
    auditoria.registrarNaTransacao = async (...args) => {
      vezes++;
      if (vezes === antes.length) throw new Error('Falha simulada na ultima auditoria');
      return original(...args);
    };
    try {
      await request(app.getHttpServer()).patch(`${rota(contrato)}/reordenar`).set(autenticar('admin'))
        .send({ idsOrdemAtual: idsOriginais, idsOrdemNova: novaOrdem }).expect(500);
    } finally { auditoria.registrarNaTransacao = original; }
    const depois = await db.getRepository(Etapa).find({ where: { contratoId: contrato }, order: { sequencia: 'ASC' } });
    expect(depois.map((e) => [e.id, e.sequencia])).toEqual(antes.map((e) => [e.id, e.sequencia]));
    expect(await db.getRepository(EventoAuditoria).countBy({ contratoId: contrato })).toBe(eventosAntes);
  });

  it('audita mudanças de status, prazo e reordenação com ator, contrato e snapshots antes/depois', async () => {
    const alterado = await request(app.getHttpServer()).patch(`${rota(contrato)}/${primeira}`)
      .set(autenticar('gestor')).send({
        status: 'EM_ANDAMENTO', terminoPrevisto: '2027-05-10', descricao: 'Execução revisada',
      }).expect(200);
    expect(alterado.body.avisoVigencia).toBe(true);
    const eventos = await db.getRepository(EventoAuditoria).find({
      where: { contratoId: contrato, entidadeId: primeira }, order: { registradoEm: 'ASC' },
    });
    const prazo = eventos.find((e) => e.acao === 'ETAPA_PRAZO_ALTERADO');
    const status = eventos.find((e) => e.acao === 'ETAPA_STATUS_ALTERADO');
    const ordem = eventos.find((e) => e.acao === 'ETAPA_REORDENADA');
    expect(prazo?.dadosAnteriores).toMatchObject({ terminoPrevisto: '2027-02-20' });
    expect(prazo?.dadosPosteriores).toMatchObject({ terminoPrevisto: '2027-05-10' });
    expect(status?.dadosAnteriores).toMatchObject({ status: 'PLANEJADA' });
    expect(status?.dadosPosteriores).toMatchObject({ status: 'EM_ANDAMENTO' });
    expect(ordem?.dadosAnteriores).toMatchObject({ sequencia: expect.any(Number) });
    expect(ordem?.dadosPosteriores).toMatchObject({ sequencia: expect.any(Number) });
    for (const e of [prazo, status, ordem]) {
      expect(e?.contratoId).toBe(contrato);
      expect(e?.atorSupertokensUserId).toEqual(expect.stringMatching(/^qa-hu06-04-/));
      expect(e?.registradoEm).toBeInstanceOf(Date);
    }
    expect(eventos.some((e) => e.acao === 'ETAPA_EDITADA')).toBe(true);
  });

  it('CRUD HU05 altera vigência do contrato PREEXISTENTE sem reescrever datas das etapas; audita antes/depois', async () => {
    const antes = await db.getRepository(Etapa).find({ where: { contratoId: contrato } });
    const resp = await request(app.getHttpServer()).patch(`/contratos/${contrato}`)
      .set(autenticar('admin')).send({ terminoVigencia: '2027-07-01' }).expect(200);
    expect(resp.body.terminoVigencia).toBe('2027-07-01');
    const depois = await db.getRepository(Etapa).find({ where: { contratoId: contrato } });
    const projeto = (e: Etapa) => ({
      id: e.id, inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto,
      status: e.status, sequencia: e.sequencia,
    });
    expect(depois.map(projeto).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(antes.map(projeto).sort((a, b) => a.id.localeCompare(b.id)));
    const detalhe = await request(app.getHttpServer()).get(`${rota(contrato)}/${primeira}`)
      .set(autenticar('gestor')).expect(200);
    expect(detalhe.body.avisoVigencia).toBe(false);
    expect(detalhe.body.terminoPrevisto).toBe('2027-05-10');
    const auditoriaPrazo = await db.getRepository(EventoAuditoria).findOne({
      where: { contratoId: contrato, entidadeId: contrato, acao: 'CONTRATO_PRAZO_ALTERADO' as EventoAuditoria['acao'] },
    });
    expect(auditoriaPrazo?.dadosAnteriores).toMatchObject({ terminoVigencia: '2027-03-31' });
    expect(auditoriaPrazo?.dadosPosteriores).toMatchObject({ terminoVigencia: '2027-07-01' });
  });

  it('consulta após reinicializar Nest mantém IDs, código, campos e ordem persistidos no PostgreSQL', async () => {
    const antes = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('admin')).expect(200);
    const campos = (e: { id: string; codigo: string | null; nome: string; status: string; sequencia: number; inicioPrevisto: string | null; terminoPrevisto: string | null }) =>
      ({ id: e.id, codigo: e.codigo, nome: e.nome, status: e.status, sequencia: e.sequencia,
        inicioPrevisto: e.inicioPrevisto, terminoPrevisto: e.terminoPrevisto });
    await app.close();
    await iniciarApi();
    const depois = await request(app.getHttpServer()).get(rota(contrato)).set(autenticar('admin')).expect(200);
    expect(depois.body.map(campos)).toEqual(antes.body.map(campos));
    expect(idsDaLista(depois.body)).toContain(etapaLegada);
    expect(idsDaLista(depois.body)).toContain(segunda);
  });
});
