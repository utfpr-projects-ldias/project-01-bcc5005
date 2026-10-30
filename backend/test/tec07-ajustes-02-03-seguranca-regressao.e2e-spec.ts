import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import {
  Controller, Get, Patch, Post, Param, Req, UnauthorizedException,
  type INestApplication,
} from '@nestjs/common';
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
import { ExigirPolitica, ExigirPoliticaOperacional } from '../src/autorizacao/politica.decorator.js';
import type { SessaoSuperTokensService } from '../src/autorizacao/sessao-supertokens.service.js';
import type { UsuariosService } from '../src/usuarios/usuarios.service.js';
import type { RequisicaoAutorizada } from '../src/autorizacao/usuario-autenticado.js';
import { ContratosService } from '../src/contratos/contratos.service.js';
import { AuditoriaService } from '../src/auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../src/auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/**
 * Rotas EXISTENTES APENAS NA SUÍTE. Não são controllers de produção.
 * HTTP real do Nest/guard/política + PostgreSQL real; sessão SuperTokens SIMULADA.
 * Um teste 200 de rota de demonstração NÃO comprova CRUD real de Etapas (HU06-02).
 */
@Controller('qa-seguranca')
class RotasSomenteDeTeste {
  constructor(private readonly contratosService: ContratosService, private readonly db: DataSource) {}

  @Get('carteira')
  @ExigirPolitica('contratos:listar')
  carteira(@Req() req: RequisicaoAutorizada) {
    return this.contratosService.listar(req.usuarioDominio!);
  }

  @Get('contratos/:contratoId/etapas')
  @ExigirPoliticaOperacional('etapas:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listarEtapas(@Param('contratoId') contratoId: string) {
    // Filtragem SQL ANTES de responder; não é um futuro endpoint HU06-02.
    return this.db.getRepository(Etapa).find({ where: { contratoId }, order: { sequencia: 'ASC' } });
  }

  @Get('contratos/:contratoId/etapas/:etapaId')
  @ExigirPoliticaOperacional('etapas:visualizar', {
    tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId',
  })
  detalhe(@Param('etapaId') etapaId: string) { return { etapaId, acessivel: true }; }

  @Patch('contratos/:contratoId/etapas/:etapaId')
  @ExigirPoliticaOperacional('etapas:editar', {
    tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId',
  })
  edicaoAutorizada(@Param('etapaId') etapaId: string) { return { etapaId, autorizada: true }; }

  @Post('contratos/:contratoId/atividades')
  @ExigirPoliticaOperacional('atividades:registrar', { tipo: 'contrato', parametro: 'contratoId' })
  atividadeAutorizada() { return { autorizada: true }; }

  @Get('documentos/:documentoId')
  @ExigirPoliticaOperacional('documentos:baixar', {
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId',
  })
  documentoNaoImplementado() { return { indevido: true }; }

  @Get('sem-politica')
  semPolitica() { return { indevido: true }; }
}

const url = process.env.TEC07_REGRESSION_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
const UUID_INEXISTENTE = 'ffffffff-ffff-4fff-8fff-ffffffffffff';

