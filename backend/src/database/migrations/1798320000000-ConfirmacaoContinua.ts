import type { MigrationInterface, QueryRunner } from 'typeorm';
export class ConfirmacaoContinua1798320000000 implements MigrationInterface {
 async up(q:QueryRunner){
  await q.query(`ALTER TABLE entregaveis DROP CONSTRAINT ck_acompanhamento_continuo, DROP COLUMN configuracao_continuo, DROP COLUMN decisoes_continuo, ADD COLUMN confirmacao_continuo jsonb`);
  await q.query(`ALTER TABLE entregaveis ADD CONSTRAINT ck_confirmacao_continuo CHECK (confirmacao_continuo IS NULL OR (tipo='CONTINUO' AND jsonb_typeof(confirmacao_continuo)='object' AND confirmacao_continuo ? 'criterio' AND confirmacao_continuo ? 'autorId' AND confirmacao_continuo ? 'em'))`);
 }
 async down(q:QueryRunner){
  await q.query(`ALTER TABLE entregaveis DROP CONSTRAINT ck_confirmacao_continuo, DROP COLUMN confirmacao_continuo, ADD COLUMN configuracao_continuo jsonb, ADD COLUMN decisoes_continuo jsonb NOT NULL DEFAULT '{}'::jsonb`);
  await q.query(`ALTER TABLE entregaveis ADD CONSTRAINT ck_acompanhamento_continuo CHECK ((tipo='CONTINUO' OR (configuracao_continuo IS NULL AND decisoes_continuo='{}'::jsonb)) AND (configuracao_continuo IS NULL OR (jsonb_typeof(configuracao_continuo)='object' AND configuracao_continuo->>'modo' IN ('DIARIO','UTEIS','SEMANAL','MENSAL','ESPECIFICOS','SOB_DEMANDA'))) AND jsonb_typeof(decisoes_continuo)='object')`);
 }
}
