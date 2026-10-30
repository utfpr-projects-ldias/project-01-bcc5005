import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { CriarUsuarios1792540000000 } from '../src/database/migrations/1792540000000-CriarUsuarios.js';
import { CriarPermissoesContrato1793000000000 } from '../src/database/migrations/1793000000000-CriarPermissoesContrato.js';
import { CriarEventosAuditoria1793100000000 } from '../src/database/migrations/1793100000000-CriarEventosAuditoria.js';
import { CriarContratos1793200000000 } from '../src/database/migrations/1793200000000-CriarContratos.js';
import { AdicionarNomeUsuarios1793300000000 } from '../src/database/migrations/1793300000000-AdicionarNomeUsuarios.js';
import { FkPermissaoContrato1793400000000 } from '../src/database/migrations/1793400000000-FkPermissaoContrato.js';
import { CriarEtapas1793500000000 } from '../src/database/migrations/1793500000000-CriarEtapas.js';
import { ContextoAuditoriaOperacional1793600000000 } from '../src/database/migrations/1793600000000-ContextoAuditoriaOperacional.js';
import { Usuario } from '../src/usuarios/usuario.entity.js';
import { Contrato } from '../src/contratos/contrato.entity.js';
import { Etapa } from '../src/etapas/etapa.entity.js';
import { EventoAuditoria } from '../src/auditoria/evento-auditoria.entity.js';
import { AuditoriaService } from '../src/auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../src/auditoria/acao-auditoria.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/**
 * Banco isolado obrigatório, criado explicitamente pelo desenvolvedor.
 * Não usa DATABASE_URL e NUNCA modifica ambiente de desenvolvimento.
 * Ao iniciar cria linhas temporárias e as remove em afterAll.
 */
const url = process.env.TEC07_AUDIT_TEST_DATABASE_URL;
const describeBanco = url ? describe : describe.skip;
const legadas = [
  CriarUsuarios1792540000000, CriarPermissoesContrato1793000000000,
  CriarEventosAuditoria1793100000000, CriarContratos1793200000000,
  AdicionarNomeUsuarios1793300000000, FkPermissaoContrato1793400000000,
  CriarEtapas1793500000000,
];
const todas = [...legadas, ContextoAuditoriaOperacional1793600000000];

const ator = {
  id: '00000000-0000-4000-8000-000000000030',
  supertokensUserId: 'usuario-do-teste-isolado',
  email: 'teste@exemplo.invalid', perfil: PerfilUsuario.ADMINISTRADOR,
};

