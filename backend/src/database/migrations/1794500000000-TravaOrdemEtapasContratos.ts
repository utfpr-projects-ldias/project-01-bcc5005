import { MigrationInterface, QueryRunner } from 'typeorm';

/** Regra por contrato: default liberado, persistente e independente da sessão. */
export class TravaOrdemEtapasContratos1794500000000 implements MigrationInterface {
  name = 'TravaOrdemEtapasContratos1794500000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "contratos" ADD COLUMN "ordem_etapas_bloqueada" boolean NOT NULL DEFAULT false');
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "contratos" DROP COLUMN "ordem_etapas_bloqueada"');
  }
}
