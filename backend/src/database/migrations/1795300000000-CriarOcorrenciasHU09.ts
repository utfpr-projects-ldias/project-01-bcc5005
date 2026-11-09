import {
  MigrationInterface,
  QueryRunner,
} from 'typeorm';

/**
 * HU09-01 — criação da estrutura de ocorrências.
 *
 * Migration aditiva:
 *
 * - Cria ocorrencias.
 * - Preserva os entregáveis existentes.
 * - Acrescenta ocorrenciaId opcional em atividades.
 * - Mantém compatibilidade com atividades HU08 já persistidas.
 * - Impede vínculos entre contratos diferentes.
 * - Implementa idempotência somente para ocorrências recorrentes.
 *
 * Não gera ocorrências automaticamente.
 * Não modifica os registros existentes de atividades.
 * Não implementa a integração operacional HU09-05.
 */
export class CriarOcorrenciasHU091795300000000
  implements MigrationInterface {

  name = 'CriarOcorrenciasHU091795300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {

    /**
     * 1. Índice composto de entregáveis.
     *
     * O ID já é PK, mas a FK composta precisa de uma chave
     * única explícita em (id, contrato_id).
     *
     * Não altera os registros existentes.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_entregaveis_id_contrato"
      ON "entregaveis" ("id", "contrato_id")
    `);

    /**
     * 2. Enum de origem.
     */
    await queryRunner.query(`
      CREATE TYPE "ocorrencias_origem_enum"
      AS ENUM (
        'RECORRENTE',
        'MANUAL_QUANTITATIVA'
      )
    `);

    /**
     * 3. Enum de status operacional.
     */
    await queryRunner.query(`
      CREATE TYPE "ocorrencias_status_enum"
      AS ENUM (
        'NAO_INICIADO',
        'EM_ANDAMENTO',
        'CONCLUIDO'
      )
    `);

    /**
     * 4. Tabela principal.
     *
     * contrato_id é uma referência redundante necessária
     * à FK composta.
     *
     * O valor é obrigatoriamente igual ao contrato
     * do entregável associado.
     */
    await queryRunner.query(`
      CREATE TABLE "ocorrencias" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),

        "entregavel_id" uuid NOT NULL,

        "contrato_id" uuid NOT NULL,

        "titulo" varchar(255) NOT NULL,

        "periodo_inicio" date NULL,

        "periodo_fim" date NULL,

        "data_prevista" date NULL,

        "data_realizada" date NULL,

        "status" "ocorrencias_status_enum"
          NOT NULL DEFAULT 'NAO_INICIADO',

        "quantidade_realizada" numeric(18,3) NULL,

        "observacoes" text NULL,

        "origem" "ocorrencias_origem_enum" NOT NULL,

        CONSTRAINT "pk_ocorrencias"
          PRIMARY KEY ("id"),

        CONSTRAINT "fk_ocorrencias_entregavel_contrato"
          FOREIGN KEY ("entregavel_id", "contrato_id")
          REFERENCES "entregaveis" ("id", "contrato_id")
          ON DELETE RESTRICT
          ON UPDATE RESTRICT,

        CONSTRAINT "ck_ocorrencias_titulo_nao_vazio"
          CHECK (length(btrim("titulo")) > 0),

        CONSTRAINT "ck_ocorrencias_periodo_datas"
          CHECK (
            "periodo_inicio" IS NULL
            OR "periodo_fim" IS NULL
            OR "periodo_fim" >= "periodo_inicio"
          ),

        CONSTRAINT "ck_ocorrencias_recorrente_periodo"
          CHECK (
            "origem" <> 'RECORRENTE'
            OR (
              "periodo_inicio" IS NOT NULL
              AND "periodo_fim" IS NOT NULL
            )
          ),

        CONSTRAINT "ck_ocorrencias_quantidade"
          CHECK (
            "quantidade_realizada" IS NULL
            OR "quantidade_realizada" >= 0
          )
      )
    `);

    /**
     * 5. Chave única composta da ocorrência.
     *
     * Necessária para a FK composta utilizada pela atividade.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ocorrencias_id_contrato"
      ON "ocorrencias" ("id", "contrato_id")
    `);

    /**
     * 6. Índice da agenda por contrato e período.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_ocorrencias_agenda_periodo"
      ON "ocorrencias" (
        "contrato_id",
        "periodo_inicio",
        "periodo_fim"
      )
    `);

    /**
     * 7. Índice da agenda por data prevista e status.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_ocorrencias_agenda_data_prevista"
      ON "ocorrencias" (
        "contrato_id",
        "data_prevista",
        "status"
      )
    `);

    /**
     * 8. Índice para consultar ocorrências de um entregável.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_ocorrencias_entregavel_periodo"
      ON "ocorrencias" (
        "entregavel_id",
        "periodo_inicio",
        "periodo_fim"
      )
    `);

    /**
     * 9. Idempotência.
     *
     * Uma ocorrência recorrente não pode ser duplicada
     * para o mesmo entregável e período.
     *
     * MANUAL_QUANTITATIVA está fora do índice parcial.
     */
    await queryRunner.query(`
      CREATE UNIQUE INDEX "uq_ocorrencias_recorrente_periodo"
      ON "ocorrencias" (
        "entregavel_id",
        "periodo_inicio",
        "periodo_fim"
      )
      WHERE "origem" = 'RECORRENTE'
    `);

    /**
     * 10. Documentação da tabela.
     */
    await queryRunner.query(`
      COMMENT ON TABLE "ocorrencias" IS
      'HU09: instâncias individuais de execução de entregáveis.'
    `);

    /**
     * 11. Documentação da chave de referência.
     *
     * A configuração V1 do entregável possui versao=1,
     * mas essa propriedade representa a versão estrutural
     * do JSON, não uma revisão histórica do planejamento.
     *
     * A idempotência V1 é baseada no período de referência.
     */
    await queryRunner.query(`
      COMMENT ON COLUMN "ocorrencias"."origem" IS
      'RECORRENTE possui unicidade parcial por entregavel e periodo; MANUAL_QUANTITATIVA permite múltiplas execuções no mesmo periodo.'
    `);

    /**
     * 12. Validação da compatibilidade entre origem e tipo.
     *
     * Não é possível implementar esse CHECK diretamente
     * porque a regra depende de outra tabela.
     *
     * O trigger impede:
     * - RECORRENTE em entregável não recorrente.
     * - MANUAL_QUANTITATIVA em entregável não quantitativo.
     */
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION "fn_ocorrencias_validar_origem_hu09"()
      RETURNS trigger
      LANGUAGE plpgsql
      AS $$
      DECLARE
        tipo_entregavel text;
      BEGIN

        SELECT e.tipo::text
          INTO tipo_entregavel
        FROM "entregaveis" e
        WHERE e.id = NEW.entregavel_id
          AND e.contrato_id = NEW.contrato_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION
            'Entregável inexistente ou pertencente a outro contrato.'
            USING
              ERRCODE = '23503',
              CONSTRAINT = 'fk_ocorrencias_entregavel_contrato';
        END IF;

        IF NEW.origem = 'RECORRENTE'
           AND tipo_entregavel <> 'RECORRENTE' THEN

          RAISE EXCEPTION
            'Ocorrência recorrente exige entregável do tipo RECORRENTE.'
            USING
              ERRCODE = '23514',
              CONSTRAINT = 'ck_ocorrencias_origem_tipo';
        END IF;

        IF NEW.origem = 'MANUAL_QUANTITATIVA'
           AND tipo_entregavel <> 'QUANTITATIVO' THEN

          RAISE EXCEPTION
            'Ocorrência manual quantitativa exige entregável QUANTITATIVO.'
            USING
              ERRCODE = '23514',
              CONSTRAINT = 'ck_ocorrencias_origem_tipo';
        END IF;

        RETURN NEW;

      END;
      $$
    `);

    /**
     * 13. Trigger de domínio.
     */
    await queryRunner.query(`
      CREATE TRIGGER "trg_ocorrencias_validar_origem"
      BEFORE INSERT OR UPDATE OF
        "entregavel_id",
        "contrato_id",
        "origem"
      ON "ocorrencias"
      FOR EACH ROW
      EXECUTE FUNCTION "fn_ocorrencias_validar_origem_hu09"()
    `);

    /**
     * 14. Associação opcional na tabela de atividades.
     *
     * A coluna aceita NULL para preservar integralmente
     * as atividades HU08 preexistentes.
     */
    await queryRunner.query(`
      ALTER TABLE "atividades"
      ADD COLUMN "ocorrenciaId" uuid NULL
    `);

    /**
     * 15. FK composta.
     *
     * A atividade só poderá referenciar uma ocorrência
     * pertencente ao mesmo contrato.
     *
     * Se ocorrenciaId for NULL, a FK não exige associação.
     */
    await queryRunner.query(`
      ALTER TABLE "atividades"
      ADD CONSTRAINT "fk_atividades_ocorrencia_contrato"
      FOREIGN KEY ("ocorrenciaId", "contratoId")
      REFERENCES "ocorrencias" ("id", "contrato_id")
      ON DELETE RESTRICT
      ON UPDATE RESTRICT
    `);

    /**
     * 16. Índice para navegação atividade → ocorrência.
     */
    await queryRunner.query(`
      CREATE INDEX "idx_atividades_ocorrencia"
      ON "atividades" ("ocorrenciaId")
      WHERE "ocorrenciaId" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {

    /**
     * Proteção contra perda de histórico.
     *
     * A reversão só será permitida quando a tabela
     * não possuir ocorrências persistidas.
     */
    await queryRunner.query(`
      DO $$
      BEGIN

        IF EXISTS (
          SELECT 1
          FROM "ocorrencias"
          LIMIT 1
        ) THEN

          RAISE EXCEPTION
            'Não é possível reverter HU09-01: existem ocorrências persistidas. Preserve o histórico antes da reversão.';

        END IF;

      END;
      $$
    `);

    await queryRunner.query(`
      ALTER TABLE "atividades"
      DROP CONSTRAINT "fk_atividades_ocorrencia_contrato"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_atividades_ocorrencia"
    `);

    await queryRunner.query(`
      ALTER TABLE "atividades"
      DROP COLUMN "ocorrenciaId"
    `);

    await queryRunner.query(`
      DROP TRIGGER "trg_ocorrencias_validar_origem"
      ON "ocorrencias"
    `);

    await queryRunner.query(`
      DROP FUNCTION "fn_ocorrencias_validar_origem_hu09"()
    `);

    await queryRunner.query(`
      DROP INDEX "uq_ocorrencias_recorrente_periodo"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_ocorrencias_agenda_periodo"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_ocorrencias_agenda_data_prevista"
    `);

    await queryRunner.query(`
      DROP INDEX "idx_ocorrencias_entregavel_periodo"
    `);

    await queryRunner.query(`
      DROP INDEX "uq_ocorrencias_id_contrato"
    `);

    await queryRunner.query(`
      DROP TABLE "ocorrencias"
    `);

    await queryRunner.query(`
      DROP TYPE "ocorrencias_status_enum"
    `);

    await queryRunner.query(`
      DROP TYPE "ocorrencias_origem_enum"
    `);

    await queryRunner.query(`
      DROP INDEX "uq_entregaveis_id_contrato"
    `);
  }
}