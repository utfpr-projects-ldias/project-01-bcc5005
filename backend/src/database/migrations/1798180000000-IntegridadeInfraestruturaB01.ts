import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Reforça escopo e integridade sem alterar registros, identificadores ou migrations anteriores.
 * As constraints são validadas também nos dados legados: qualquer violação aborta esta migration.
 */
export class IntegridadeInfraestruturaB011798180000000 implements MigrationInterface {
  name = 'IntegridadeInfraestruturaB011798180000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ocorrencias ADD CONSTRAINT uq_b01_ocorrencia_escopo UNIQUE(id,contrato_id,entregavel_id)`);
    await q.query(`ALTER TABLE execucoes_entregavel DROP CONSTRAINT fk_execucoes_ocorrencia,
      ADD CONSTRAINT fk_execucoes_ocorrencia FOREIGN KEY(ocorrencia_id,contrato_id,entregavel_id)
      REFERENCES ocorrencias(id,contrato_id,entregavel_id) ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE comprovantes_evidencia DROP CONSTRAINT fk_comprovante_quantidade_ocorrencia,
      ADD CONSTRAINT fk_comprovante_quantidade_ocorrencia FOREIGN KEY(ocorrencia_quantidade_id,contrato_id,entregavel_id)
      REFERENCES ocorrencias(id,contrato_id,entregavel_id) ON DELETE RESTRICT`);
    await q.query(`ALTER TABLE atividade_entregavel_medicoes
      DROP CONSTRAINT atividade_entregavel_medicoes_atividade_id_fkey,
      DROP CONSTRAINT atividade_entregavel_medicoes_entregavel_id_fkey,
      DROP CONSTRAINT atividade_entregavel_medicoes_contrato_id_fkey,
      ADD CONSTRAINT fk_b01_medicao_direta_atividade FOREIGN KEY(atividade_id,contrato_id) REFERENCES atividades(id,"contratoId") ON DELETE RESTRICT,
      ADD CONSTRAINT fk_b01_medicao_direta_entregavel FOREIGN KEY(entregavel_id,contrato_id) REFERENCES entregaveis(id,contrato_id) ON DELETE RESTRICT`);

    // A associação documental pode atravessar entregáveis no mesmo contrato;
    // as FKs acima limitam apenas a contribuição física ao seu destino.
    const fks = [
      ['ocorrencia_lancamentos','fk_lancamentos_ocorrencia_contrato','ocorrencia_id,contrato_id','ocorrencias','id,contrato_id'],
      ['atividade_ocorrencia_medicoes','fk_medicoes_atividade_contrato','atividade_id,contrato_id','atividades','id,"contratoId"'],
      ['atividade_ocorrencia_medicoes','fk_medicoes_ocorrencia_contrato','ocorrencia_id,contrato_id','ocorrencias','id,contrato_id'],
      ['ocorrencia_comprovantes','fk_oc_comprovantes_ocorrencia_contrato','ocorrencia_id,contrato_id','ocorrencias','id,contrato_id'],
      ['ocorrencia_comprovantes','fk_oc_comprovantes_comprovante_contrato','comprovante_id,contrato_id','comprovantes_evidencia','id,contrato_id'],
      ['atividade_comprovantes','fk_atividade_comprovantes_atividade_contrato','atividade_id,contrato_id','atividades','id,"contratoId"'],
      ['atividade_comprovantes','fk_atividade_comprovantes_comprovante_contrato','comprovante_id,contrato_id','comprovantes_evidencia','id,contrato_id'],
    ];
    for (const [tabela,nome,colunas,destino,chave] of fks) {
      await q.query(`ALTER TABLE ${tabela} DROP CONSTRAINT ${nome}, ADD CONSTRAINT ${nome}
        FOREIGN KEY(${colunas}) REFERENCES ${destino}(${chave}) ON DELETE RESTRICT`);
    }

    // Rascunho sem meta continua válido. A presença parcial dos campos não é válida.
    await q.query(`ALTER TABLE entregaveis DROP CONSTRAINT ck_entregaveis_quantitativo,
      ADD CONSTRAINT ck_entregaveis_quantitativo CHECK ((tipo <> 'QUANTITATIVO' OR
        ((quantidade_prevista IS NULL AND unidade_medida IS NULL) OR
         (quantidade_prevista IS NOT NULL AND quantidade_prevista > 0 AND unidade_medida IS NOT NULL AND length(btrim(unidade_medida))>0))) IS TRUE)`);
    await q.query(`ALTER TABLE entregaveis DROP CONSTRAINT ck_entregaveis_recorrencia,
      ADD CONSTRAINT ck_entregaveis_recorrencia CHECK (((tipo='RECORRENTE' AND
        ((periodicidade IS NULL AND configuracao_periodicidade IS NULL) OR
        (periodicidade IS NOT NULL AND configuracao_periodicidade IS NOT NULL AND configuracao_periodicidade IN
        ('{"versao":1}'::jsonb,'{"versao":1,"modoRegistro":"DESCRITIVO"}'::jsonb,'{"versao":1,"modoRegistro":"QUANTITATIVO"}'::jsonb)))) OR
        (tipo<>'RECORRENTE' AND periodicidade IS NULL AND configuracao_periodicidade IS NULL)) IS TRUE)`);
    await q.query(`ALTER TABLE configuracoes_ocorrencias ADD CONSTRAINT ck_b01_config_quantitativa CHECK ((tipo_operacional <> 'QUANTITATIVO' OR
        ((quantidade_prevista IS NULL AND unidade_medida IS NULL) OR
         (quantidade_prevista IS NOT NULL AND quantidade_prevista > 0 AND unidade_medida IS NOT NULL AND length(btrim(unidade_medida))>0))) IS TRUE)`);

