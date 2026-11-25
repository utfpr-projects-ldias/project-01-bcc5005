import type { MigrationInterface, QueryRunner } from 'typeorm';

/** R40 — Estados ortogonais e quantidade aprovada em versão de comprovante.
 * A trilha histórica e as versões anteriores permanecem intactas. */
export class ComprovacaoEQuantidadeEvidencia1797500000000 implements MigrationInterface {
  name = 'ComprovacaoEQuantidadeEvidencia1797500000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TYPE "entregaveis_status_execucao_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_CONCLUSAO_PARCIAL'`);
    await q.query(`ALTER TYPE "entregaveis_status_execucao_enum" ADD VALUE IF NOT EXISTS 'CONCLUIDO_PARCIALMENTE'`);
    await q.query(`ALTER TABLE "comprovantes_evidencia" ADD COLUMN IF NOT EXISTS "quantidade_declarada" numeric(18,3)`);
    await q.query(`ALTER TABLE "comprovantes_evidencia" ADD COLUMN IF NOT EXISTS "quantidade_aprovada" numeric(18,3)`);
    await q.query(`ALTER TABLE comprovantes_evidencia ADD COLUMN ocorrencia_quantidade_id uuid, ADD COLUMN origem_quantidade varchar(20), ADD COLUMN referencia_execucao varchar(100)`);
    await q.query(`ALTER TABLE comprovantes_evidencia ADD CONSTRAINT fk_comprovante_quantidade_ocorrencia FOREIGN KEY (ocorrencia_quantidade_id,contrato_id) REFERENCES ocorrencias(id,contrato_id) ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE comprovantes_evidencia ADD CONSTRAINT ck_comprovante_origem_quantidade CHECK (
      (quantidade_declarada IS NULL AND ocorrencia_quantidade_id IS NULL AND origem_quantidade IS NULL AND referencia_execucao IS NULL) OR
      (quantidade_declarada IS NOT NULL AND ocorrencia_quantidade_id IS NOT NULL AND origem_quantidade IS NOT NULL AND origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO') AND referencia_execucao IS NOT NULL AND length(btrim(referencia_execucao))>0))`);
    // Novo desfecho explícito de análise, sem excluir versões ou documentos anteriores.
    await q.query(`ALTER TABLE "comprovantes_evidencia" DROP CONSTRAINT "ck_comprovantes_status"`);
    await q.query(`ALTER TABLE "comprovantes_evidencia" ADD CONSTRAINT "ck_comprovantes_status"
      CHECK ("status" IN ('PENDENTE_VERIFICACAO','VERIFICADA','REJEITADA'))`);
    await q.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='ck_comprovantes_quantidades_validas') THEN
      ALTER TABLE comprovantes_evidencia ADD CONSTRAINT ck_comprovantes_quantidades_validas CHECK (
        (quantidade_declarada IS NULL OR quantidade_declarada > 0) AND
        (quantidade_aprovada IS NULL OR (quantidade_declarada IS NOT NULL AND quantidade_aprovada > 0
          AND quantidade_aprovada <= quantidade_declarada AND status='VERIFICADA'))
      ); END IF; END $$;`);
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'PENDENTE_CONCLUSAO_PARCIAL'`);
    await q.query(`ALTER TYPE "ocorrencias_status_enum" ADD VALUE IF NOT EXISTS 'CONCLUIDO_PARCIALMENTE'`);
    await q.query(`ALTER TYPE "etapas_status_enum" ADD VALUE IF NOT EXISTS 'CONCLUIDO_PARCIALMENTE'`);
    await q.query(`ALTER TYPE "contratos_status_enum" ADD VALUE IF NOT EXISTS 'CONCLUIDO_PARCIALMENTE'`);
    await q.query(`ALTER TABLE etapas ADD COLUMN conclusao_parcial_solicitada boolean NOT NULL DEFAULT false`);
    await q.query(`ALTER TABLE contratos ADD COLUMN conclusao_parcial_solicitada boolean NOT NULL DEFAULT false`);
    // A mesma consulta alimenta o gate, os resumos e o estado persistido.
    await q.query(`CREATE VIEW vw_comprovacao_entregavel_r40 AS
      WITH ultimas AS (
        SELECT DISTINCT ON (ce.evidencia_esperada_id) ce.*
        FROM comprovantes_evidencia ce ORDER BY ce.evidencia_esperada_id, ce.criado_em DESC, ce.id DESC
      ), checklist AS (
        SELECT ev.entregavel_id, count(*)::int AS total,
          count(*) FILTER (WHERE ev.obrigatoria IS TRUE)::int AS obrigatorias,
          count(*) FILTER (WHERE ev.obrigatoria IS TRUE AND ev.reaberto_em IS NULL AND u.status='VERIFICADA' AND u.verificado_em IS NOT NULL)::int AS verificadas,
          count(*) FILTER (WHERE ev.reaberto_em IS NULL AND u.status='VERIFICADA' AND u.verificado_em IS NOT NULL)::int AS verificadas_total,
          count(u.id)::int AS enviadas
        FROM evidencias_esperadas ev LEFT JOIN ultimas u ON u.evidencia_esperada_id=ev.id
        WHERE ev.arquivado_em IS NULL GROUP BY ev.entregavel_id
      ), provas AS (
        SELECT oc.ocorrencia_id, count(*)::int AS enviadas,
          count(*) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL)::int AS total,
          count(*) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL AND lower(ev.tipo_evidencia) ~ '(foto|imagem|png|jpeg|jpg)')::int AS fotos,
          count(*) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL AND lower(ev.tipo_evidencia) !~ '(foto|imagem|png|jpeg|jpg)' AND lower(ev.tipo_evidencia) ~ '(relat|report)')::int AS relatorios
        FROM ocorrencia_comprovantes oc JOIN ultimas u ON u.id=oc.comprovante_id AND u.contrato_id=oc.contrato_id
        JOIN evidencias_esperadas ev ON ev.id=u.evidencia_esperada_id AND ev.arquivado_em IS NULL
        GROUP BY oc.ocorrencia_id
      ), requisitos AS (
        SELECT o.entregavel_id, COALESCE(p.enviadas,0) AS enviadas,
          COALESCE(p.total,0) AS total,
          CASE WHEN o.minimo_fotos IS NOT NULL OR o.minimo_relatorios IS NOT NULL OR o.minimo_evidencias_livres IS NOT NULL
            THEN COALESCE(o.minimo_fotos,0)+COALESCE(o.minimo_relatorios,0)+COALESCE(o.minimo_evidencias_livres,0)
            ELSE COALESCE(o.minimo_evidencias_verificadas, CASE o.evidencia_exigida WHEN 'AMBOS' THEN 2 WHEN 'NENHUMA' THEN 0 ELSE 1 END) END AS minimo,
          CASE WHEN o.minimo_fotos IS NOT NULL OR o.minimo_relatorios IS NOT NULL OR o.minimo_evidencias_livres IS NOT NULL
            THEN COALESCE(p.fotos,0)>=COALESCE(o.minimo_fotos,0) AND COALESCE(p.relatorios,0)>=COALESCE(o.minimo_relatorios,0)
              AND COALESCE(p.total,0)>=COALESCE(o.minimo_fotos,0)+COALESCE(o.minimo_relatorios,0)+COALESCE(o.minimo_evidencias_livres,0)
            ELSE COALESCE(p.fotos,0)+COALESCE(p.relatorios,0)>=COALESCE(o.minimo_evidencias_verificadas, CASE o.evidencia_exigida WHEN 'AMBOS' THEN 2 WHEN 'NENHUMA' THEN 0 ELSE 1 END)
              AND (COALESCE(o.minimo_evidencias_verificadas, CASE o.evidencia_exigida WHEN 'AMBOS' THEN 2 WHEN 'NENHUMA' THEN 0 ELSE 1 END)=0 OR CASE o.evidencia_exigida
                 WHEN 'FOTO' THEN COALESCE(p.fotos,0)>=COALESCE(o.minimo_evidencias_verificadas,1)
                 WHEN 'RELATORIO' THEN COALESCE(p.relatorios,0)>=COALESCE(o.minimo_evidencias_verificadas,1)
                 WHEN 'AMBOS' THEN COALESCE(p.fotos,0)>0 AND COALESCE(p.relatorios,0)>0 ELSE TRUE END) END AS atendido
        FROM ocorrencias o LEFT JOIN provas p ON p.ocorrencia_id=o.id WHERE o.substituida_em IS NULL
      ), ocorr AS (
        SELECT entregavel_id, count(*) FILTER (WHERE minimo>0)::int AS exigidas,
          count(*) FILTER (WHERE minimo>0 AND atendido)::int AS atendidas,
          sum(enviadas)::int AS enviadas, sum(total)::int AS verificadas
        FROM requisitos GROUP BY entregavel_id
      ) SELECT e.id AS entregavel_id, e.contrato_id,
        COALESCE(c.obrigatorias,0) AS obrigatorias, COALESCE(c.verificadas,0) AS verificadas,
        COALESCE(c.total,0) AS total, COALESCE(c.verificadas_total,0) AS verificadas_total,
        COALESCE(o.exigidas,0) AS ocorrencias_exigidas, COALESCE(o.atendidas,0) AS ocorrencias_atendidas,
        CASE WHEN COALESCE(c.obrigatorias,0)+COALESCE(o.exigidas,0)>0
          AND COALESCE(c.obrigatorias,0)=COALESCE(c.verificadas,0) AND COALESCE(o.exigidas,0)=COALESCE(o.atendidas,0) THEN 'COMPROVADO'
          WHEN COALESCE(c.enviadas,0)+COALESCE(o.enviadas,0)>0 THEN 'EVIDENCIA_PARCIAL'
          ELSE 'SEM_EVIDENCIA' END AS situacao
        FROM entregaveis e LEFT JOIN checklist c ON c.entregavel_id=e.id LEFT JOIN ocorr o ON o.entregavel_id=e.id`);
    await q.query(`CREATE OR REPLACE FUNCTION fn_recalcular_comprovacao_entregavel(p_entregavel uuid)
      RETURNS void LANGUAGE sql AS $$
        UPDATE entregaveis e SET situacao_comprovacao=v.situacao::entregaveis_situacao_comprovacao_enum
          FROM vw_comprovacao_entregavel_r40 v WHERE e.id=p_entregavel AND v.entregavel_id=e.id
          AND e.situacao_comprovacao IS DISTINCT FROM v.situacao::entregaveis_situacao_comprovacao_enum
      $$`);
    // Também cobre vínculos cruzados no mesmo contrato e substituição da última versão.
    await q.query(`CREATE FUNCTION trg_recalcular_documentacao_contrato_r40() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; BEGIN
        IF TG_TABLE_NAME='evidencias_esperadas' THEN
          IF TG_OP='DELETE' THEN SELECT contrato_id INTO cid FROM entregaveis WHERE id=OLD.entregavel_id;
          ELSE SELECT contrato_id INTO cid FROM entregaveis WHERE id=NEW.entregavel_id; END IF;
        ELSE
          IF TG_OP='DELETE' THEN cid:=OLD.contrato_id; ELSE cid:=NEW.contrato_id; END IF;
        END IF;
        PERFORM fn_recalcular_comprovacao_entregavel(id) FROM entregaveis WHERE contrato_id=cid;
        RETURN NULL;
      END $$`);
    await q.query(`CREATE TRIGGER trg_comprovacao_comprovante AFTER INSERT OR UPDATE OR DELETE ON comprovantes_evidencia
      FOR EACH ROW EXECUTE FUNCTION trg_recalcular_documentacao_contrato_r40()`);
    await q.query(`CREATE TRIGGER trg_comprovacao_requisito AFTER INSERT OR UPDATE OR DELETE ON evidencias_esperadas
      FOR EACH ROW EXECUTE FUNCTION trg_recalcular_documentacao_contrato_r40()`);
    await q.query(`CREATE TRIGGER trg_comprovacao_ocorrencia_r40 AFTER INSERT OR UPDATE OR DELETE ON ocorrencias
      FOR EACH ROW EXECUTE FUNCTION trg_recalcular_documentacao_contrato_r40()`);
    await q.query(`CREATE TRIGGER trg_comprovacao_vinculo_r40 AFTER INSERT OR UPDATE OR DELETE ON ocorrencia_comprovantes
      FOR EACH ROW EXECUTE FUNCTION trg_recalcular_documentacao_contrato_r40()`);
    // Nunca alterar estados operacionais existentes; somente recalcular o estado documental.
    await q.query(`SELECT fn_recalcular_comprovacao_entregavel(id) FROM entregaveis`);
  }
  async down(_q: QueryRunner): Promise<void> {
    throw new Error('R40: reversão automática indisponível para preservar decisões e quantidades históricas. Prepare uma migration de compatibilidade antes de reverter.');
  }
}
