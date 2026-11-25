import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Preserva os códigos existentes e distingue solicitações administrativas novas.
 * Pedidos antigos não são classificados por suposição; podem ser devolvidos.
 */
export class CicloContratualB031798200000000 implements MigrationInterface {
  name = 'CicloContratualB031798200000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE contratos DROP CONSTRAINT ck_contratos_codigo_publico,
      ALTER COLUMN codigo_publico TYPE varchar(10),
      ADD CONSTRAINT ck_contratos_codigo_publico CHECK (codigo_publico ~ '^[0-9]{5,10}$')`);
    await q.query(`ALTER TABLE contratos ADD COLUMN tipo_encerramento_solicitado varchar(16) NULL,
      ADD CONSTRAINT ck_b03_tipo_encerramento CHECK (tipo_encerramento_solicitado IS NULL OR
        (encerramento_solicitado AND tipo_encerramento_solicitado IN ('FINALIZACAO','ANTECIPADO'))),
      ADD CONSTRAINT ck_b03_solicitacao_contrato CHECK (
        (conclusao_solicitada_em IS NULL AND conclusao_solicitada_por IS NULL AND NOT conclusao_parcial_solicitada AND NOT encerramento_solicitado)
        OR (conclusao_solicitada_em IS NOT NULL AND conclusao_solicitada_por IS NOT NULL
          AND arquivado_em IS NULL AND reaberto_em IS NULL
          AND (status IN ('PLANEJAMENTO','EM_EXECUCAO','EM_ENCERRAMENTO') OR
            (status='CONCLUIDO_PARCIALMENTE' AND NOT conclusao_parcial_solicitada AND NOT encerramento_solicitado))))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM contratos WHERE length(codigo_publico)>5 OR tipo_encerramento_solicitado IS NOT NULL) THEN
      RAISE EXCEPTION 'Existem códigos ampliados ou solicitações B03; não é possível reverter sem perder informação'; END IF; END $$`);
    await q.query(`ALTER TABLE contratos DROP CONSTRAINT ck_b03_solicitacao_contrato,
      DROP CONSTRAINT ck_b03_tipo_encerramento, DROP COLUMN tipo_encerramento_solicitado,
      DROP CONSTRAINT ck_contratos_codigo_publico, ALTER COLUMN codigo_publico TYPE varchar(5),
      ADD CONSTRAINT ck_contratos_codigo_publico CHECK (codigo_publico ~ '^[0-9]{5}$')`);
  }
}
