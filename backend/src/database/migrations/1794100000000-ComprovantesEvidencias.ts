import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Aditiva: comprovações são versões imutáveis, separadas do checklist planejado. */
export class ComprovantesEvidencias1794100000000 implements MigrationInterface {
  name = 'ComprovantesEvidencias1794100000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query('ALTER TABLE "entregaveis" ADD CONSTRAINT "uq_entregaveis_id_contrato" UNIQUE ("id", "contrato_id")');
    await q.query('ALTER TABLE "evidencias_esperadas" ADD CONSTRAINT "uq_esperadas_id_entregavel" UNIQUE ("id", "entregavel_id")');
    await q.query(`CREATE TABLE "comprovantes_evidencia" (
      "id" uuid NOT NULL DEFAULT gen_random_uuid(),
      "contrato_id" uuid NOT NULL,
      "entregavel_id" uuid NOT NULL,
      "evidencia_esperada_id" uuid NOT NULL,
      "autor_id" uuid NOT NULL,
      "nome_original" varchar(180) NOT NULL,
      "tipo_mime" varchar(100) NOT NULL,
      "tamanho" integer NOT NULL,
      "sha256" char(64) NOT NULL,
      "storage_key" varchar(32) NOT NULL,
      "descricao" varchar(300),
      "status" varchar(32) NOT NULL DEFAULT 'PENDENTE_VERIFICACAO',
      "verificado_por" uuid,
      "verificado_em" timestamptz,
      "criado_em" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "pk_comprovantes_evidencia" PRIMARY KEY ("id"),
      CONSTRAINT "uq_comprovantes_storage_key" UNIQUE ("storage_key"),
      CONSTRAINT "fk_comprovantes_contrato_entregavel" FOREIGN KEY ("entregavel_id", "contrato_id") REFERENCES "entregaveis"("id", "contrato_id") ON DELETE RESTRICT,
      CONSTRAINT "fk_comprovantes_esperada" FOREIGN KEY ("evidencia_esperada_id", "entregavel_id") REFERENCES "evidencias_esperadas"("id", "entregavel_id") ON DELETE RESTRICT,
      CONSTRAINT "fk_comprovantes_autor" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
      CONSTRAINT "fk_comprovantes_verificador" FOREIGN KEY ("verificado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT,
      CONSTRAINT "ck_comprovantes_tamanho" CHECK ("tamanho" > 0),
      CONSTRAINT "ck_comprovantes_sha256" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
      CONSTRAINT "ck_comprovantes_key" CHECK ("storage_key" ~ '^[a-f0-9]{32}$'),
      CONSTRAINT "ck_comprovantes_status" CHECK ("status" IN ('PENDENTE_VERIFICACAO', 'VERIFICADA')),
      CONSTRAINT "ck_comprovantes_verificacao" CHECK (("status" = 'VERIFICADA') = ("verificado_por" IS NOT NULL AND "verificado_em" IS NOT NULL))
    )`);
    await q.query('CREATE INDEX "idx_comprovantes_esperada_criacao" ON "comprovantes_evidencia" ("evidencia_esperada_id", "criado_em" DESC, "id" DESC)');
    await q.query('CREATE INDEX "idx_comprovantes_contrato" ON "comprovantes_evidencia" ("contrato_id")');
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE "comprovantes_evidencia"');
    await q.query('ALTER TABLE "evidencias_esperadas" DROP CONSTRAINT "uq_esperadas_id_entregavel"');
    await q.query('ALTER TABLE "entregaveis" DROP CONSTRAINT "uq_entregaveis_id_contrato"');
  }
}
