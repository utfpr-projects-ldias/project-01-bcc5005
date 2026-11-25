import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Mesma fonte de provas para o checklist e a medição; vínculos N:N não duplicam um arquivo. */
export class ProvasVinculadasR411797650000000 implements MigrationInterface {
  name = 'ProvasVinculadasR411797650000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE VIEW vw_provas_ocorrencia_r41 AS
      SELECT ocorrencia_id, comprovante_id, contrato_id FROM ocorrencia_comprovantes
      UNION
      SELECT ao."ocorrenciaId", ac.comprovante_id, ac.contrato_id FROM atividade_comprovantes ac
      JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=ac.contrato_id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
      JOIN atividade_ocorrencias ao ON ao."atividadeId"=a.id AND ao."contratoId"=ac.contrato_id
      UNION
      SELECT a."ocorrenciaId", ac.comprovante_id, ac.contrato_id FROM atividade_comprovantes ac
      JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=ac.contrato_id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
      WHERE a."ocorrenciaId" IS NOT NULL`);
    await q.query(`CREATE OR REPLACE VIEW vw_comprovacao_entregavel_r40 AS
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
        FROM vw_provas_ocorrencia_r41 oc JOIN ultimas u ON u.id=oc.comprovante_id AND u.contrato_id=oc.contrato_id
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
          WHEN COALESCE(c.verificadas_total,0)+COALESCE(o.verificadas,0)>0 THEN 'EVIDENCIA_PARCIAL'
          ELSE 'SEM_EVIDENCIA' END AS situacao
        FROM entregaveis e LEFT JOIN checklist c ON c.entregavel_id=e.id LEFT JOIN ocorr o ON o.entregavel_id=e.id`);
    await q.query(`CREATE FUNCTION trg_documentacao_atividade_r41() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; BEGIN
        IF TG_OP='DELETE' THEN cid:=OLD."contratoId"; ELSE cid:=NEW."contratoId"; END IF;
        PERFORM fn_recalcular_comprovacao_entregavel(id) FROM entregaveis WHERE contrato_id=cid;
        RETURN NULL;
      END $$`);
    await q.query(`CREATE TRIGGER trg_comprovacao_atividade_r41 AFTER INSERT OR UPDATE OR DELETE ON atividades FOR EACH ROW EXECUTE FUNCTION trg_documentacao_atividade_r41()`);
    await q.query(`CREATE TRIGGER trg_comprovacao_atividade_ocorrencia_r41 AFTER INSERT OR UPDATE OR DELETE ON atividade_ocorrencias FOR EACH ROW EXECUTE FUNCTION trg_documentacao_atividade_r41()`);
    await q.query(`CREATE TRIGGER trg_comprovacao_atividade_vinculo_r41 AFTER INSERT OR UPDATE OR DELETE ON atividade_comprovantes FOR EACH ROW EXECUTE FUNCTION trg_recalcular_documentacao_contrato_r40()`);
    await q.query(`SELECT fn_recalcular_comprovacao_entregavel(id) FROM entregaveis`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TRIGGER trg_comprovacao_atividade_vinculo_r41 ON atividade_comprovantes`);
    await q.query(`DROP TRIGGER trg_comprovacao_atividade_ocorrencia_r41 ON atividade_ocorrencias`);
    await q.query(`DROP TRIGGER trg_comprovacao_atividade_r41 ON atividades`);
    await q.query(`DROP FUNCTION trg_documentacao_atividade_r41()`);
    await q.query(`CREATE OR REPLACE VIEW vw_comprovacao_entregavel_r40 AS
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
    await q.query(`DROP VIEW vw_provas_ocorrencia_r41`);
    await q.query(`SELECT fn_recalcular_comprovacao_entregavel(id) FROM entregaveis`);
  }
}
