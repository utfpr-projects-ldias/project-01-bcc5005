import { MigrationInterface, QueryRunner } from 'typeorm';
/** Novas expectativas de Marco, sem fabricar atividades/evidências operacionais. */
export class MetasMarco1797300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE "metas_marco" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "contrato_id" uuid NOT NULL, "entregavel_id" uuid NOT NULL,
      "tipo" varchar(12) NOT NULL CHECK ("tipo" IN ('OCORRENCIA','ATIVIDADE','EVIDENCIA')),
      "titulo" varchar(60) NOT NULL CHECK (length(btrim("titulo")) > 0),
      "quantidade_exigida" integer NOT NULL CHECK ("quantidade_exigida" BETWEEN 1 AND 100),
      "data_prevista" date NULL, "inicio_previsto" date NULL, "termino_previsto" date NULL,
      "observacoes" varchar(150) NULL,
      "criado_por" uuid NOT NULL, "criado_em" timestamptz NOT NULL DEFAULT now(),
      "arquivado_em" timestamptz NULL,
      CONSTRAINT "fk_meta_marco_entregavel" FOREIGN KEY ("entregavel_id","contrato_id")
        REFERENCES "entregaveis"("id","contrato_id") ON DELETE RESTRICT,
      CONSTRAINT "ck_meta_marco_datas" CHECK ("inicio_previsto" IS NULL OR "termino_previsto" IS NULL OR "inicio_previsto" <= "termino_previsto")
    )`);
    await q.query(`CREATE UNIQUE INDEX "uq_meta_marco_contrato" ON "metas_marco"("id","contrato_id")`);
    await q.query(`CREATE INDEX "idx_metas_marco_entregavel" ON "metas_marco"("contrato_id","entregavel_id")`);
    await q.query(`CREATE TABLE "vinculos_metas_marco" (
      "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
      "meta_id" uuid NOT NULL, "contrato_id" uuid NOT NULL,
      "ocorrencia_id" uuid NULL, "atividade_id" uuid NULL, "comprovante_id" uuid NULL,
      "status" varchar(12) NOT NULL DEFAULT 'PENDENTE' CHECK ("status" IN ('PENDENTE','APROVADO','REJEITADO')),
      "solicitado_por" uuid NOT NULL, "solicitado_em" timestamptz NOT NULL DEFAULT now(),
      "decidido_por" uuid NULL, "decidido_em" timestamptz NULL, "justificativa" varchar(200) NULL,
      CONSTRAINT "ck_vinculo_marco_um_registro" CHECK (num_nonnulls("ocorrencia_id", "atividade_id", "comprovante_id") = 1),
      CONSTRAINT "fk_vinculo_marco_meta" FOREIGN KEY ("meta_id","contrato_id") REFERENCES "metas_marco"("id","contrato_id") ON DELETE RESTRICT,
      CONSTRAINT "fk_vinculo_marco_ocorrencia" FOREIGN KEY ("ocorrencia_id","contrato_id") REFERENCES "ocorrencias"("id","contrato_id") ON DELETE RESTRICT,
      CONSTRAINT "fk_vinculo_marco_atividade" FOREIGN KEY ("atividade_id","contrato_id") REFERENCES "atividades"("id","contratoId") ON DELETE RESTRICT,
      CONSTRAINT "fk_vinculo_marco_comprovante" FOREIGN KEY ("comprovante_id","contrato_id") REFERENCES "comprovantes_evidencia"("id","contrato_id") ON DELETE RESTRICT
    )`);
    await q.query(`CREATE INDEX "idx_vinculos_metas_marco" ON "vinculos_metas_marco"("meta_id","status")`);
    await q.query(`CREATE UNIQUE INDEX "uq_vinculo_marco_ocorrencia_ativo" ON "vinculos_metas_marco"("meta_id","ocorrencia_id") WHERE "ocorrencia_id" IS NOT NULL AND "status" <> 'REJEITADO'`);
    await q.query(`CREATE UNIQUE INDEX "uq_vinculo_marco_atividade_ativo" ON "vinculos_metas_marco"("meta_id","atividade_id") WHERE "atividade_id" IS NOT NULL AND "status" <> 'REJEITADO'`);
    await q.query(`CREATE UNIQUE INDEX "uq_vinculo_marco_comprovante_ativo" ON "vinculos_metas_marco"("meta_id","comprovante_id") WHERE "comprovante_id" IS NOT NULL AND "status" <> 'REJEITADO'`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "vinculos_metas_marco"`);
    await q.query(`DROP TABLE "metas_marco"`);
  }
}
