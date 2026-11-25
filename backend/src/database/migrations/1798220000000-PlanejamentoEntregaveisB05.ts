import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Protege novos planejamentos e alterações de campos relacionados, sem invalidar
 * registros legados em atualizações de status/auditoria. A grade civil e os limites
 * operacionais continuam validados pelo serviço de agenda. */
export class PlanejamentoEntregaveisB051798220000000 implements MigrationInterface {
  name = 'PlanejamentoEntregaveisB051798220000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE FUNCTION validar_planejamento_entregavel_b05() RETURNS trigger LANGUAGE plpgsql AS $$
      DECLARE datas_alteradas boolean; quantidade_alterada boolean; recorrencia_alterada boolean; criterio_alterado boolean;
      BEGIN
        IF TG_OP = 'INSERT' THEN
          datas_alteradas := TRUE; quantidade_alterada := TRUE; recorrencia_alterada := TRUE; criterio_alterado := TRUE;
        ELSE
          datas_alteradas := ROW(NEW.tipo,NEW.inicio_previsto,NEW.termino_previsto) IS DISTINCT FROM ROW(OLD.tipo,OLD.inicio_previsto,OLD.termino_previsto);
          quantidade_alterada := ROW(NEW.tipo,NEW.quantidade_prevista,NEW.unidade_medida) IS DISTINCT FROM ROW(OLD.tipo,OLD.quantidade_prevista,OLD.unidade_medida);
          recorrencia_alterada := ROW(NEW.tipo,NEW.periodicidade,NEW.configuracao_periodicidade,NEW.unidade_medida) IS DISTINCT FROM ROW(OLD.tipo,OLD.periodicidade,OLD.configuracao_periodicidade,OLD.unidade_medida);
          criterio_alterado := ROW(NEW.tipo,NEW.criterio_conclusao) IS DISTINCT FROM ROW(OLD.tipo,OLD.criterio_conclusao);
        END IF;
        IF datas_alteradas AND (NEW.inicio_previsto IS NULL OR (NEW.tipo IN ('CONTINUO','RECORRENTE') AND NEW.termino_previsto IS NULL)) THEN
          RAISE EXCEPTION 'Planejamento exige as datas previstas aplicáveis' USING ERRCODE='23514', CONSTRAINT='ck_b05_planejamento_datas';
        END IF;
        IF quantidade_alterada AND NEW.tipo='QUANTITATIVO' AND (NEW.quantidade_prevista IS NULL OR NEW.quantidade_prevista<=0 OR NULLIF(btrim(NEW.unidade_medida),'') IS NULL) THEN
          RAISE EXCEPTION 'Quantitativo exige meta positiva e unidade' USING ERRCODE='23514', CONSTRAINT='ck_b05_planejamento_quantitativo';
        END IF;
        IF recorrencia_alterada AND NEW.tipo='RECORRENTE' AND (NEW.periodicidade IS NULL OR NEW.configuracao_periodicidade IS NULL OR (NEW.configuracao_periodicidade->>'modoRegistro'='QUANTITATIVO' AND NULLIF(btrim(NEW.unidade_medida),'') IS NULL)) THEN
          RAISE EXCEPTION 'Recorrente exige configuração e unidade quando quantitativo' USING ERRCODE='23514', CONSTRAINT='ck_b05_planejamento_recorrente';
        END IF;
        IF criterio_alterado AND NEW.tipo IN ('MARCO','CONTINUO') AND NULLIF(btrim(NEW.criterio_conclusao),'') IS NULL THEN
          RAISE EXCEPTION 'Marco e contínuo exigem critério textual' USING ERRCODE='23514', CONSTRAINT='ck_b05_planejamento_criterio';
        END IF;
        RETURN NEW;
      END; $$`);
    await q.query(`CREATE TRIGGER trg_planejamento_entregavel_b05 BEFORE INSERT OR UPDATE OF tipo,inicio_previsto,termino_previsto,quantidade_prevista,unidade_medida,periodicidade,configuracao_periodicidade,criterio_conclusao ON entregaveis FOR EACH ROW EXECUTE FUNCTION validar_planejamento_entregavel_b05()`);
  }
  async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TRIGGER trg_planejamento_entregavel_b05 ON entregaveis');
    await q.query('DROP FUNCTION validar_planejamento_entregavel_b05()');
  }
}
