import { IsNull, type EntityManager } from 'typeorm';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { possuiDecisoesDescendentesPendentes } from '../entregaveis/decisoes-descendentes.js';

/** Atividades relacionadas diretamente ou através de qualquer ocorrência vigente.
 * Um vínculo N:N pode existir sem ser a ocorrência principal de medição. */
export async function atividadesPendentesDaEtapa(m: EntityManager, contratoId: string, etapaId: string, somenteDecisoes: boolean): Promise<boolean> {
  const [r] = await m.query(`SELECT EXISTS (
    SELECT 1 FROM atividades a
    WHERE a."contratoId"=$1 AND a."excluidaEm" IS NULL AND a."arquivadaEm" IS NULL
      AND (a.status='PENDENTE_CONCLUSAO' OR (NOT $3::boolean AND a.status='REGISTRADA'))
      AND EXISTS (SELECT 1 FROM entregaveis e
        WHERE e.contrato_id=$1 AND e.etapa_id=$2 AND e.arquivado_em IS NULL
          AND (EXISTS (SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."contratoId"=$1 AND ae."entregavelId"=e.id)
            OR EXISTS (SELECT 1 FROM ocorrencias o WHERE o.contrato_id=$1 AND o.entregavel_id=e.id AND o.substituida_em IS NULL
              AND (a."ocorrenciaId"=o.id OR EXISTS (SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."contratoId"=$1 AND ao."ocorrenciaId"=o.id)))))
  ) AS pendentes`, [contratoId, etapaId, somenteDecisoes]);
  return Boolean(r?.pendentes);
}

/** Reusa as regras de contribuições físicas do entregável; não confunde
 * execução incompleta com uma decisão já submetida à aprovação. */
export async function decisoesDescendentesEtapa(m: EntityManager, contratoId: string, etapaId: string, filhos?: Entregavel[]): Promise<boolean> {
  const ativos = filhos ?? await m.findBy(Entregavel, { contratoId, etapaId, arquivadoEm: IsNull() });
  if (ativos.some(e => e.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''))) return true;
  if (await atividadesPendentesDaEtapa(m, contratoId, etapaId, true)) return true;
  for (const e of ativos) if (await possuiDecisoesDescendentesPendentes(m, e)) return true;
  return false;
}
