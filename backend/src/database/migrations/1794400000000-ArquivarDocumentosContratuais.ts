import { MigrationInterface, QueryRunner } from 'typeorm';

/** Arquivamento lógico; nenhum documento ou blob existente é removido. */
export class ArquivarDocumentosContratuais1794400000000 implements MigrationInterface {
  name = 'ArquivarDocumentosContratuais1794400000000';
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "documentos_contratuais" ADD COLUMN "arquivado_em" timestamptz');
    await queryRunner.query('CREATE INDEX "idx_documentos_contrato_arquivado" ON "documentos_contratuais" ("contrato_id", "arquivado_em")');
  }
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_documentos_contrato_arquivado"');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" DROP COLUMN "arquivado_em"');
  }
}
