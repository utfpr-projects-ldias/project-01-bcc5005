import { MigrationInterface, QueryRunner } from 'typeorm';

/** Verificação administrativa independente da comprovação operacional HU10.
 * Aditiva: documentos existentes começam pendentes; nenhum blob é modificado.
 */
export class VerificacaoDocumentos1794900000000 implements MigrationInterface {
  name = 'VerificacaoDocumentos1794900000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('ALTER TABLE "documentos_contratuais" ADD COLUMN "verificado_em" timestamptz');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" ADD COLUMN "verificado_por" uuid');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" ADD COLUMN "reaberto_em" timestamptz');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" ADD CONSTRAINT "fk_documentos_verificado_por" FOREIGN KEY ("verificado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL');
    await queryRunner.query('CREATE INDEX "idx_documentos_contrato_verificacao" ON "documentos_contratuais" ("contrato_id", "categoria", "arquivado_em", "verificado_em")');
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_documentos_contrato_verificacao"');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" DROP COLUMN "reaberto_em"');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" DROP CONSTRAINT "fk_documentos_verificado_por"');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" DROP COLUMN "verificado_por"');
    await queryRunner.query('ALTER TABLE "documentos_contratuais" DROP COLUMN "verificado_em"');
  }
}
