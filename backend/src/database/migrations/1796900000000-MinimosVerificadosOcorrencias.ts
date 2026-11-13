import { MigrationInterface, QueryRunner } from 'typeorm';

/** Patch 41: requisitos contáveis, preservando o significado dos booleanos históricos. */
export class MinimosVerificadosOcorrencias1796900000000 implements MigrationInterface {
  name = 'MinimosVerificadosOcorrencias1796900000000';
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "minimo_atividades_verificadas" smallint NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "minimo_evidencias_verificadas" smallint NOT NULL DEFAULT 0`);
    await q.query(`UPDATE "ocorrencias" SET
      "minimo_atividades_verificadas" = CASE WHEN "exige_atividade" THEN 1 ELSE 0 END,
      "minimo_evidencias_verificadas" = CASE "evidencia_exigida"
        WHEN 'AMBOS' THEN 2 WHEN 'FOTO' THEN 1 WHEN 'RELATORIO' THEN 1 ELSE 0 END`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_minimos_verificados"
      CHECK ("minimo_atividades_verificadas" BETWEEN 0 AND 99 AND "minimo_evidencias_verificadas" BETWEEN 0 AND 99)`);
  }
  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_minimos_verificados"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "minimo_evidencias_verificadas"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "minimo_atividades_verificadas"`);
  }
}
