import type { MigrationInterface, QueryRunner } from 'typeorm';
export class AcompanhamentoContinuo1798310000000 implements MigrationInterface {
 async up(q:QueryRunner){
  await q.query(`ALTER TABLE entregaveis ADD COLUMN configuracao_continuo jsonb, ADD COLUMN decisoes_continuo jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await q.query('ALTER TABLE evidencias_esperadas ADD COLUMN data_acompanhamento date');
  await q.query('CREATE INDEX idx_evidencias_data_acompanhamento ON evidencias_esperadas(entregavel_id,data_acompanhamento) WHERE arquivado_em IS NULL');
  await q.query(`ALTER TABLE entregaveis ADD CONSTRAINT ck_acompanhamento_continuo CHECK ((tipo='CONTINUO' OR (configuracao_continuo IS NULL AND decisoes_continuo='{}'::jsonb)) AND (configuracao_continuo IS NULL OR (jsonb_typeof(configuracao_continuo)='object' AND configuracao_continuo->>'modo' IN ('DIARIO','UTEIS','SEMANAL','MENSAL','ESPECIFICOS','SOB_DEMANDA'))) AND jsonb_typeof(decisoes_continuo)='object')`);
 }
 async down(q:QueryRunner){await q.query('ALTER TABLE evidencias_esperadas DROP COLUMN data_acompanhamento');await q.query('ALTER TABLE entregaveis DROP CONSTRAINT ck_acompanhamento_continuo, DROP COLUMN decisoes_continuo, DROP COLUMN configuracao_continuo');}
}
