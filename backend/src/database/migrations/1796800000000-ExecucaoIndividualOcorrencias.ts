import { MigrationInterface, QueryRunner } from 'typeorm';

/** Patch 38: alterações aditivas; sem apagar histórico, quantidades ou vínculos antigos. */
export class ExecucaoIndividualOcorrencias1796800000000 implements MigrationInterface {
  name = 'ExecucaoIndividualOcorrencias1796800000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "exige_atividade" boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "evidencia_exigida" varchar(12) NOT NULL DEFAULT 'NENHUMA'`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "permite_encerramento_excepcional" boolean NOT NULL DEFAULT true`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_evidencia_exigida" CHECK ("evidencia_exigida" IN ('NENHUMA','FOTO','RELATORIO','AMBOS'))`);
    await q.query(`CREATE TABLE "ocorrencia_lancamentos" (
      "id" uuid PRIMARY KEY,
      "ocorrencia_id" uuid NOT NULL,
      "contrato_id" uuid NOT NULL,
      "quantidade" numeric(18,3) NOT NULL CHECK ("quantidade" >= 0),
      "justificativa" varchar(200) NULL,
      "criado_por" uuid NOT NULL,
      "criado_em" timestamptz NOT NULL DEFAULT now(),
      "alterado_por" uuid NULL,
      "alterado_em" timestamptz NULL,
      CONSTRAINT "fk_lancamentos_ocorrencia_contrato" FOREIGN KEY ("ocorrencia_id","contrato_id")
        REFERENCES "ocorrencias" ("id","contrato_id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "idx_lancamentos_ocorrencia" ON "ocorrencia_lancamentos" ("ocorrencia_id", "criado_em")`);
    await q.query(`CREATE TABLE "atividade_ocorrencia_medicoes" (
      "atividade_id" uuid NOT NULL,
      "ocorrencia_id" uuid NOT NULL,
      "contrato_id" uuid NOT NULL,
      "quantidade" numeric(18,3) NOT NULL CHECK ("quantidade" >= 0),
      CONSTRAINT "pk_atividade_ocorrencia_medicoes" PRIMARY KEY ("atividade_id","ocorrencia_id"),
      CONSTRAINT "fk_medicoes_atividade_contrato" FOREIGN KEY ("atividade_id","contrato_id")
        REFERENCES "atividades" ("id","contratoId") ON DELETE CASCADE,
      CONSTRAINT "fk_medicoes_ocorrencia_contrato" FOREIGN KEY ("ocorrencia_id","contrato_id")
        REFERENCES "ocorrencias" ("id","contrato_id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "idx_medicoes_ocorrencia" ON "atividade_ocorrencia_medicoes" ("ocorrencia_id")`);
    await q.query(`CREATE TABLE "ocorrencia_comprovantes" (
      "ocorrencia_id" uuid NOT NULL,
      "comprovante_id" uuid NOT NULL,
      "contrato_id" uuid NOT NULL,
      "vinculado_por" uuid NOT NULL,
      "vinculado_em" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_ocorrencia_comprovantes" PRIMARY KEY ("ocorrencia_id","comprovante_id"),
      CONSTRAINT "fk_oc_comprovantes_ocorrencia_contrato" FOREIGN KEY ("ocorrencia_id","contrato_id")
        REFERENCES "ocorrencias" ("id","contrato_id") ON DELETE CASCADE,
      CONSTRAINT "fk_oc_comprovantes_comprovante_contrato" FOREIGN KEY ("comprovante_id","contrato_id")
        REFERENCES "comprovantes_evidencia" ("id","contrato_id") ON DELETE CASCADE
    )`);
    await q.query(`CREATE INDEX "idx_oc_comprovantes_contrato" ON "ocorrencia_comprovantes" ("contrato_id")`);
  }
  public async down(q: QueryRunner): Promise<void> {
    // Reversão de esquema somente em ambiente isolado, nunca em QA com registros reais.
    await q.query(`DROP TABLE "ocorrencia_comprovantes"`);
    await q.query(`DROP TABLE "atividade_ocorrencia_medicoes"`);
    await q.query(`DROP TABLE "ocorrencia_lancamentos"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_evidencia_exigida"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "permite_encerramento_excepcional"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "evidencia_exigida"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "exige_atividade"`);
  }
}
