import type { MigrationInterface, QueryRunner } from 'typeorm';
/** A prova de uma execução direta referencia sua fonte; não é uma nova medição. */
export class ComprovacaoQuantidadeDireta1798170000000 implements MigrationInterface {
  name='ComprovacaoQuantidadeDireta1798170000000';
  async up(q:QueryRunner) {
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT ck_comprovante_origem_quantidade, ADD CONSTRAINT ck_comprovante_origem_quantidade CHECK (
      (quantidade_declarada IS NULL AND ocorrencia_quantidade_id IS NULL AND origem_quantidade IS NULL AND referencia_execucao IS NULL) OR
      (quantidade_declarada IS NOT NULL AND origem_quantidade IS NOT NULL AND origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND referencia_execucao IS NOT NULL AND length(btrim(referencia_execucao))>0))`);
  }
  async down(q:QueryRunner) {
    const [r]=await q.query(`SELECT EXISTS(SELECT 1 FROM comprovantes_evidencia WHERE origem_quantidade='COMPROVACAO' AND ocorrencia_quantidade_id IS NULL) AS possui`);
    if(r.possui) throw new Error('Existem provas de execução direta; preserve seu histórico antes de reverter.');
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT ck_comprovante_origem_quantidade, ADD CONSTRAINT ck_comprovante_origem_quantidade CHECK (
      (quantidade_declarada IS NULL AND ocorrencia_quantidade_id IS NULL AND origem_quantidade IS NULL AND referencia_execucao IS NULL) OR
      (quantidade_declarada IS NOT NULL AND origem_quantidade IS NOT NULL AND origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND (ocorrencia_quantidade_id IS NOT NULL OR origem_quantidade='NOVA_EXECUCAO') AND referencia_execucao IS NOT NULL AND length(btrim(referencia_execucao))>0))`);
  }
}
