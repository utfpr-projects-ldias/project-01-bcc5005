import { migrationsCompletas } from './migrations-completas.fixture.js';
import { codigoPublicoLivreParaTeste } from './codigo-publico-fixture.js';
import 'reflect-metadata';

import { DataSource } from 'typeorm';
import { Contrato } from '../src/contratos/contrato.entity.js';
import { Usuario } from '../src/usuarios/usuario.entity.js';
import { Etapa } from '../src/etapas/etapa.entity.js';
import { PermissaoContrato } from '../src/autorizacao/permissao-contrato.entity.js';
import { ResolverEscopoContratoService } from '../src/autorizacao/resolver-escopo-contrato.service.js';
import { PoliticaAcessoService } from '../src/autorizacao/politica-acesso.service.js';
import { PerfilUsuario } from '../src/usuarios/perfil-usuario.enum.js';

/** Só roda quando a variável de banco explicitamente ISOLADO estiver presente. */
const url = process.env.TEC07_POLICY_TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;

suite('TEC07-AJUSTES-02-02 — escopo real no PostgreSQL isolado', () => {
  let db: DataSource;
  let contratoPermitido: string;
  let contratoAlheio: string;
  let etapaAlheia: string;
  let etapaPermitida: string;

  beforeAll(async () => {
    if (!url) throw new Error('TEC07_POLICY_TEST_DATABASE_URL ausente');
    const nome = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!nome.endsWith('_tec07_policy_test')) {
      throw new Error('Segurança: banco deve terminar em _tec07_policy_test');
    }
    db = await new DataSource({
      type: 'postgres', url, synchronize: false,
      entities: [Contrato, Usuario, Etapa, PermissaoContrato],
      migrations: migrationsCompletas,
    }).initialize();
    await db.runMigrations({ transaction: 'each' });

    const criarContrato = async (numero: string): Promise<string> => {
      const codigoPublico = await codigoPublicoLivreParaTeste(db);
      const [registro] = await db.query(`
        INSERT INTO contratos (numero_contrato, orgao_contratante, objeto,
          inicio_vigencia, termino_vigencia, status, modo_calculo, codigo_publico)
        VALUES ($1, 'Órgão teste', 'Escopo de autorização', '2026-10-01', '2027-10-01',
          'PLANEJAMENTO', 'SIMPLES', $2) RETURNING id
      `, [numero, codigoPublico]) as Array<{ id: string }>;
      return registro.id;
    };
    contratoPermitido = await criarContrato('TEC07-POLICY/PERMITIDO');
    contratoAlheio = await criarContrato('TEC07-POLICY/ALHEIO');
    const criarEtapa = async (contratoId: string): Promise<string> => {
      const [registro] = await db.query(`
        INSERT INTO etapas (contrato_id, nome, sequencia)
        VALUES ($1, 'Etapa isolada', 1) RETURNING id
      `, [contratoId]) as Array<{ id: string }>;
      return registro.id;
    };
    etapaPermitida = await criarEtapa(contratoPermitido);
    etapaAlheia = await criarEtapa(contratoAlheio);
  });

  afterAll(async () => {
    if (!db?.isInitialized) return;
    try {
      if (etapaPermitida) await db.query('DELETE FROM etapas WHERE id = $1', [etapaPermitida]);
      if (etapaAlheia) await db.query('DELETE FROM etapas WHERE id = $1', [etapaAlheia]);
      if (contratoPermitido) await db.query('DELETE FROM contratos WHERE id = $1', [contratoPermitido]);
      if (contratoAlheio) await db.query('DELETE FROM contratos WHERE id = $1', [contratoAlheio]);
    } finally {
      await db.destroy();
    }
  });

  it('deriva contrato raiz real da etapa e bloqueia divergência em rota aninhada', async () => {
    const resolver = new ResolverEscopoContratoService(db.getRepository(Contrato), db.getRepository(Etapa));
    const escopo = { tipo:'recurso', recurso:'etapa', parametro:'etapaId', parametroContratoPai:'contratoId' } as const;
    expect(await resolver.resolver(escopo, { etapaId: etapaPermitida, contratoId: contratoPermitido })).toBe(contratoPermitido);
    expect(await resolver.resolver(escopo, { etapaId: etapaAlheia, contratoId: contratoPermitido })).toBeNull();
    expect(await resolver.resolver(escopo, { etapaId: etapaAlheia, contratoId: contratoAlheio })).toBe(contratoAlheio);
  });

  it('Gestor sem vínculo não ganha acesso e ADMIN não usa contrato fictício', async () => {
    const resolver = new ResolverEscopoContratoService(db.getRepository(Contrato), db.getRepository(Etapa));
    const politica = new PoliticaAcessoService(db.getRepository(PermissaoContrato), db.getRepository(Contrato));
    const gestor = { id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', supertokensUserId: 'fake', email: 'teste@invalid', perfil: PerfilUsuario.GESTOR };
    const admin = { ...gestor, perfil: PerfilUsuario.ADMINISTRADOR };
    const escopo = { tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId' } as const;
    const raiz = await resolver.resolver(escopo, { etapaId: etapaAlheia });
    expect(raiz).toBe(contratoAlheio);
    expect(await politica.permitido(gestor, { acao: 'etapas:visualizar', escopoOperacional: escopo }, raiz!)).toBe(false);
    expect(await politica.permitido(admin, { acao: 'etapas:visualizar', escopoOperacional: escopo }, raiz!)).toBe(true);
    expect(await resolver.resolver(escopo, { etapaId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' })).toBeNull();
  });
  it('B06: rejeita períodos recorrentes sobrepostos, preservando versões substituídas', async () => {
    const qr=db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const [e]=await qr.query(`INSERT INTO entregaveis
        (contrato_id,etapa_id,nome,tipo,inicio_previsto,termino_previsto,periodicidade,configuracao_periodicidade)
        VALUES ($1,$2,'QA B06','RECORRENTE','2026-11-01','2026-11-14','SEMANAL','{"versao":1,"modoRegistro":"DESCRITIVO"}'::jsonb) RETURNING id`,[contratoPermitido,etapaPermitida]) as {id:string}[];
      const inserir=(inicio:string,fim:string)=>qr.query(`INSERT INTO ocorrencias
        (contrato_id,entregavel_id,titulo,origem,modo_registro,periodo_inicio,periodo_fim,data_prevista)
        VALUES ($1,$2,'QA B06','RECORRENTE','DESCRITIVO',$3,$4,$4) RETURNING id`,[contratoPermitido,e.id,inicio,fim]) as Promise<{id:string}[]>;
      const [primeira]=await inserir('2026-11-01','2026-11-07');
      await inserir('2026-11-08','2026-11-14');
      await qr.query('SAVEPOINT b06_sobreposicao');
      await expect(inserir('2026-11-03','2026-11-05')).rejects.toMatchObject({driverError:{code:'23P01',constraint:'ex_b06_agenda_sem_sobreposicao'}});
      await qr.query('ROLLBACK TO SAVEPOINT b06_sobreposicao');
      await qr.query('UPDATE ocorrencias SET substituida_em=now() WHERE id=$1',[primeira.id]);
      await expect(inserir('2026-11-01','2026-11-07')).resolves.toHaveLength(1);
    } finally {
      await qr.rollbackTransaction();
      await qr.release();
    }
  });

});
