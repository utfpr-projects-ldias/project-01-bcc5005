import type { MigrationInterface, QueryRunner } from 'typeorm';
/** Uma mesma versão binária não preenche duas cotas de uma ocorrência. */
export class ContagemProvasDistintas1798110000000 implements MigrationInterface {
  name = 'ContagemProvasDistintas1798110000000';
  async up(q:QueryRunner) {
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
        SELECT oc.ocorrencia_id, count(DISTINCT u.sha256)::int AS enviadas,
          count(DISTINCT u.sha256) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL)::int AS total,
          count(DISTINCT u.sha256) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL AND u.tipo_mime LIKE 'image/%' AND lower(ev.tipo_evidencia) ~ '(foto|imagem|png|jpeg|jpg)')::int AS fotos,
          count(DISTINCT u.sha256) FILTER (WHERE u.status='VERIFICADA' AND u.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL AND u.tipo_mime NOT LIKE 'image/%' AND lower(ev.tipo_evidencia) !~ '(foto|imagem|png|jpeg|jpg)' AND lower(ev.tipo_evidencia) ~ '(relat|report)')::int AS relatorios
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
    await q.query(`SELECT fn_recalcular_comprovacao_entregavel(id) FROM entregaveis`);
  }
  async down(q:QueryRunner) {
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
    await q.query(`SELECT fn_recalcular_comprovacao_entregavel(id) FROM entregaveis`);
  }
}