    // NUMERIC admite NaN mesmo com typmod; comparações > 0 não o rejeitam em PostgreSQL.
    for (const [tabela,colunas] of [
      ['entregaveis',['quantidade_prevista','quantidade_realizada','peso','percentual_execucao']],
      ['ocorrencias',['meta_quantidade','quantidade_realizada','quantidade_aprovada']],
      ['configuracoes_ocorrencias',['quantidade_prevista']],
      ['atividades',['quantidade_execucao']],
      ['comprovantes_evidencia',['quantidade_declarada','quantidade_aprovada']],
      ['ocorrencia_lancamentos',['quantidade']],
      ['atividade_ocorrencia_medicoes',['quantidade']],
      ['atividade_entregavel_medicoes',['quantidade']],
      ['execucoes_quantitativas_diretas',['quantidade']],
    ] as const) {
      await q.query(`ALTER TABLE ${tabela} ADD CONSTRAINT ck_b01_${tabela}_quantidades_finitas CHECK (${colunas.map(c => `(${c} IS NULL OR ${c}::text NOT IN ('NaN','Infinity','-Infinity'))`).join(' AND ')})`);
    }

    // Índices de busca reversa: mantêm os índices históricos usados por FKs e planos existentes.
    for (const sql of [
      'CREATE INDEX idx_b01_execucoes_ocorrencia ON execucoes_entregavel(ocorrencia_id,contrato_id,entregavel_id) WHERE ocorrencia_id IS NOT NULL',
      'CREATE INDEX idx_b01_execucoes_referencia ON execucoes_entregavel(referencia_id,contrato_id,entregavel_id) WHERE referencia_id IS NOT NULL',
      'CREATE INDEX idx_b01_comprovantes_ocorrencia ON comprovantes_evidencia(ocorrencia_quantidade_id,contrato_id,entregavel_id) WHERE ocorrencia_quantidade_id IS NOT NULL',
      'CREATE INDEX idx_b01_oc_comprovantes_reverso ON ocorrencia_comprovantes(comprovante_id,contrato_id)',
      'CREATE INDEX idx_b01_at_comprovantes_reverso ON atividade_comprovantes(comprovante_id,contrato_id)',
      'CREATE INDEX idx_b01_at_entregaveis_reverso ON atividade_entregaveis("entregavelId","contratoId")',
      'CREATE INDEX idx_b01_marco_ocorrencia ON vinculos_metas_marco(ocorrencia_id,contrato_id) WHERE ocorrencia_id IS NOT NULL',
      'CREATE INDEX idx_b01_marco_atividade ON vinculos_metas_marco(atividade_id,contrato_id) WHERE atividade_id IS NOT NULL',
      'CREATE INDEX idx_b01_marco_comprovante ON vinculos_metas_marco(comprovante_id,contrato_id) WHERE comprovante_id IS NOT NULL',
    ]) await q.query(sql);

