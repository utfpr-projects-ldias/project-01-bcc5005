import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Não transforma metas antigas em objetivos com pesos arbitrários. */
export class MetasMarcoPonderadas1798290000000 implements MigrationInterface {
  async up(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM metas_marco) THEN
      RAISE EXCEPTION 'Existem metas do modelo antigo. A evolução exige uma base de desenvolvimento sem metas legadas.';
    END IF; END; $$`);
    await q.query(`ALTER TABLE metas_marco DROP CONSTRAINT metas_marco_tipo_check,
      DROP COLUMN quantidade_exigida,
      ADD COLUMN peso_centesimos integer NOT NULL CHECK (peso_centesimos BETWEEN 1 AND 10000),
      ADD COLUMN quantidade_prevista numeric(18,3), ADD COLUMN unidade_medida varchar(40),
      ADD COLUMN criterio_conclusao varchar(1000) NOT NULL CHECK (length(btrim(criterio_conclusao)) > 0),
      ADD COLUMN provas_exigidas integer NOT NULL DEFAULT 0 CHECK (provas_exigidas BETWEEN 0 AND 100),
      ADD COLUMN estado varchar(32) NOT NULL DEFAULT 'ABERTA' CHECK (estado IN ('ABERTA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','PENDENTE_REGULARIZACAO','CONCLUIDA','CONCLUIDA_PARCIALMENTE','ENCERRADA')),
      ADD COLUMN justificativa_estado varchar(1000),
      ADD CONSTRAINT ck_meta_marco_modalidade CHECK (
        (tipo='DESCRITIVA' AND quantidade_prevista IS NULL AND unidade_medida IS NULL) OR
        (tipo='QUANTITATIVA' AND quantidade_prevista IS NOT NULL AND quantidade_prevista>0 AND unidade_medida IS NOT NULL AND length(btrim(unidade_medida))>0))`);
    await q.query(`ALTER TABLE vinculos_metas_marco DROP CONSTRAINT ck_vinculo_marco_um_registro,
      DROP COLUMN comprovante_id,
      ADD COLUMN evidencia_esperada_id uuid REFERENCES evidencias_esperadas(id) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_vinculo_marco_um_registro CHECK (num_nonnulls(ocorrencia_id,atividade_id,evidencia_esperada_id)=1)`);
    await q.query(`CREATE UNIQUE INDEX uq_vinculo_marco_esperada_ativo ON vinculos_metas_marco(meta_id,evidencia_esperada_id) WHERE evidencia_esperada_id IS NOT NULL AND status<>'REJEITADO'`);
    await q.query(`CREATE INDEX idx_marco_esperada ON vinculos_metas_marco(evidencia_esperada_id,contrato_id) WHERE evidencia_esperada_id IS NOT NULL`);
    await q.query(`ALTER TABLE ocorrencias ADD COLUMN unidade_medida_marco varchar(40),
      ADD COLUMN meta_marco_origem_id uuid,
      ADD CONSTRAINT fk_ocorrencia_meta_marco FOREIGN KEY (meta_marco_origem_id,contrato_id) REFERENCES metas_marco(id,contrato_id) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_ocorrencia_unidade_marco CHECK ((unidade_medida_marco IS NULL AND meta_marco_origem_id IS NULL) OR (unidade_medida_marco IS NOT NULL AND meta_marco_origem_id IS NOT NULL AND length(btrim(unidade_medida_marco))>0 AND modo_registro='QUANTITATIVO'))`);
    await q.query(`CREATE OR REPLACE FUNCTION fn_ocorrencias_validar_origem_hu09() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE tipo_entregavel text;
      BEGIN
        SELECT e.tipo::text INTO tipo_entregavel FROM entregaveis e WHERE e.id=NEW.entregavel_id AND e.contrato_id=NEW.contrato_id;
        IF NOT FOUND THEN RAISE EXCEPTION 'Entregável inexistente ou de outro contrato' USING ERRCODE='23503'; END IF;
        IF NEW.meta_marco_origem_id IS NOT NULL AND (tipo_entregavel<>'MARCO' OR NOT EXISTS(SELECT 1 FROM metas_marco mm WHERE mm.id=NEW.meta_marco_origem_id AND mm.contrato_id=NEW.contrato_id AND mm.entregavel_id=NEW.entregavel_id AND mm.tipo='QUANTITATIVA' AND mm.unidade_medida=NEW.unidade_medida_marco)) THEN
          RAISE EXCEPTION 'Medição incompatível com meta do Marco' USING ERRCODE='23514'; END IF;
        IF NEW.origem::text='RECORRENTE' AND tipo_entregavel<>'RECORRENTE' THEN RAISE EXCEPTION 'Ocorrência recorrente incompatível' USING ERRCODE='23514'; END IF;
        IF NEW.origem::text='MANUAL_QUANTITATIVA' AND (NEW.modo_registro<>'QUANTITATIVO' OR (tipo_entregavel<>'QUANTITATIVO' AND NOT(tipo_entregavel='MARCO' AND NEW.meta_marco_origem_id IS NOT NULL))) THEN RAISE EXCEPTION 'Ocorrência quantitativa incompatível' USING ERRCODE='23514'; END IF;
        IF NEW.origem::text='MANUAL_DESCRITIVA' AND (tipo_entregavel IN ('RECORRENTE','QUANTITATIVO') OR NEW.modo_registro<>'DESCRITIVO') THEN RAISE EXCEPTION 'Ocorrência descritiva incompatível' USING ERRCODE='23514'; END IF;
        RETURN NEW;
      END; $$`);
    await q.query(`CREATE TRIGGER trg_marco_origem_quantitativa BEFORE INSERT OR UPDATE OF meta_marco_origem_id,unidade_medida_marco ON ocorrencias FOR EACH ROW EXECUTE FUNCTION fn_ocorrencias_validar_origem_hu09()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM metas_marco) THEN
      RAISE EXCEPTION 'A reversão não pode descartar metas ponderadas existentes.'; END IF; END; $$`);
    await q.query('DROP TRIGGER trg_marco_origem_quantitativa ON ocorrencias');
    await q.query(`CREATE OR REPLACE FUNCTION fn_ocorrencias_validar_origem_hu09() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE tipo_entregavel text; BEGIN
      SELECT e.tipo::text INTO tipo_entregavel FROM entregaveis e WHERE e.id=NEW.entregavel_id AND e.contrato_id=NEW.contrato_id;
      IF NOT FOUND THEN RAISE EXCEPTION 'Entregável inexistente' USING ERRCODE='23503'; END IF;
      IF NEW.origem::text='RECORRENTE' AND tipo_entregavel<>'RECORRENTE' THEN RAISE EXCEPTION 'Ocorrência recorrente incompatível' USING ERRCODE='23514'; END IF;
      IF NEW.origem::text='MANUAL_QUANTITATIVA' AND (tipo_entregavel<>'QUANTITATIVO' OR NEW.modo_registro<>'QUANTITATIVO') THEN RAISE EXCEPTION 'Ocorrência quantitativa incompatível' USING ERRCODE='23514'; END IF;
      IF NEW.origem::text='MANUAL_DESCRITIVA' AND (tipo_entregavel IN ('RECORRENTE','QUANTITATIVO') OR NEW.modo_registro<>'DESCRITIVO') THEN RAISE EXCEPTION 'Ocorrência descritiva incompatível' USING ERRCODE='23514'; END IF; RETURN NEW; END; $$`);
    await q.query(`ALTER TABLE ocorrencias DROP CONSTRAINT ck_ocorrencia_unidade_marco,DROP CONSTRAINT fk_ocorrencia_meta_marco,DROP COLUMN unidade_medida_marco,DROP COLUMN meta_marco_origem_id`);
    await q.query(`ALTER TABLE vinculos_metas_marco DROP CONSTRAINT ck_vinculo_marco_um_registro,DROP COLUMN evidencia_esperada_id,ADD COLUMN comprovante_id uuid,
      ADD CONSTRAINT fk_vinculo_marco_comprovante FOREIGN KEY (comprovante_id,contrato_id) REFERENCES comprovantes_evidencia(id,contrato_id) ON DELETE RESTRICT,
      ADD CONSTRAINT ck_vinculo_marco_um_registro CHECK (num_nonnulls(ocorrencia_id,atividade_id,comprovante_id)=1)`);
    await q.query(`CREATE UNIQUE INDEX uq_vinculo_marco_comprovante_ativo ON vinculos_metas_marco(meta_id,comprovante_id) WHERE comprovante_id IS NOT NULL AND status<>'REJEITADO'`);
    await q.query(`CREATE INDEX idx_b01_marco_comprovante ON vinculos_metas_marco(comprovante_id,contrato_id) WHERE comprovante_id IS NOT NULL`);
    await q.query(`ALTER TABLE metas_marco DROP CONSTRAINT ck_meta_marco_modalidade,
      DROP COLUMN peso_centesimos, DROP COLUMN quantidade_prevista, DROP COLUMN unidade_medida,
      DROP COLUMN criterio_conclusao, DROP COLUMN provas_exigidas, DROP COLUMN estado, DROP COLUMN justificativa_estado,
      ADD COLUMN quantidade_exigida integer NOT NULL CHECK (quantidade_exigida BETWEEN 1 AND 100),
      ADD CONSTRAINT metas_marco_tipo_check CHECK (tipo IN ('OCORRENCIA','ATIVIDADE','EVIDENCIA'))`);
  }
}