suite('TEC07-AJUSTES-02-03 — HTTP + PostgreSQL isolado, sessão simulada', () => {
  let db: DataSource;
  let app: INestApplication;
  const usuarios: Record<string, string> = {};
  let contrato1: string;
  let contrato2: string;
  let etapa1: string;
  let etapa2: string;
  let idPermissaoGestor: string;
  let idPermissaoColaborador: string;
  const idExecucao = randomUUID();
  const sts = {
    admin: `qa-admin-${idExecucao}`,
    gestor: `qa-gestor-${idExecucao}`,
    colaborador: `qa-colaborador-${idExecucao}`,
    inativo: `qa-inativo-${idExecucao}`,
  };

  const criarContrato = async (numero: string): Promise<string> => {
    const [registro] = await db.query(`
      INSERT INTO contratos (numero_contrato, orgao_contratante, objeto,
        inicio_vigencia, termino_vigencia, status, modo_calculo)
      VALUES ($1, 'Órgão QA', 'Teste de isolamento', '2026-10-01', '2027-10-01',
        'PLANEJAMENTO', 'SIMPLES') RETURNING id
    `, [numero]) as Array<{ id: string }>;
    return registro.id;
  };
  const criarEtapa = async (contratoId: string): Promise<string> => {
    const [registro] = await db.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia)
      VALUES ($1, 'Etapa QA', 1) RETURNING id
    `, [contratoId]) as Array<{ id: string }>;
    return registro.id;
  };
  const chamar = (tipo: keyof typeof sts) => ({ 'x-qa-session': sts[tipo] });

  beforeAll(async () => {
    if (!url) throw new Error('Banco isolado obrigatório');
    const nome = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    if (!nome.endsWith('_tec07_regression_test')) {
      throw new Error('Segurança: o banco deve terminar em _tec07_regression_test');
    }
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
    contrato1 = await criarContrato(`TEC07/QA/1/${idExecucao}`);
    contrato2 = await criarContrato(`TEC07/QA/2/${idExecucao}`);
    etapa1 = await criarEtapa(contrato1);
    etapa2 = await criarEtapa(contrato2);
    for (const [tipo, st] of Object.entries(sts)) {
      const perfil = tipo === 'admin' ? 'ADMINISTRADOR'
        : tipo === 'gestor' ? 'GESTOR' : 'COLABORADOR';
      const [u] = await db.query(`
        INSERT INTO usuarios (supertokens_user_id, email, nome, perfil, ativo)
        VALUES ($1, $2, 'Usuário de QA', $3, $4) RETURNING id
      `, [st, `${tipo}-${idExecucao}@invalid`, perfil, tipo !== 'inativo']) as Array<{ id: string }>;
      usuarios[tipo] = u.id;
    }
    const conceder = async (usuarioId: string, podeEditar: boolean): Promise<string> => {
      const [v] = await db.query(`
        INSERT INTO permissoes_contrato (usuario_id, contrato_id, pode_editar)
        VALUES ($1, $2, $3) RETURNING id
      `, [usuarioId, contrato1, podeEditar]) as Array<{ id: string }>;
      return v.id;
    };
    idPermissaoGestor = await conceder(usuarios.gestor, true);
    idPermissaoColaborador = await conceder(usuarios.colaborador, false);

    const auditoria = new AuditoriaService(db);
    const politica = new PoliticaAcessoService(db.getRepository(PermissaoContrato));
    const escopos = new ResolverEscopoContratoService(db.getRepository(Contrato), db.getRepository(Etapa));
    const contratosService = new ContratosService(db.getRepository(Contrato), auditoria);
    const sessaoSimulada = {
      identificar: async (req: RequisicaoAutorizada) => {
        const st = req.headers['x-qa-session'];
        if (typeof st !== 'string' || !st) throw new UnauthorizedException('Sessão obrigatória');
        return st;
      },
    } as unknown as SessaoSuperTokensService;
    const dominioReal = {
      buscarAtivoPorSupertokensId: (st: string) =>
        db.getRepository(Usuario).findOneBy({ supertokensUserId: st, ativo: true }),
    } as unknown as UsuariosService;

    const modulo = await Test.createTestingModule({
      controllers: [RotasSomenteDeTeste],
      providers: [
        { provide: DataSource, useValue: db },
        { provide: ContratosService, useValue: contratosService },
      ],
    }).compile();
    app = modulo.createNestApplication();
    app.useGlobalGuards(new AutorizacaoGuard(
      modulo.get(Reflector), sessaoSimulada, dominioReal, politica, escopos,
    ));
    await app.init();
  });

  afterAll(async () => {
    if (app) await app.close();
    if (!db?.isInitialized) return;
    try {
      if (etapa1 || etapa2) {
        await db.query('DELETE FROM eventos_auditoria WHERE entidade_tipo = $1 AND entidade_id = ANY($2::varchar[])',
          ['ETAPA', [etapa1, etapa2].filter(Boolean)]);
      }
      for (const id of [idPermissaoGestor, idPermissaoColaborador].filter(Boolean)) {
        await db.query('DELETE FROM permissoes_contrato WHERE id = $1', [id]);
      }
      for (const id of [etapa1, etapa2].filter(Boolean)) await db.query('DELETE FROM etapas WHERE id = $1', [id]);
      for (const id of [contrato1, contrato2].filter(Boolean)) await db.query('DELETE FROM contratos WHERE id = $1', [id]);
      for (const id of Object.values(usuarios)) await db.query('DELETE FROM usuarios WHERE id = $1', [id]);
    } finally {
      await db.destroy();
    }
  });

  it('401/403: sessão ausente, não provisionado e inativo não acessam a carteira', async () => {
    await request(app.getHttpServer()).get('/qa-seguranca/carteira').expect(401);
    await request(app.getHttpServer()).get('/qa-seguranca/carteira')
      .set('x-qa-session', `nao-provisionado-${idExecucao}`).expect(403);
    await request(app.getHttpServer()).get('/qa-seguranca/carteira')
      .set(chamar('inativo')).expect(403);
  });

  it('ADMIN global consulta ambos os contratos existentes, mas não inventa uma Etapa', async () => {
    const r = await request(app.getHttpServer()).get('/qa-seguranca/carteira').set(chamar('admin')).expect(200);
    expect(r.body).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: contrato1 }), expect.objectContaining({ id: contrato2 }),
    ]));
    await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato2}/etapas/${etapa2}`)
      .set(chamar('admin')).expect(200);
    await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato2}/etapas/${UUID_INEXISTENTE}`)
      .set(chamar('admin')).expect(404);
  });

  it('Gestor/Colaborador veem somente carteira e Etapas de contratos vinculados', async () => {
    for (const tipo of ['gestor', 'colaborador'] as const) {
      const r = await request(app.getHttpServer()).get('/qa-seguranca/carteira').set(chamar(tipo)).expect(200);
      expect(r.body.map((c: { id: string }) => c.id)).toEqual([contrato1]);
      const e = await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato1}/etapas`)
        .set(chamar(tipo)).expect(200);
      expect(e.body.map((item: { id: string }) => item.id)).toEqual([etapa1]);
      await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato2}/etapas`)
        .set(chamar(tipo)).expect(404);
    }
  });

  it('IDs cruzados e UUIDs inválidos recebem 404 uniforme, sem retornar conteúdo', async () => {
    for (const tipo of ['admin', 'gestor', 'colaborador'] as const) {
      for (const rota of [
        `/qa-seguranca/contratos/${contrato1}/etapas/${etapa2}`,
        `/qa-seguranca/contratos/${contrato2}/etapas/${etapa1}`,
        `/qa-seguranca/contratos/${contrato1}/etapas/invalido`,
      ]) {
        const r = await request(app.getHttpServer()).get(rota).set(chamar(tipo)).expect(404);
        expect(JSON.stringify(r.body)).not.toContain('Etapa QA');
      }
    }
  });

  it('planejamento é restrito, mas atividade operacional é permitida ao Colaborador vinculado', async () => {
    await request(app.getHttpServer()).patch(`/qa-seguranca/contratos/${contrato1}/etapas/${etapa1}`)
      .set(chamar('gestor')).expect(200);
    await request(app.getHttpServer()).patch(`/qa-seguranca/contratos/${contrato1}/etapas/${etapa1}`)
      .set({ ...chamar('colaborador'), 'x-role': 'ADMINISTRADOR' }).expect(404);
    await request(app.getHttpServer()).post(`/qa-seguranca/contratos/${contrato1}/atividades`)
      .set(chamar('colaborador')).expect(201);
    await request(app.getHttpServer()).post(`/qa-seguranca/contratos/${contrato2}/atividades`)
      .set(chamar('colaborador')).expect(404);
  });

  it('Gestor perde edição quando pode_editar=false, mantendo apenas leitura', async () => {
    await db.query('UPDATE permissoes_contrato SET pode_editar = false WHERE id = $1', [idPermissaoGestor]);
    try {
      await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato1}/etapas/${etapa1}`)
        .set(chamar('gestor')).expect(200);
      await request(app.getHttpServer()).patch(`/qa-seguranca/contratos/${contrato1}/etapas/${etapa1}`)
        .set(chamar('gestor')).expect(404);
    } finally {
      await db.query('UPDATE permissoes_contrato SET pode_editar = true WHERE id = $1', [idPermissaoGestor]);
    }
  });

  it('revogação de vínculo entra em vigor na próxima requisição e zera a carteira', async () => {
    await db.query('DELETE FROM permissoes_contrato WHERE id = $1', [idPermissaoGestor]);
    idPermissaoGestor = '';
    await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${contrato1}/etapas/${etapa1}`)
      .set(chamar('gestor')).expect(404);
    const r = await request(app.getHttpServer()).get('/qa-seguranca/carteira').set(chamar('gestor')).expect(200);
    expect(r.body).toEqual([]);
    // Recompõe fixture para não tornar outro teste dependente desta revogação.
    const [v] = await db.query(`INSERT INTO permissoes_contrato (usuario_id, contrato_id, pode_editar)
      VALUES ($1, $2, true) RETURNING id`, [usuarios.gestor, contrato1]) as Array<{ id: string }>;
    idPermissaoGestor = v.id;
  });

  it('sem política, adaptador futuro ausente e recurso inexistente não autorizam', async () => {
    await request(app.getHttpServer()).get('/qa-seguranca/sem-politica')
      .set(chamar('admin')).expect(403);
    await request(app.getHttpServer()).get(`/qa-seguranca/documentos/${UUID_INEXISTENTE}`)
      .set(chamar('admin')).expect(404);
    await request(app.getHttpServer()).get(`/qa-seguranca/contratos/${UUID_INEXISTENTE}/etapas`)
      .set(chamar('admin')).expect(404);
  });

  it('evento de auditoria conserva contrato da Etapa, sem dados secretos; legado continua nulo', async () => {
    const auditoria = new AuditoriaService(db);
    const ator = { id: usuarios.gestor, supertokensUserId: sts.gestor,
      email: 'qa@invalid', perfil: PerfilUsuario.GESTOR };
    await db.transaction((manager) => auditoria.registrarNaTransacao(manager, ator, {
      acao: AcaoAuditoria.ETAPA_EDITADA, entidadeTipo: 'ETAPA', entidadeId: etapa1,
      dadosAnteriores: { nome: 'Antes' },
      dadosPosteriores: { nome: 'Depois', token: 'NAO-PERSISTIR' },
    }));
    const [gravado] = await db.query(`SELECT contrato_id, dados_posteriores FROM eventos_auditoria
      WHERE entidade_tipo = 'ETAPA' AND entidade_id = $1 ORDER BY registrado_em DESC LIMIT 1`,
    [etapa1]) as Array<{ contrato_id: string; dados_posteriores: Record<string, unknown> }>;
    expect(gravado).toEqual({ contrato_id: contrato1, dados_posteriores: { nome: 'Depois' } });
    const [legado] = await db.query(`INSERT INTO eventos_auditoria
      (ator_supertokens_user_id, acao, entidade_tipo, entidade_id)
      VALUES ($1, 'USUARIO_CRIADO', 'USUARIO', $2) RETURNING contrato_id`,
    [sts.admin, `legado-${idExecucao}`]) as Array<{ contrato_id: string | null }>;
    expect(legado.contrato_id).toBeNull();
    await db.query('DELETE FROM eventos_auditoria WHERE entidade_id = $1', [`legado-${idExecucao}`]);
  });

  it('falha na escrita do evento desfaz a alteração da Etapa e não cria evento órfão', async () => {
    const auditoria = new AuditoriaService(db);
    const ator = { id: usuarios.admin, supertokensUserId: sts.admin,
      email: 'qa@invalid', perfil: PerfilUsuario.ADMINISTRADOR };
    await expect(db.transaction(async (manager) => {
      await manager.query('UPDATE etapas SET nome = $1 WHERE id = $2', ['NAO-PERSISTIR', etapa2]);
      await auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_EDITADA, entidadeTipo: 'USUARIO', entidadeId: etapa2,
      });
    })).rejects.toThrow('Recurso de auditoria inválido');
    const [linha] = await db.query('SELECT nome FROM etapas WHERE id = $1', [etapa2]) as Array<{ nome: string }>;
    expect(linha.nome).toBe('Etapa QA');
    const [quantidade] = await db.query(`SELECT COUNT(*)::int AS total FROM eventos_auditoria
      WHERE entidade_tipo = 'ETAPA' AND entidade_id = $1`, [etapa2]) as Array<{ total: number }>;
    expect(quantidade.total).toBe(0);
  });
});
