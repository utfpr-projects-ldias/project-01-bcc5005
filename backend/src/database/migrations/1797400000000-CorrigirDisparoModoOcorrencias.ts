import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A função fn_ocorrencias_validar_origem_hu09, refinada em 179590, já
 * verifica modo_registro. Entretanto, o trigger de 179530 não era disparado
 * em UPDATE apenas dessa coluna. Corrige o disparo sem tocar nos registros.
 */
export class CorrigirDisparoModoOcorrencias1797400000000 implements MigrationInterface {
  name = 'CorrigirDisparoModoOcorrencias1797400000000';

  async up(q: QueryRunner): Promise<void> {
    // Só diagnóstico de legados: a validação de 179590 foi prospectiva.
    // Não apagar nem reclassificar ocorrências preexistentes automaticamente.
    await q.query(`
      DO $$
      DECLARE divergentes bigint;
      BEGIN
        SELECT count(*) INTO divergentes
          FROM "ocorrencias" o
          JOIN "entregaveis" e
            ON e.id = o.entregavel_id AND e.contrato_id = o.contrato_id
         WHERE (o.origem::text = 'RECORRENTE' AND e.tipo::text <> 'RECORRENTE')
            OR (o.origem::text = 'MANUAL_QUANTITATIVA'
                AND (e.tipo::text <> 'QUANTITATIVO' OR o.modo_registro <> 'QUANTITATIVO'))
            OR (o.origem::text = 'MANUAL_DESCRITIVA'
                AND (e.tipo::text IN ('RECORRENTE', 'QUANTITATIVO') OR o.modo_registro <> 'DESCRITIVO'));
        IF divergentes > 0 THEN
          RAISE NOTICE 'B01: % ocorrencia(s) historica(s) com origem/modo divergente; preservadas, revisar manualmente.', divergentes;
        END IF;
      END;
      $$
    `);
    await q.query('DROP TRIGGER "trg_ocorrencias_validar_origem" ON "ocorrencias"');
    await q.query(`
      CREATE TRIGGER "trg_ocorrencias_validar_origem"
      BEFORE INSERT OR UPDATE OF
        "entregavel_id", "contrato_id", "origem", "modo_registro"
      ON "ocorrencias"
      FOR EACH ROW
      EXECUTE FUNCTION "fn_ocorrencias_validar_origem_hu09"()
    `);
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER "trg_ocorrencias_validar_origem" ON "ocorrencias"');
    await q.query(`
      CREATE TRIGGER "trg_ocorrencias_validar_origem"
      BEFORE INSERT OR UPDATE OF
        "entregavel_id", "contrato_id", "origem"
      ON "ocorrencias"
      FOR EACH ROW
      EXECUTE FUNCTION "fn_ocorrencias_validar_origem_hu09"()
    `);
  }
}
