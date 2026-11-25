import type { MigrationInterface, QueryRunner } from 'typeorm';

export class IntegridadeDocumentalB091798260000000 implements MigrationInterface {
  name = 'IntegridadeDocumentalB091798260000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE uploads_documentais (
      escopo text NOT NULL, autor_id uuid NOT NULL, chave uuid NOT NULL,
      fingerprint char(64) NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
      registro_id uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY(escopo,autor_id,chave))`);
    // Datas históricas desconhecidas ficam nulas: não atribuir a data da migration ao cadastro antigo.
    await q.query(`ALTER TABLE evidencias_esperadas ADD COLUMN criado_em timestamptz`);
    await q.query(`UPDATE evidencias_esperadas ev SET criado_em=a.primeiro
      FROM (SELECT dados_posteriores->>'itemId' AS item, min(registrado_em) AS primeiro
        FROM eventos_auditoria WHERE acao='ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA'
          AND dados_posteriores->>'operacao'='CRIAR_ITEM' GROUP BY dados_posteriores->>'itemId') a
      WHERE ev.id::text=a.item`);
    await q.query(`ALTER TABLE evidencias_esperadas ALTER COLUMN criado_em SET DEFAULT now()`);
    await q.query(`CREATE INDEX idx_b09_evidencia_criacao ON evidencias_esperadas(entregavel_id,criado_em DESC)`);
  }
  async down(q: QueryRunner): Promise<void> {
    const [r] = await q.query(`SELECT EXISTS(SELECT 1 FROM uploads_documentais) OR
      EXISTS(SELECT 1 FROM evidencias_esperadas WHERE criado_em IS NOT NULL) AS possui`);
    if (r.possui) throw new Error('A reversão descartaria recibos de upload ou datas de cadastro.');
    await q.query(`DROP INDEX idx_b09_evidencia_criacao`);
    await q.query(`ALTER TABLE evidencias_esperadas DROP COLUMN criado_em`);
    await q.query(`DROP TABLE uploads_documentais`);
  }
}
