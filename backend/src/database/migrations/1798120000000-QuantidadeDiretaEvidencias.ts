import type { MigrationInterface, QueryRunner } from 'typeorm';
/** RF-14: permite quantidade direta quando não há ocorrência; não mistura fontes. */
export class QuantidadeDiretaEvidencias1798120000000 implements MigrationInterface {
  name='QuantidadeDiretaEvidencias1798120000000';
  async up(q:QueryRunner) {
    await q.query(`ALTER TABLE entregaveis ADD COLUMN quantidade_direta_integrada boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT ck_comprovante_origem_quantidade, ADD CONSTRAINT ck_comprovante_origem_quantidade CHECK (
      (quantidade_declarada IS NULL AND ocorrencia_quantidade_id IS NULL AND origem_quantidade IS NULL AND referencia_execucao IS NULL) OR
      (quantidade_declarada IS NOT NULL AND origem_quantidade IS NOT NULL AND origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND (ocorrencia_quantidade_id IS NOT NULL OR origem_quantidade='NOVA_EXECUCAO') AND referencia_execucao IS NOT NULL AND length(btrim(referencia_execucao))>0))`);
  }
  async down(q:QueryRunner) {
    const [r]=await q.query(`SELECT EXISTS(SELECT 1 FROM entregaveis WHERE quantidade_direta_integrada) AS possui`);
    if(r.possui) throw new Error('Existem medições diretas integradas; preserve seu histórico antes de reverter.');
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT ck_comprovante_origem_quantidade, ADD CONSTRAINT ck_comprovante_origem_quantidade CHECK (
      (quantidade_declarada IS NULL AND ocorrencia_quantidade_id IS NULL AND origem_quantidade IS NULL AND referencia_execucao IS NULL) OR
      (quantidade_declarada IS NOT NULL AND ocorrencia_quantidade_id IS NOT NULL AND origem_quantidade IS NOT NULL AND origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND referencia_execucao IS NOT NULL AND length(btrim(referencia_execucao))>0))`);
    await q.query(`ALTER TABLE entregaveis DROP COLUMN quantidade_direta_integrada`);
  }
}
