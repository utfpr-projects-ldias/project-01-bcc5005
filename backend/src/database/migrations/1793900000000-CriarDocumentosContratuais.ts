import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Migration aditiva TEC08-02: nunca altera tabela/migration histórica nem remove dados. */
export class CriarDocumentosContratuais1793900000000 implements MigrationInterface {
  name = 'CriarDocumentosContratuais1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "documentos_contratuais" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "contrato_id" uuid NOT NULL,
        "autor_id" uuid NOT NULL,
        "categoria" varchar(32) NOT NULL,
        "descricao" varchar(300),
        "nome_original" varchar(180) NOT NULL,
        "tipo_mime" varchar(100) NOT NULL,
        "tamanho" integer NOT NULL,
        "sha256" char(64) NOT NULL,
        "storage_key" varchar(32) NOT NULL,
        "criado_em" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_documentos_contratuais" PRIMARY KEY ("id"),
        CONSTRAINT "uq_documentos_storage_key" UNIQUE ("storage_key"),
        CONSTRAINT "ck_documentos_tamanho_positivo" CHECK ("tamanho" > 0),
        CONSTRAINT "ck_documentos_categoria" CHECK ("categoria" IN ('CONTRATO_PRINCIPAL','ADITIVO','ANEXO','OUTRO')),
        CONSTRAINT "ck_documentos_sha256" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
        CONSTRAINT "ck_documentos_storage_key" CHECK ("storage_key" ~ '^[a-f0-9]{32}$'),
        CONSTRAINT "fk_documentos_contrato" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT,
        CONSTRAINT "fk_documentos_autor" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT
      )
    `);
    await queryRunner.query('CREATE INDEX "idx_documentos_contrato_categoria_criacao" ON "documentos_contratuais" ("contrato_id", "categoria", "criado_em")');
    await queryRunner.query('CREATE INDEX "idx_documentos_autor" ON "documentos_contratuais" ("autor_id")');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A API de migrações exige down, mas produção não deve executar reversão sem backup/aceite.
    await queryRunner.query('DROP TABLE "documentos_contratuais"');
  }
}
