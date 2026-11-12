import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HU06-01 — migration ADITIVA. Não altera a estrutura nem os dados de contratos,
 * usuários ou auditoria. Requer CriarContratos1793200000000 já aplicada.
 *
 * uq_etapas_contrato_sequencia é DEFERRABLE INITIALLY IMMEDIATE:
 * na futura HU06-02, uma troca de posições poderá ocorrer numa única transação
 * com SET CONSTRAINTS "uq_etapas_contrato_sequencia" DEFERRED.
 */
export class CriarEtapas1793500000000 implements MigrationInterface {
  name = 'CriarEtapas1793500000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "etapas_status_enum" AS ENUM (
        'PLANEJADA', 'EM_ANDAMENTO', 'CONCLUIDA'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "etapas" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contrato_id" uuid NOT NULL,
        "codigo" varchar(50) NULL,
        "nome" varchar(255) NOT NULL,
        "descricao" text NULL,
        "sequencia" integer NOT NULL,
        "inicio_previsto" date NULL,
        "termino_previsto" date NULL,
        "status" "etapas_status_enum" NOT NULL DEFAULT 'PLANEJADA',
        "observacoes" text NULL,

        CONSTRAINT "pk_etapas" PRIMARY KEY ("id"),
        CONSTRAINT "fk_etapas_contrato"
          FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id")
          ON DELETE RESTRICT,
        CONSTRAINT "uq_etapas_contrato_sequencia"
          UNIQUE ("contrato_id", "sequencia") DEFERRABLE INITIALLY IMMEDIATE,
        CONSTRAINT "ck_etapas_sequencia_positiva" CHECK ("sequencia" > 0),
        CONSTRAINT "ck_etapas_nome_nao_vazio" CHECK (length(btrim("nome")) > 0),
        CONSTRAINT "ck_etapas_codigo_nao_vazio"
          CHECK ("codigo" IS NULL OR length(btrim("codigo")) > 0),
        CONSTRAINT "ck_etapas_datas_previstas"
          CHECK (
            "inicio_previsto" IS NULL OR "termino_previsto" IS NULL OR
            "termino_previsto" >= "inicio_previsto"
          )
      )
    `);

    // A constraint UNIQUE já cria índice btree (contrato_id, sequencia).
    // O segundo índice serve à leitura cronológica por contrato (HU11/S05).
    await queryRunner.query(`
      CREATE INDEX "idx_etapas_contrato_inicio_previsto"
      ON "etapas" ("contrato_id", "inicio_previsto")
    `);
  }

  /** Reversão SOMENTE em banco isolado; nunca no DEV com dados reais. */
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_etapas_contrato_inicio_previsto"');
    await queryRunner.query('DROP TABLE "etapas"');
    await queryRunner.query('DROP TYPE "etapas_status_enum"');
  }
}
