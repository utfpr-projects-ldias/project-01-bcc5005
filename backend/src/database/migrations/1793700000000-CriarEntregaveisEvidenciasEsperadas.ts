import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HU07-01 — aditiva e sem UPDATE/DELETE em registros existentes.
 * ÚNICA modificação em tabela preexistente: uma UNIQUE redundante sobre o PK
 * (id, contrato_id) necessária à FK composta que impede etapas de outro contrato.
 * Não executar down no banco DEV com dados: reservada a bancos descartáveis.
 */
export class CriarEntregaveisEvidenciasEsperadas1793700000000 implements MigrationInterface {
  name = 'CriarEntregaveisEvidenciasEsperadas1793700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "etapas"
      ADD CONSTRAINT "uq_etapas_id_contrato" UNIQUE ("id", "contrato_id")
    `);

    await queryRunner.query(`
      CREATE TYPE "entregaveis_tipo_enum" AS ENUM (
        'UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "entregaveis_periodicidade_enum" AS ENUM (
        'DIARIA', 'SEMANAL', 'MENSAL', 'TRIMESTRAL', 'SEMESTRAL', 'ANUAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "entregaveis_status_execucao_enum" AS ENUM (
        'NAO_INICIADO', 'EM_ANDAMENTO', 'CONCLUIDO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "entregaveis_situacao_comprovacao_enum" AS ENUM (
        'SEM_EVIDENCIA', 'EVIDENCIA_PARCIAL', 'COMPROVADO'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "entregaveis" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contrato_id" uuid NOT NULL,
        "etapa_id" uuid NOT NULL,
        "codigo" varchar(50) NULL,
        "nome" varchar(255) NOT NULL,
        "descricao" text NULL,
        "tipo" "entregaveis_tipo_enum" NOT NULL,
        "responsavel_id" uuid NULL,
        "inicio_previsto" date NULL,
        "termino_previsto" date NULL,
        "quantidade_prevista" numeric(18,3) NULL,
        "quantidade_realizada" numeric(18,3) NULL,
        "unidade_medida" varchar(80) NULL,
        "periodicidade" "entregaveis_periodicidade_enum" NULL,
        "configuracao_periodicidade" jsonb NULL,
        "peso" numeric(7,4) NULL,
        "criterio_conclusao" text NULL,
        "status_execucao" "entregaveis_status_execucao_enum" NULL,
        "percentual_execucao" numeric(5,2) NULL,
        "situacao_comprovacao" "entregaveis_situacao_comprovacao_enum" NULL,
        "observacoes" text NULL,

        CONSTRAINT "pk_entregaveis" PRIMARY KEY ("id"),
        CONSTRAINT "fk_entregaveis_contrato"
          FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_entregaveis_etapa_contrato"
          FOREIGN KEY ("etapa_id", "contrato_id")
          REFERENCES "etapas"("id", "contrato_id") ON DELETE RESTRICT,
        CONSTRAINT "fk_entregaveis_responsavel"
          FOREIGN KEY ("responsavel_id") REFERENCES "usuarios"("id") ON DELETE SET NULL,
        CONSTRAINT "ck_entregaveis_nome_nao_vazio" CHECK (length(btrim("nome")) > 0),
        CONSTRAINT "ck_entregaveis_codigo_nao_vazio"
          CHECK ("codigo" IS NULL OR length(btrim("codigo")) > 0),
        CONSTRAINT "ck_entregaveis_datas"
          CHECK ("inicio_previsto" IS NULL OR "termino_previsto" IS NULL
                 OR "termino_previsto" >= "inicio_previsto"),
        CONSTRAINT "ck_entregaveis_quantidades"
          CHECK (("quantidade_prevista" IS NULL OR "quantidade_prevista" >= 0)
             AND ("quantidade_realizada" IS NULL OR "quantidade_realizada" >= 0)),
        CONSTRAINT "ck_entregaveis_unidade_nao_vazia"
          CHECK ("unidade_medida" IS NULL OR length(btrim("unidade_medida")) > 0),
        CONSTRAINT "ck_entregaveis_quantitativo"
          CHECK ("tipo" <> 'QUANTITATIVO'
            OR ("quantidade_prevista" IS NOT NULL AND "quantidade_prevista" > 0 AND "unidade_medida" IS NOT NULL
                AND length(btrim("unidade_medida")) > 0)),
        CONSTRAINT "ck_entregaveis_peso" CHECK ("peso" IS NULL OR ("peso" >= 0 AND "peso" <= 100)),
        CONSTRAINT "ck_entregaveis_percentual"
          CHECK ("percentual_execucao" IS NULL
                 OR ("percentual_execucao" >= 0 AND "percentual_execucao" <= 100)),
        CONSTRAINT "ck_entregaveis_recorrencia"
          CHECK (
            ("tipo" = 'RECORRENTE' AND "periodicidade" IS NOT NULL
             AND "configuracao_periodicidade" IS NOT NULL
             AND jsonb_typeof("configuracao_periodicidade") = 'object'
             AND "configuracao_periodicidade" = '{"versao":1}'::jsonb)
            OR
            ("tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL
             AND "configuracao_periodicidade" IS NULL)
          )
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "evidencias_esperadas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "entregavel_id" uuid NOT NULL,
        "tipo_evidencia" varchar(100) NOT NULL,
        "descricao" text NULL,
        "obrigatoria" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_evidencias_esperadas" PRIMARY KEY ("id"),
        CONSTRAINT "fk_evidencias_esperadas_entregavel"
          FOREIGN KEY ("entregavel_id") REFERENCES "entregaveis"("id") ON DELETE RESTRICT,
        CONSTRAINT "ck_evidencias_esperadas_tipo_nao_vazio"
          CHECK (length(btrim("tipo_evidencia")) > 0),
        CONSTRAINT "ck_evidencias_esperadas_descricao_nao_vazia"
          CHECK ("descricao" IS NULL OR length(btrim("descricao")) > 0)
      )
    `);

    await queryRunner.query('CREATE INDEX "idx_entregaveis_contrato_etapa" ON "entregaveis" ("contrato_id", "etapa_id")');
    await queryRunner.query('CREATE INDEX "idx_entregaveis_etapa_tipo" ON "entregaveis" ("etapa_id", "tipo")');
    await queryRunner.query('CREATE INDEX "idx_entregaveis_contrato_termino" ON "entregaveis" ("contrato_id", "termino_previsto")');
    await queryRunner.query('CREATE INDEX "idx_entregaveis_responsavel" ON "entregaveis" ("responsavel_id")');
    await queryRunner.query('CREATE INDEX "idx_evidencias_esperadas_entregavel" ON "evidencias_esperadas" ("entregavel_id")');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_evidencias_esperadas_entregavel"');
    await queryRunner.query('DROP INDEX "idx_entregaveis_responsavel"');
    await queryRunner.query('DROP INDEX "idx_entregaveis_contrato_termino"');
    await queryRunner.query('DROP INDEX "idx_entregaveis_etapa_tipo"');
    await queryRunner.query('DROP INDEX "idx_entregaveis_contrato_etapa"');
    await queryRunner.query('DROP TABLE "evidencias_esperadas"');
    await queryRunner.query('DROP TABLE "entregaveis"');
    await queryRunner.query('DROP TYPE "entregaveis_situacao_comprovacao_enum"');
    await queryRunner.query('DROP TYPE "entregaveis_status_execucao_enum"');
    await queryRunner.query('DROP TYPE "entregaveis_periodicidade_enum"');
    await queryRunner.query('DROP TYPE "entregaveis_tipo_enum"');
    await queryRunner.query('ALTER TABLE "etapas" DROP CONSTRAINT "uq_etapas_id_contrato"');
  }
}
