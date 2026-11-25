import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Uma versão binária imutável, vários aceites locais. A exclusão física de um
 * arquivo compartilhado é proibida: arquivar o vínculo não destrói os outros. */
export class EvidenciasCompartilhadas1798100000000 implements MigrationInterface {
  name = 'EvidenciasCompartilhadas1798100000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE comprovantes_evidencia ADD COLUMN grupo_compartilhado_id uuid`);
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT uq_comprovantes_storage_key`);
    await q.query(`CREATE INDEX idx_comprovantes_grupo ON comprovantes_evidencia(grupo_compartilhado_id) WHERE grupo_compartilhado_id IS NOT NULL`);
    await q.query(`CREATE INDEX idx_comprovantes_storage ON comprovantes_evidencia(storage_key)`);
    await q.query(`CREATE UNIQUE INDEX uq_comprovantes_storage_individual ON comprovantes_evidencia(storage_key) WHERE grupo_compartilhado_id IS NULL`);
    await q.query(`CREATE FUNCTION proteger_blob_compartilhado() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF TG_OP='DELETE' THEN
          IF OLD.grupo_compartilhado_id IS NOT NULL THEN
            RAISE EXCEPTION 'Evidência compartilhada: preserve o histórico e arquive o vínculo' USING ERRCODE='23503';
          END IF;
          RETURN OLD;
        END IF;
        IF TG_OP='UPDATE' THEN
          IF NEW.storage_key IS DISTINCT FROM OLD.storage_key OR NEW.grupo_compartilhado_id IS DISTINCT FROM OLD.grupo_compartilhado_id OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.tamanho IS DISTINCT FROM OLD.tamanho THEN
            RAISE EXCEPTION 'A versão binária é imutável' USING ERRCODE='23514';
          END IF;
          RETURN NEW;
        END IF;
        PERFORM pg_advisory_xact_lock(hashtextextended(NEW.storage_key,0));
        IF EXISTS (SELECT 1 FROM comprovantes_evidencia c WHERE c.storage_key=NEW.storage_key AND
          (NEW.grupo_compartilhado_id IS NULL OR c.grupo_compartilhado_id IS DISTINCT FROM NEW.grupo_compartilhado_id OR c.sha256<>NEW.sha256 OR c.tamanho<>NEW.tamanho)) THEN
          RAISE EXCEPTION 'Arquivo compartilhado inconsistente' USING ERRCODE='23514';
        END IF;
        RETURN NEW;
      END $$`);
    await q.query(`CREATE TRIGGER trg_proteger_blob_compartilhado BEFORE INSERT OR UPDATE OR DELETE ON comprovantes_evidencia FOR EACH ROW EXECUTE FUNCTION proteger_blob_compartilhado()`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [r] = await q.query(`SELECT EXISTS(SELECT 1 FROM comprovantes_evidencia WHERE grupo_compartilhado_id IS NOT NULL) AS possui`);
    if (r.possui) throw new Error('Existem evidências compartilhadas. Preserve os vínculos antes de reverter.');
    await q.query(`DROP TRIGGER trg_proteger_blob_compartilhado ON comprovantes_evidencia`);
    await q.query(`DROP FUNCTION proteger_blob_compartilhado()`);
    await q.query(`DROP INDEX uq_comprovantes_storage_individual, idx_comprovantes_storage, idx_comprovantes_grupo`);
    await q.query(`ALTER TABLE comprovantes_evidencia ADD CONSTRAINT uq_comprovantes_storage_key UNIQUE(storage_key), DROP COLUMN grupo_compartilhado_id`);
  }
}