    // Um UPDATE por contrato, em vez de executar novamente a view por entregável.
    await q.query(`CREATE FUNCTION fn_recalcular_comprovacao_contrato_b01(p_contrato uuid) RETURNS void LANGUAGE sql AS $$
      UPDATE entregaveis e SET situacao_comprovacao=v.situacao::entregaveis_situacao_comprovacao_enum
      FROM vw_comprovacao_entregavel_r40 v WHERE e.contrato_id=p_contrato AND v.entregavel_id=e.id
      AND e.situacao_comprovacao IS DISTINCT FROM v.situacao::entregaveis_situacao_comprovacao_enum
    $$`);
    // Comparar apenas as colunas lidas pelas views R40/R41. Não reduzir o escopo
    // ao entregável de origem: vínculos documentais cruzados também são afetados.
    await q.query(`CREATE OR REPLACE FUNCTION trg_recalcular_documentacao_contrato_r40() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; anterior uuid; BEGIN
        IF TG_OP='UPDATE' THEN
          CASE TG_TABLE_NAME
            WHEN 'evidencias_esperadas' THEN
              IF ROW(OLD.id,OLD.entregavel_id,OLD.obrigatoria,OLD.reaberto_em,OLD.arquivado_em,OLD.tipo_evidencia)
                IS NOT DISTINCT FROM ROW(NEW.id,NEW.entregavel_id,NEW.obrigatoria,NEW.reaberto_em,NEW.arquivado_em,NEW.tipo_evidencia) THEN RETURN NULL; END IF;
            WHEN 'comprovantes_evidencia' THEN
              IF ROW(OLD.id,OLD.contrato_id,OLD.evidencia_esperada_id,OLD.criado_em,OLD.status,OLD.verificado_em,OLD.sha256,OLD.tipo_mime)
                IS NOT DISTINCT FROM ROW(NEW.id,NEW.contrato_id,NEW.evidencia_esperada_id,NEW.criado_em,NEW.status,NEW.verificado_em,NEW.sha256,NEW.tipo_mime) THEN RETURN NULL; END IF;
            WHEN 'ocorrencias' THEN
              IF ROW(OLD.id,OLD.contrato_id,OLD.entregavel_id,OLD.substituida_em,OLD.minimo_fotos,OLD.minimo_relatorios,OLD.minimo_evidencias_livres,OLD.minimo_evidencias_verificadas,OLD.evidencia_exigida)
                IS NOT DISTINCT FROM ROW(NEW.id,NEW.contrato_id,NEW.entregavel_id,NEW.substituida_em,NEW.minimo_fotos,NEW.minimo_relatorios,NEW.minimo_evidencias_livres,NEW.minimo_evidencias_verificadas,NEW.evidencia_exigida) THEN RETURN NULL; END IF;
            WHEN 'ocorrencia_comprovantes' THEN
              IF ROW(OLD.ocorrencia_id,OLD.comprovante_id,OLD.contrato_id) IS NOT DISTINCT FROM ROW(NEW.ocorrencia_id,NEW.comprovante_id,NEW.contrato_id) THEN RETURN NULL; END IF;
            WHEN 'atividade_comprovantes' THEN
              IF ROW(OLD.atividade_id,OLD.comprovante_id,OLD.contrato_id) IS NOT DISTINCT FROM ROW(NEW.atividade_id,NEW.comprovante_id,NEW.contrato_id) THEN RETURN NULL; END IF;
            ELSE NULL;
          END CASE;
        END IF;
        IF TG_TABLE_NAME='evidencias_esperadas' THEN
          IF TG_OP<>'INSERT' THEN SELECT contrato_id INTO anterior FROM entregaveis WHERE id=OLD.entregavel_id; END IF;
          IF TG_OP<>'DELETE' THEN SELECT contrato_id INTO cid FROM entregaveis WHERE id=NEW.entregavel_id; END IF;
        ELSE
          IF TG_OP<>'INSERT' THEN anterior:=OLD.contrato_id; END IF;
          IF TG_OP<>'DELETE' THEN cid:=NEW.contrato_id; END IF;
        END IF;
        IF anterior IS NOT NULL AND anterior IS DISTINCT FROM cid THEN PERFORM fn_recalcular_comprovacao_contrato_b01(anterior); END IF;
        IF cid IS NOT NULL THEN PERFORM fn_recalcular_comprovacao_contrato_b01(cid); END IF;
        RETURN NULL;
      END $$`);
    await q.query(`CREATE OR REPLACE FUNCTION trg_documentacao_atividade_r41() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE cid uuid; anterior uuid; BEGIN
        IF TG_OP='UPDATE' THEN
          IF TG_TABLE_NAME='atividades' THEN
            IF ROW(OLD.id,OLD."contratoId",OLD.status,OLD."excluidaEm",OLD."ocorrenciaId")
              IS NOT DISTINCT FROM ROW(NEW.id,NEW."contratoId",NEW.status,NEW."excluidaEm",NEW."ocorrenciaId") THEN RETURN NULL; END IF;
          ELSE
            IF ROW(OLD."atividadeId",OLD."contratoId",OLD."ocorrenciaId") IS NOT DISTINCT FROM ROW(NEW."atividadeId",NEW."contratoId",NEW."ocorrenciaId") THEN RETURN NULL; END IF;
          END IF;
        END IF;
        IF TG_OP<>'INSERT' THEN anterior:=OLD."contratoId"; END IF;
        IF TG_OP<>'DELETE' THEN cid:=NEW."contratoId"; END IF;
        IF anterior IS NOT NULL AND anterior IS DISTINCT FROM cid THEN PERFORM fn_recalcular_comprovacao_contrato_b01(anterior); END IF;
        IF cid IS NOT NULL THEN PERFORM fn_recalcular_comprovacao_contrato_b01(cid); END IF;
        RETURN NULL;
      END $$`);
  }
  async down(_q: QueryRunner): Promise<void> {
    throw new Error('Reversão não suportada: reintroduziria cascatas destrutivas e relaxaria a integridade de escopo. Utilize uma migration corretiva aditiva.');
  }
}
