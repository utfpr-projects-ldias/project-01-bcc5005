import { MigrationInterface, QueryRunner } from 'typeorm';

/** Vínculos N:N com escopo por contrato, sem duplicar a contabilização da quantidade. */
export class AtividadesMultiplasOcorrencias1796200000000 implements MigrationInterface {
  name = 'AtividadesMultiplasOcorrencias1796200000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "atividade_ocorrencias" (
      "atividadeId" uuid NOT NULL,
      "ocorrenciaId" uuid NOT NULL,
      "contratoId" uuid NOT NULL,
      CONSTRAINT "pk_atividade_ocorrencias" PRIMARY KEY ("atividadeId", "ocorrenciaId"),
      CONSTRAINT "fk_atividade_ocorrencias_atividade" FOREIGN KEY ("atividadeId", "contratoId") REFERENCES "atividades" ("id", "contratoId") ON DELETE RESTRICT,
      CONSTRAINT "fk_atividade_ocorrencias_ocorrencia" FOREIGN KEY ("ocorrenciaId", "contratoId") REFERENCES "ocorrencias" ("id", "contrato_id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE OR REPLACE FUNCTION "fn_vinculo_atividade_ocorrencia_contrato"()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
        SELECT "contratoId" INTO NEW."contratoId" FROM "atividades" WHERE id=NEW."atividadeId";
        IF NEW."contratoId" IS NULL THEN RAISE EXCEPTION 'Atividade inexistente.' USING ERRCODE='23503'; END IF;
        RETURN NEW;
      END; $$`);
    await q.query(`CREATE TRIGGER "trg_vinculo_atividade_ocorrencia_contrato"
      BEFORE INSERT OR UPDATE OF "atividadeId", "ocorrenciaId" ON "atividade_ocorrencias"
      FOR EACH ROW EXECUTE FUNCTION "fn_vinculo_atividade_ocorrencia_contrato"()`);
    await q.query(`CREATE INDEX "idx_atividade_ocorrencias_ocorrencia" ON "atividade_ocorrencias" ("ocorrenciaId")`);
    await q.query(`INSERT INTO "atividade_ocorrencias" ("atividadeId", "ocorrenciaId", "contratoId")
      SELECT id, "ocorrenciaId", "contratoId" FROM "atividades" WHERE "ocorrenciaId" IS NOT NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Não remover associações múltiplas silenciosamente.
    const extras: Array<{total: string}> = await q.query(`SELECT COUNT(*)::text AS total FROM "atividade_ocorrencias" v
      JOIN "atividades" a ON a.id=v."atividadeId"
      WHERE a."ocorrenciaId" IS DISTINCT FROM v."ocorrenciaId"`);
    if (Number(extras[0]?.total ?? 0) !== 0) throw new Error('Existem vínculos múltiplos. Reversão bloqueada para preservar rastreabilidade.');
    await q.query(`DROP TABLE "atividade_ocorrencias"`);
    await q.query(`DROP FUNCTION "fn_vinculo_atividade_ocorrencia_contrato"()`);
  }
}
