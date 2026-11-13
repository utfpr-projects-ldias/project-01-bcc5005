import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Configuração pai das ocorrências. Não remove arquivos, atividades ou registros. */
export class CriarConfiguracoesOcorrencias1796000000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_quantitativo"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_quantitativo"
      CHECK ("tipo" <> 'QUANTITATIVO' OR
        (("quantidade_prevista" IS NULL AND "unidade_medida" IS NULL) OR
         ("quantidade_prevista" > 0 AND "unidade_medida" IS NOT NULL AND length(btrim("unidade_medida")) > 0)))`);
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_recorrencia"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_recorrencia"
      CHECK (("tipo" = 'RECORRENTE' AND
        (("periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL) OR
         ("periodicidade" IS NOT NULL AND "configuracao_periodicidade" = '{"versao":1}'::jsonb))) OR
        ("tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL))`);
    await q.query(`CREATE TABLE "configuracoes_ocorrencias" (
      "entregavel_id" uuid PRIMARY KEY,
      "contrato_id" uuid NOT NULL,
      "tipo_operacional" varchar(20) NOT NULL,
      "quantidade_prevista" numeric(18,3),
      "unidade_medida" varchar(80),
      "periodicidade" varchar(20),
      "inicio_previsto" date,
      "termino_previsto" date,
      "atualizado_em" timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT "fk_configuracoes_ocorrencias_entregavel" FOREIGN KEY ("entregavel_id", "contrato_id") REFERENCES "entregaveis" ("id", "contrato_id") ON DELETE RESTRICT,
      CONSTRAINT "ck_configuracoes_ocorrencias_tipo" CHECK ("tipo_operacional" IN ('UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO')),
      CONSTRAINT "ck_configuracoes_ocorrencias_datas" CHECK ("inicio_previsto" IS NULL OR "termino_previsto" IS NULL OR "termino_previsto" >= "inicio_previsto"),
      CONSTRAINT "ck_configuracoes_ocorrencias_quantidade" CHECK ("quantidade_prevista" IS NULL OR "quantidade_prevista" > 0)
    )`);
    await q.query(`CREATE INDEX "idx_configuracoes_ocorrencias_contrato" ON "configuracoes_ocorrencias" ("contrato_id")`);
    // Configuração existente é inicializada a partir do planejamento vigente.
    await q.query(`INSERT INTO "configuracoes_ocorrencias" ("entregavel_id", "contrato_id", "tipo_operacional", "quantidade_prevista", "unidade_medida", "periodicidade", "inicio_previsto", "termino_previsto")
      SELECT id, contrato_id, tipo::text, quantidade_prevista, unidade_medida, periodicidade::text, inicio_previsto, termino_previsto FROM entregaveis`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Uma reversão do novo relaxamento não é segura enquanto existirem entregáveis incompletos.
    const [{ pendentes }] = await q.query(`SELECT COUNT(*)::int AS pendentes FROM entregaveis
      WHERE (tipo = 'QUANTITATIVO' AND (quantidade_prevista IS NULL OR unidade_medida IS NULL))
         OR (tipo = 'RECORRENTE' AND periodicidade IS NULL)`);
    if (Number(pendentes) > 0) throw new Error('Rollback impedido: configure os entregáveis antes de voltar às regras antigas');
    await q.query(`DROP TABLE "configuracoes_ocorrencias"`);
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_quantitativo"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_quantitativo" CHECK ("tipo" <> 'QUANTITATIVO' OR ("quantidade_prevista" > 0 AND "unidade_medida" IS NOT NULL AND length(btrim("unidade_medida")) > 0))`);
    await q.query(`ALTER TABLE "entregaveis" DROP CONSTRAINT "ck_entregaveis_recorrencia"`);
    await q.query(`ALTER TABLE "entregaveis" ADD CONSTRAINT "ck_entregaveis_recorrencia" CHECK (("tipo" = 'RECORRENTE' AND "periodicidade" IS NOT NULL AND "configuracao_periodicidade" = '{"versao":1}'::jsonb) OR ("tipo" <> 'RECORRENTE' AND "periodicidade" IS NULL AND "configuracao_periodicidade" IS NULL))`);
  }
}
