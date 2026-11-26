import type { MigrationInterface, QueryRunner } from 'typeorm';
export class FrequenciaAcompanhamentoContinuo1798340000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE entregaveis ADD COLUMN frequencia_acompanhamento varchar(7)`);
    await q.query(`UPDATE entregaveis SET frequencia_acompanhamento='DIARIA' WHERE tipo='CONTINUO'`);
    await q.query(`ALTER TABLE entregaveis ADD CONSTRAINT ck_frequencia_acompanhamento CHECK (frequencia_acompanhamento IS NULL OR (tipo='CONTINUO' AND frequencia_acompanhamento IN ('DIARIA','SEMANAL','MENSAL')))`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE entregaveis DROP CONSTRAINT ck_frequencia_acompanhamento, DROP COLUMN frequencia_acompanhamento`);
  }
}
