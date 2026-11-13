import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Impede combinações inválidas mesmo quando gravadas fora da API. */
export class ValidarTipoOcorrenciaEntregavel1795900000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    // Não reinterpreta o passado nem exclui registros históricos. A validação é
    // prospectiva e mantém os vínculos de auditoria existentes.
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
        IF NEW.origem::text = 'MANUAL_QUANTITATIVA' AND
          (tipo_entregavel <> 'QUANTITATIVO' OR NEW.modo_registro <> 'QUANTITATIVO') THEN
          RAISE EXCEPTION 'Ocorrência quantitativa exige entregável QUANTITATIVO.' USING ERRCODE = '23514';
        END IF;
        IF NEW.origem::text = 'MANUAL_DESCRITIVA' AND
          (tipo_entregavel IN ('RECORRENTE', 'QUANTITATIVO') OR NEW.modo_registro <> 'DESCRITIVO') THEN
          RAISE EXCEPTION 'Ocorrência descritiva incompatível com este tipo de entregável.' USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END;
      $$`);
  }
  async down(q: QueryRunner): Promise<void> {
    // Restaura a política anterior do Patch 08; não remove nem altera dados.
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
  }
}
