import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserva as ocorrências antigas e diferencia registros mensuráveis e narrativos. */
export class ClassificarOcorrenciasPorMedicao1795800000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "ocorrencias_origem_enum" ADD VALUE IF NOT EXISTS 'MANUAL_DESCRITIVA'`);
    await q.query(`ALTER TABLE "ocorrencias" ADD COLUMN "modo_registro" varchar(16) NOT NULL DEFAULT 'DESCRITIVO'`);
    await q.query(`UPDATE "ocorrencias" SET "modo_registro" = 'QUANTITATIVO'
      WHERE "origem" = 'MANUAL_QUANTITATIVA'
        AND ("meta_quantidade" IS NOT NULL OR "quantidade_realizada" IS NOT NULL OR "quantidade_aprovada" IS NOT NULL)`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_modo_registro"
      CHECK ("modo_registro" IN ('QUANTITATIVO', 'DESCRITIVO'))`);
    // Não se permite gerar ocorrência manual para o mesmo período de um entregável RECORRENTE.
    // Text cast evita consumir o novo valor ENUM antes do commit da migration.
    await q.query(`CREATE OR REPLACE FUNCTION "fn_ocorrencias_validar_origem_hu09"()
      RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE tipo_entregavel text;
      BEGIN
        SELECT e.tipo::text INTO tipo_entregavel FROM "entregaveis" e
         WHERE e.id = NEW.entregavel_id AND e.contrato_id = NEW.contrato_id;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'Entregável inexistente ou pertencente a outro contrato.'
            USING ERRCODE = '23503', CONSTRAINT = 'fk_ocorrencias_entregavel_contrato';
        END IF;
        IF NEW.origem::text = 'RECORRENTE' AND tipo_entregavel <> 'RECORRENTE' THEN
          RAISE EXCEPTION 'Ocorrência recorrente exige entregável RECORRENTE.' USING ERRCODE = '23514';
        END IF;
        IF NEW.origem::text = 'MANUAL_QUANTITATIVA' AND tipo_entregavel <> 'QUANTITATIVO' THEN
          RAISE EXCEPTION 'Ocorrência quantitativa exige entregável QUANTITATIVO.' USING ERRCODE = '23514';
        END IF;
        IF NEW.origem::text = 'MANUAL_DESCRITIVA' AND tipo_entregavel = 'RECORRENTE' THEN
          RAISE EXCEPTION 'Use a agenda para ocorrências recorrentes.' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$`);
    await q.query(`ALTER TABLE "ocorrencias" ADD CONSTRAINT "ck_ocorrencias_descritiva_sem_quantidade"
      CHECK ("modo_registro" = 'QUANTITATIVO' OR
        ("meta_quantidade" IS NULL AND "quantidade_realizada" IS NULL AND "quantidade_aprovada" IS NULL))`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Reversão perde a classificação de operações já lançadas e precisa de decisão explícita.
    const linhas: Array<{ total: string }> = await q.query(`SELECT COUNT(*)::text AS total FROM "ocorrencias" WHERE "modo_registro" = 'DESCRITIVO' AND "origem" = 'MANUAL_QUANTITATIVA'`);
    if (Number(linhas[0]?.total ?? 0) > 0) throw new Error('Rollback negado: há ocorrências descritivas cuja classificação deve ser preservada');
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_descritiva_sem_quantidade"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP CONSTRAINT "ck_ocorrencias_modo_registro"`);
    await q.query(`ALTER TABLE "ocorrencias" DROP COLUMN "modo_registro"`);
  }
}
