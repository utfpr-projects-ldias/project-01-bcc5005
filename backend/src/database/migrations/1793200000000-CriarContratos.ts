import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HU05-01 — entidade raiz do domínio contratual (PRD §8.2, RF-01/02/03).
 *
 * Decisões refletidas nas constraints (com justificativa):
 *
 * - **Sem UNIQUE global em `numero_contrato`**: escopo não confirmado pelo
 *   PRD nem pelo issue ("não criar unicidade global sem confirmação").
 *   Índice btree comum cobre RF-38 (filtro/busca).
 * - **CHECK `termino_vigencia >= inicio_vigencia`**: barra calendário
 *   inválido (issue: "bloquear calendário inválido"); PostgreSQL `date` já
 *   rejeita datas impossíveis (ex.: 30/02).
 * - **CHECKs de string não vazia** nos obrigatórios: `btrim(x) > 0` impede
 *   `'   '` passar como número/órgão/objeto.
 * - **`responsavel_interno_id` nullable + FK ON DELETE SET NULL**:
 *   RF-03, issue ("manter vínculo opcional") e evita acoplar a TEC07.
 * - **`fiscal_gestor` apenas texto**: PRD §1.3 — fiscal público não acessa.
 * - **Sem colunas financeiras** (valor, saldo, pagamento, empenho): R-01,
 *   RB-13, §2.2.
 * - **Sem `criado_em`/`atualizado_em`**: rastreabilidade via
 *   `eventos_auditoria` (§8.4: contract_created / contract_updated).
 * - **`permissoes_contrato.contrato_id` → `contratos.id` NÃO é criada aqui**:
 *   pertence a HU05-02, conforme comentário já existente naquela entidade.
 * - **RNF-12 respeitado**: `id` UUID e datas permitem que HUs futuras
 *   (períodos de execução, evidências, ocorrências) referenciem o contrato
 *   sem reestruturação destrutiva.
 */
export class CriarContratos1793200000000 implements MigrationInterface {
  name = 'CriarContratos1793200000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // Enums tipados no PostgreSQL — espelham o PRD (RF-02, §8.2).
    await queryRunner.query(`
      CREATE TYPE "contratos_status_enum" AS ENUM (
        'PLANEJAMENTO',
        'EM_EXECUCAO',
        'EM_ENCERRAMENTO',
        'CONCLUIDO',
        'SUSPENSO',
        'CANCELADO'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "contratos_modo_calculo_enum" AS ENUM (
        'SIMPLES',
        'PONDERADO'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "contratos" (
        "id"                     uuid          NOT NULL DEFAULT gen_random_uuid(),
        "numero_contrato"        varchar(100)  NOT NULL,
        "processo_administrativo" varchar(100) NULL,
        "orgao_contratante"      varchar(255)  NOT NULL,
        "unidade_responsavel"    varchar(255)  NULL,
        "objeto"                 varchar(500)  NOT NULL,
        "descricao"              text          NULL,
        "data_assinatura"        date          NULL,
        "inicio_vigencia"        date          NOT NULL,
        "termino_vigencia"       date          NOT NULL,
        "status"                 "contratos_status_enum"       NOT NULL,
        "responsavel_interno_id" uuid          NULL,
        "fiscal_gestor"          varchar(255)  NULL,
        "modo_calculo"           "contratos_modo_calculo_enum" NOT NULL,
        "observacoes"            text          NULL,

        CONSTRAINT "pk_contratos" PRIMARY KEY ("id"),

        -- Vigência coerente (issue: "CHECK de término ≥ início é defensável").
        CONSTRAINT "ck_contratos_vigencia"
          CHECK ("termino_vigencia" >= "inicio_vigencia"),

        -- Obrigatórios não podem ser vazios/só-espaço.
        CONSTRAINT "ck_contratos_numero_nao_vazio"
          CHECK (length(btrim("numero_contrato")) > 0),
        CONSTRAINT "ck_contratos_orgao_nao_vazio"
          CHECK (length(btrim("orgao_contratante")) > 0),
        CONSTRAINT "ck_contratos_objeto_nao_vazio"
          CHECK (length(btrim("objeto")) > 0),

        -- Vínculo opcional ao usuário de domínio (RF-03 / issue).
        CONSTRAINT "fk_contratos_responsavel_interno"
          FOREIGN KEY ("responsavel_interno_id") REFERENCES "usuarios"("id")
          ON DELETE SET NULL
      )
    `);

    // Índices alinhados aos acessos previstos em HU05-02/03/04 e RF-26/27/29/30/38:
    // - composto (status, termino_vigencia): "próximos do encerramento" do dashboard.
    // - termino_vigencia isolado: "atrasados" cross-status (RB-09, RF-30).
    // - inicio_vigencia: cronograma (RF-29).
    // - responsavel_interno_id: "meus contratos" (RB-20).
    // - numero_contrato: filtro/busca (RF-38) — NÃO único.
    await queryRunner.query(
      'CREATE INDEX "idx_contratos_status_termino" ON "contratos" ("status", "termino_vigencia")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_contratos_termino_vigencia" ON "contratos" ("termino_vigencia")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_contratos_inicio_vigencia" ON "contratos" ("inicio_vigencia")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_contratos_responsavel_interno" ON "contratos" ("responsavel_interno_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_contratos_numero_contrato" ON "contratos" ("numero_contrato")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX "idx_contratos_numero_contrato"');
    await queryRunner.query('DROP INDEX "idx_contratos_responsavel_interno"');
    await queryRunner.query('DROP INDEX "idx_contratos_inicio_vigencia"');
    await queryRunner.query('DROP INDEX "idx_contratos_termino_vigencia"');
    await queryRunner.query('DROP INDEX "idx_contratos_status_termino"');
    await queryRunner.query('DROP TABLE "contratos"');
    await queryRunner.query('DROP TYPE "contratos_modo_calculo_enum"');
    await queryRunner.query('DROP TYPE "contratos_status_enum"');
  }
}