describeBanco('TEC07-AJUSTES-02-01 - PostgreSQL isolado', () => {
  let db: DataSource;
  let idContrato: string;
  let idEtapa: string;
  let idEventoLegado: string;

  const abrir = async (migrations: typeof todas): Promise<DataSource> => {
    if (!url) throw new Error('TEC07_AUDIT_TEST_DATABASE_URL obrigatória');
    const nome = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    if (!nome.endsWith('_tec07_audit_test')) {
      throw new Error('Segurança: o banco deve terminar em _tec07_audit_test');
    }
    return new DataSource({
      type: 'postgres', url, synchronize: false, migrations,
      entities: [Usuario, Contrato, Etapa, EventoAuditoria],
    }).initialize();
  };

  beforeAll(async () => {
    db = await abrir(legadas);
    await db.runMigrations();
    const [legado] = await db.query(`
      INSERT INTO eventos_auditoria (ator_supertokens_user_id, acao, entidade_tipo, entidade_id, dados_posteriores)
      VALUES ('usuario-legado', 'USUARIO_CRIADO', 'USUARIO', 'legado-123', '{"nome":"Legado"}'::jsonb)
      RETURNING id
    `) as Array<{ id: string }>;
    idEventoLegado = legado.id;
    await db.destroy();

    db = await abrir(todas);
    await db.runMigrations();
    const [contrato] = await db.query(`
      INSERT INTO contratos (numero_contrato, orgao_contratante, objeto,
        inicio_vigencia, termino_vigencia, status, modo_calculo)
      VALUES ('AUDIT/ISOLADO', 'Órgão E2E', 'Contrato de teste',
        '2026-10-01', '2027-10-01', 'PLANEJAMENTO', 'SIMPLES') RETURNING id
    `) as Array<{ id: string }>;
    idContrato = contrato.id;
    const [etapa] = await db.query(`
      INSERT INTO etapas (contrato_id, nome, sequencia)
      VALUES ($1, 'Etapa auditada', 1) RETURNING id
    `, [idContrato]) as Array<{ id: string }>;
    idEtapa = etapa.id;
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      if (idEtapa) await db.query('DELETE FROM eventos_auditoria WHERE entidade_tipo = $1 AND entidade_id = $2', ['ETAPA', idEtapa]);
      if (idContrato) await db.query('DELETE FROM eventos_auditoria WHERE entidade_tipo = $1 AND entidade_id = $2', ['CONTRATO', idContrato]);
      if (idEventoLegado) await db.query('DELETE FROM eventos_auditoria WHERE id = $1', [idEventoLegado]);
      if (idEtapa) await db.query('DELETE FROM etapas WHERE id = $1', [idEtapa]);
      if (idContrato) await db.query('DELETE FROM contratos WHERE id = $1', [idContrato]);
    } finally {
      await db.destroy();
    }
  });

  it('migration mantém evento legado e adiciona coluna sem backfill inventado', async () => {
    const [registro] = await db.query(`
      SELECT acao, entidade_tipo, entidade_id, dados_posteriores, contrato_id
      FROM eventos_auditoria WHERE id = $1
    `, [idEventoLegado]) as Array<Record<string, unknown>>;
    expect(registro).toEqual({
      acao: 'USUARIO_CRIADO', entidade_tipo: 'USUARIO', entidade_id: 'legado-123',
      dados_posteriores: { nome: 'Legado' }, contrato_id: null,
    });
  });

  it('grava Etapa e contrato raiz derivado da FK persistida', async () => {
    const auditoria = new AuditoriaService(db);
    await db.transaction(async (manager) => {
      await auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_EDITADA, entidadeTipo: 'ETAPA', entidadeId: idEtapa,
        dadosAnteriores: { nome: 'Antes' }, dadosPosteriores: { nome: 'Depois', password: 'NAO_GRAVAR' },
      });
    });
    const [evento] = await db.query(`
      SELECT contrato_id, dados_posteriores, ator_supertokens_user_id FROM eventos_auditoria
      WHERE entidade_tipo = 'ETAPA' AND entidade_id = $1 ORDER BY registrado_em DESC LIMIT 1
    `, [idEtapa]) as Array<Record<string, unknown>>;
    expect(evento).toEqual({
      contrato_id: idContrato, dados_posteriores: { nome: 'Depois' },
      ator_supertokens_user_id: ator.supertokensUserId,
    });
  });

  it('erro de auditoria desfaz escrita de domínio no mesmo transaction manager', async () => {
    const auditoria = new AuditoriaService(db);
    const nome = 'ETAPA-DE-ROLLBACK-TEC07';
    await expect(db.transaction(async (manager) => {
      const [nova] = await manager.query(`
        INSERT INTO etapas (contrato_id, nome, sequencia)
        VALUES ($1, $2, 2) RETURNING id
      `, [idContrato, nome]) as Array<{ id: string }>;
      await auditoria.registrarNaTransacao(manager, ator, {
        acao: AcaoAuditoria.ETAPA_CRIADA,
        entidadeTipo: 'USUARIO', entidadeId: nova.id,
      });
    })).rejects.toThrow('Recurso de auditoria inválido');
    const [linha] = await db.query('SELECT COUNT(*)::int AS total FROM etapas WHERE nome = $1', [nome]) as Array<{ total: number }>;
    expect(linha.total).toBe(0);
  });

  it('down/reversão reversível em ROLLBACK preserva históricos', async () => {
    const runner = db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await new ContextoAuditoriaOperacional1793600000000().down(runner);
      expect(await runner.hasColumn('eventos_auditoria', 'contrato_id')).toBe(false);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    const [check] = await db.query(`
      SELECT contrato_id FROM eventos_auditoria WHERE id = $1
    `, [idEventoLegado]) as Array<{ contrato_id: string | null }>;
    expect(check.contrato_id).toBeNull();
  });
});
