import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserva a interpretação histórica de simple-array e passa a armazenar cada participante separadamente. */
export class CicloAtividadesB081798250000000 implements MigrationInterface {
  name = 'CicloAtividadesB081798250000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE atividades ALTER COLUMN participantes TYPE text[] USING
      CASE WHEN participantes IS NULL THEN NULL WHEN participantes='' THEN ARRAY[]::text[] ELSE string_to_array(participantes,',') END,
      ADD COLUMN solicitada_em timestamptz, ADD COLUMN solicitada_por uuid, ADD COLUMN verificada_por uuid,
      ADD CONSTRAINT ck_b08_atividade_solicitacao CHECK ((solicitada_em IS NULL AND solicitada_por IS NULL) OR
        (solicitada_em IS NOT NULL AND solicitada_por IS NOT NULL AND status='PENDENTE_CONCLUSAO')) NOT VALID,
      ADD CONSTRAINT ck_b08_atividade_verificacao CHECK (verificada_por IS NULL OR ("verificadaEm" IS NOT NULL AND status IN ('VERIFICADA','ARQUIVADA'))) NOT VALID,
      ADD CONSTRAINT ck_b08_atividade_exclusao CHECK ("excluidaEm" IS NULL OR status='ARQUIVADA') NOT VALID,
      ADD CONSTRAINT ck_b08_atividade_arquivo CHECK ("arquivadaEm" IS NULL OR status='ARQUIVADA') NOT VALID`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [linha] = await q.query(`SELECT EXISTS(SELECT 1 FROM atividades a WHERE solicitada_em IS NOT NULL OR verificada_por IS NOT NULL OR
      EXISTS(SELECT 1 FROM unnest(a.participantes) p WHERE strpos(p,',')>0 OR p IS NULL OR p='')) AS possui`);
    if(linha.possui) throw new Error('A reversão perderia dados das decisões ou dos participantes.');
    await q.query(`ALTER TABLE atividades DROP CONSTRAINT ck_b08_atividade_arquivo, DROP CONSTRAINT ck_b08_atividade_exclusao,
      DROP CONSTRAINT ck_b08_atividade_verificacao, DROP CONSTRAINT ck_b08_atividade_solicitacao,
      DROP COLUMN solicitada_em, DROP COLUMN solicitada_por, DROP COLUMN verificada_por,
      ALTER COLUMN participantes TYPE text USING array_to_string(participantes,',')`);
  }
}
