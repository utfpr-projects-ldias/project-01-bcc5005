import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Metadados da decisão e do pedido original, sem reconstruir fatos históricos por suposição. */
export class ExecucaoOcorrenciasB071798240000000 implements MigrationInterface {
  name = 'ExecucaoOcorrenciasB071798240000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ocorrencias ADD COLUMN concluida_em timestamptz, ADD COLUMN concluida_por uuid,
      ADD CONSTRAINT ck_b07_ocorrencia_conclusao CHECK ((concluida_em IS NULL AND concluida_por IS NULL) OR
        (concluida_em IS NOT NULL AND concluida_por IS NOT NULL AND status IN ('CONCLUIDO','CONCLUIDO_PARCIALMENTE'))) NOT VALID,
      ADD CONSTRAINT ck_b07_ocorrencia_encerramento CHECK ((encerrada_em IS NULL AND encerrada_por IS NULL) OR (encerrada_em IS NOT NULL AND encerrada_por IS NOT NULL AND status='ENCERRADA')) NOT VALID,
      ADD CONSTRAINT ck_b07_ocorrencia_regularizacao CHECK (NOT regularizacao_documental_solicitada OR status='CONCLUIDO_PARCIALMENTE') NOT VALID`);
    await q.query(`ALTER TABLE ocorrencia_lancamentos ADD COLUMN pedido_original jsonb,
      ALTER COLUMN justificativa_exclusao TYPE varchar(200),
      ADD CONSTRAINT ck_b07_lancamento_decisao CHECK ((decidido_por IS NULL)=(decidido_em IS NULL) AND
        (status_execucao<>'PENDENTE' OR decidido_em IS NULL) AND (status_execucao<>'REJEITADO' OR decidido_em IS NOT NULL)) NOT VALID,
      ADD CONSTRAINT ck_b07_lancamento_pedido CHECK (pedido_original IS NULL OR jsonb_typeof(pedido_original)='object') NOT VALID`);
    await q.query(`CREATE INDEX idx_b07_lancamentos_paginacao ON ocorrencia_lancamentos(contrato_id,ocorrencia_id,criado_em,id) WHERE excluido_em IS NULL`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [r] = await q.query(`SELECT EXISTS(SELECT 1 FROM ocorrencias WHERE concluida_em IS NOT NULL) OR EXISTS(SELECT 1 FROM ocorrencia_lancamentos WHERE pedido_original IS NOT NULL OR length(justificativa_exclusao)>25) AS possui`);
    if(r.possui) throw new Error('A reversão perderia dados de decisões ou dos pedidos originais.');
    await q.query('DROP INDEX idx_b07_lancamentos_paginacao');
    await q.query(`ALTER TABLE ocorrencia_lancamentos DROP CONSTRAINT ck_b07_lancamento_pedido, DROP CONSTRAINT ck_b07_lancamento_decisao, DROP COLUMN pedido_original, ALTER COLUMN justificativa_exclusao TYPE varchar(25)`);
    await q.query(`ALTER TABLE ocorrencias DROP CONSTRAINT ck_b07_ocorrencia_regularizacao, DROP CONSTRAINT ck_b07_ocorrencia_encerramento, DROP CONSTRAINT ck_b07_ocorrencia_conclusao, DROP COLUMN concluida_por, DROP COLUMN concluida_em`);
  }
}
