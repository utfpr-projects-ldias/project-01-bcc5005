import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Complementa a migration ponderada sem reescrever o histórico já aplicado. */
export class IntegridadeVinculoMetaEvidencia1798300000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM vinculos_metas_marco v WHERE v.evidencia_esperada_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id
          WHERE ev.id=v.evidencia_esperada_id AND e.contrato_id=v.contrato_id)) THEN
        RAISE EXCEPTION 'Existem vínculos de evidência fora do contrato da meta. Nenhum vínculo foi removido.';
      END IF;
    END; $$`);
    await q.query(`CREATE OR REPLACE FUNCTION fn_vinculo_meta_evidencia_contexto() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.evidencia_esperada_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id WHERE ev.id=NEW.evidencia_esperada_id AND e.contrato_id=NEW.contrato_id) THEN
        RAISE EXCEPTION 'Evidência fora do contrato da meta' USING ERRCODE='23503'; END IF; RETURN NEW; END; $$`);
    await q.query('DROP TRIGGER IF EXISTS trg_vinculo_meta_evidencia_contexto ON vinculos_metas_marco');
    await q.query(`CREATE TRIGGER trg_vinculo_meta_evidencia_contexto BEFORE INSERT OR UPDATE OF evidencia_esperada_id,contrato_id ON vinculos_metas_marco FOR EACH ROW EXECUTE FUNCTION fn_vinculo_meta_evidencia_contexto()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER IF EXISTS trg_vinculo_meta_evidencia_contexto ON vinculos_metas_marco');
    await q.query('DROP FUNCTION IF EXISTS fn_vinculo_meta_evidencia_contexto()');
  }
}
