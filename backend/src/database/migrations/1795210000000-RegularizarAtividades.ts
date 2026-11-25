import { MigrationInterface, QueryRunner } from 'typeorm';

/** HU08-01: regularização aditiva, sobre atividades eventualmente já persistidas. */
export class RegularizarAtividadesHU081795210000000 implements MigrationInterface {
  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "atividades" ALTER COLUMN "dataHora" TYPE timestamptz USING "dataHora" AT TIME ZONE 'UTC'`);
    await q.query(`ALTER TABLE "atividades" ALTER COLUMN "local" DROP NOT NULL`);
    await q.query(`ALTER TABLE "atividades" ALTER COLUMN "duracao" DROP NOT NULL`);
    await q.query(`ALTER TABLE "atividades" ALTER COLUMN "responsavel" DROP NOT NULL`);
    await q.query(`ALTER TABLE "atividades" ALTER COLUMN "participantes" DROP NOT NULL`);
    await q.query(`ALTER TABLE "atividades" ADD COLUMN IF NOT EXISTS "responsavelId" uuid`);
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "fk_atividade_responsavel" FOREIGN KEY ("responsavelId") REFERENCES "usuarios"("id") ON DELETE SET NULL`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "uq_atividade_entregavel" ON "atividade_entregaveis"("atividadeId", "entregavelId")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "idx_atividades_contrato_data" ON "atividades"("contratoId", "dataHora")`);
    // Proteção DB: par atividade/entregável deve compartilhar o MESMO contrato.
    // A tabela gerada originalmente por TypeORM não possui contratoId. Um trigger
    // obtém o contrato da atividade persistida, não de dados enviados pelo usuário.
    await q.query(`ALTER TABLE "atividades" ADD CONSTRAINT "uq_atividades_id_contrato" UNIQUE ("id", "contratoId")`);
    await q.query(`ALTER TABLE "atividade_entregaveis" ADD COLUMN "contratoId" uuid`);
    await q.query(`UPDATE "atividade_entregaveis" v SET "contratoId" = a."contratoId"
      FROM "atividades" a WHERE a."id" = v."atividadeId"`);
    await q.query(`ALTER TABLE "atividade_entregaveis" ALTER COLUMN "contratoId" SET NOT NULL`);
    await q.query(`CREATE FUNCTION hu08_contrato_vinculo() RETURNS trigger AS $$
      BEGIN
        SELECT "contratoId" INTO NEW."contratoId" FROM "atividades" WHERE "id" = NEW."atividadeId";
        IF NEW."contratoId" IS NULL THEN RAISE EXCEPTION 'Atividade não encontrada para vínculo'; END IF;
        RETURN NEW;
      END; $$ LANGUAGE plpgsql`);
    await q.query(`CREATE TRIGGER trg_hu08_contrato_vinculo
      BEFORE INSERT OR UPDATE OF "atividadeId", "entregavelId" ON "atividade_entregaveis"
      FOR EACH ROW EXECUTE FUNCTION hu08_contrato_vinculo()`);
    // Substituir cascatas antigas por FKs compostas não destrutivas.
    await q.query(`DO $$ DECLARE fk RECORD; BEGIN
      FOR fk IN SELECT c.conname FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
        WHERE t.relname = 'atividade_entregaveis' AND c.contype='f'
      LOOP EXECUTE format('ALTER TABLE "atividade_entregaveis" DROP CONSTRAINT %I', fk.conname); END LOOP;
    END $$`);
    await q.query(`ALTER TABLE "atividade_entregaveis" ADD CONSTRAINT "fk_hu08_atividade_contrato"
      FOREIGN KEY ("atividadeId", "contratoId") REFERENCES "atividades"("id", "contratoId") ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE "atividade_entregaveis" ADD CONSTRAINT "fk_hu08_entregavel_contrato"
      FOREIGN KEY ("entregavelId", "contratoId") REFERENCES "entregaveis"("id", "contrato_id") ON DELETE RESTRICT`);
  }

  public async down(_q: QueryRunner): Promise<void> {
    // Migração não reversível por segurança: o retorno a cascade violaria a
    // rastreabilidade operacional. Reverter somente com plano de dados aprovado.
    throw new Error('HU08: reversão destrutiva não suportada');
  }
}
