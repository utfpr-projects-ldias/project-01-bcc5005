import { MigrationInterface, QueryRunner } from 'typeorm';

/** Requisitos por formato e peso por período, sem apagar critérios já existentes. */
export class RequisitosOcorrenciasPorFormato1797000000000 implements MigrationInterface {
  name = 'RequisitosOcorrenciasPorFormato1797000000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencias"
      ADD COLUMN "minimo_fotos" smallint NULL,
      ADD COLUMN "minimo_relatorios" smallint NULL,
      ADD COLUMN "minimo_evidencias_livres" smallint NULL,
      ADD COLUMN "peso_periodo" numeric(7,4) NULL`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_requisitos_formatos"
      CHECK (("minimo_fotos" IS NULL OR "minimo_fotos" BETWEEN 0 AND 99)
         AND ("minimo_relatorios" IS NULL OR "minimo_relatorios" BETWEEN 0 AND 99)
         AND ("minimo_evidencias_livres" IS NULL OR "minimo_evidencias_livres" BETWEEN 0 AND 99)
         AND ("peso_periodo" IS NULL OR "peso_periodo" BETWEEN 0 AND 100))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_requisitos_formatos"`);
    for (const coluna of ['peso_periodo','minimo_evidencias_livres','minimo_relatorios','minimo_fotos'])
      await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "${coluna}"`);
  }
}
