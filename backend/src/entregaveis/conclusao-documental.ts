import type { EntityManager } from 'typeorm';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { StatusEtapa } from '../etapas/status-etapa.enum.js';
/**
 * True somente quando cada nível ativo contém pelo menos um filho e cada
 * evidência OBRIGATÓRIA ativa possui versão mais recente verificada.
 * Evidências opcionais jamais bloqueiam o aceite. Sem filhos não há aceite; sem exigência documental não há pendência.
 * Reaberturas explícitas são verificadas separadamente nas entidades.
 */
export async function documentacaoVerificada(m: EntityManager, contratoId: string, etapaId: string | null = null,
  entregavelId: string | null = null): Promise<boolean> {
  const rows = await m.query(`
    SELECT COUNT(DISTINCT et.id)::int AS etapas,
           COUNT(DISTINCT en.id)::int AS entregaveis,
           COALESCE(SUM(v.obrigatorias+v.ocorrencias_exigidas),0)::int AS evidencias,
           COALESCE(SUM(v.verificadas+v.ocorrencias_atendidas),0)::int AS verificadas,
           COUNT(DISTINCT et.id) FILTER (WHERE en.id IS NULL)::int AS etapas_sem_entregavel
      FROM etapas et
      LEFT JOIN entregaveis en ON en.etapa_id = et.id AND en.contrato_id = et.contrato_id AND en.arquivado_em IS NULL
      LEFT JOIN vw_comprovacao_entregavel_r40 v ON v.entregavel_id=en.id
     WHERE et.contrato_id = $1 AND et.arquivado_em IS NULL
       AND ($2::uuid IS NULL OR et.id = $2::uuid)
       AND ($3::uuid IS NULL OR en.id = $3::uuid)
  `, [contratoId, etapaId, entregavelId]) as Array<Record<string, number | string>>;
  const r = rows[0];
  return !!r && Number(r.etapas) > 0 && Number(r.entregaveis) > 0 &&
    Number(r.verificadas) === Number(r.evidencias) &&
    Number(r.etapas_sem_entregavel) === 0;
}

/** A inexistência de exigências documentais é diferente de uma exigência pendente.
 * Nesse caso a situação da evidência segue SEM_EVIDENCIA, sem inventar um arquivo. */
export async function requisitosDocumentaisObrigatorios(m: EntityManager, entregavelId: string): Promise<number> {
  const linhas = await m.query(`SELECT (obrigatorias+ocorrencias_exigidas)::int AS total FROM vw_comprovacao_entregavel_r40 WHERE entregavel_id=$1`, [entregavelId]) as Array<{ total: number | string }>;
  return Number(linhas[0]?.total ?? 0);
}

/** A comprovação de arquivos não fecha automaticamente um pai cujos filhos
 * aguardam uma nova confirmação explícita. Nenhuma comparação por contador
 * substitui esta consulta transacional de reabertura. */
export async function filhosEmRevisao(m: EntityManager, contratoId: string,
  etapaId: string | null = null): Promise<boolean> {
  const linhas = await m.query(`
    SELECT EXISTS (
      SELECT 1 FROM etapas et WHERE et.contrato_id = $1
        AND et.arquivado_em IS NULL AND et.reaberto_em IS NOT NULL
        AND ($2::uuid IS NULL OR et.id = $2::uuid)
    ) OR EXISTS (
      SELECT 1 FROM entregaveis en JOIN etapas et ON et.id=en.etapa_id AND et.contrato_id=en.contrato_id WHERE en.contrato_id = $1
        AND et.arquivado_em IS NULL AND en.arquivado_em IS NULL AND en.reaberto_em IS NOT NULL
        AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
    ) OR EXISTS (
      SELECT 1 FROM evidencias_esperadas ev
        INNER JOIN entregaveis en ON en.id = ev.entregavel_id
        INNER JOIN etapas et ON et.id=en.etapa_id AND et.contrato_id=en.contrato_id
        WHERE en.contrato_id = $1 AND et.arquivado_em IS NULL AND en.arquivado_em IS NULL
          AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE AND ev.reaberto_em IS NOT NULL
          AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
    ) AS possui_revisao`, [contratoId, etapaId]) as Array<{ possui_revisao: boolean }>;
  return Boolean(linhas[0]?.possui_revisao);
}


/** Impede concluir a etapa com um entregável ativo ainda em revisão ou não
 * concluído. Também considera evidências explicitamente reabertas, mesmo que
 * a contagem de comprovantes seja 100%. A etapa pai não faz parte do filtro.
 * A consulta roda na MESMA transação da verificação/conclusão. */
export async function filhosPendentesDeConclusao(m: EntityManager, contratoId: string, etapaId: string, parcial = false): Promise<boolean> {
  const linhas = await m.query(`SELECT NOT EXISTS (SELECT 1 FROM entregaveis WHERE contrato_id=$1 AND etapa_id=$2 AND arquivado_em IS NULL) OR EXISTS (
    SELECT 1 FROM entregaveis en
     WHERE en.contrato_id = $1 AND en.etapa_id = $2 AND en.arquivado_em IS NULL
       AND (en.reaberto_em IS NOT NULL OR en.regularizacao_documental_solicitada OR (en.status_execucao IS DISTINCT FROM 'CONCLUIDO' AND (NOT $3::boolean OR en.status_execucao IS DISTINCT FROM 'CONCLUIDO_PARCIALMENTE')))
  ) OR EXISTS (
    SELECT 1 FROM evidencias_esperadas ev
      JOIN entregaveis en ON en.id = ev.entregavel_id
     WHERE en.contrato_id = $1 AND en.etapa_id = $2 AND en.arquivado_em IS NULL
       AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE AND ev.reaberto_em IS NOT NULL AND NOT $3::boolean
  ) OR EXISTS (
    -- Uma atividade não verificada (REGISTRADA ou PENDENTE_CONCLUSAO) vinculada a qualquer entregável desta etapa
    -- impede a conclusão; VERIFICADA e ARQUIVADA (verificada antes) não impedem.
    SELECT 1 FROM atividades at
      JOIN atividade_entregaveis ae ON ae."atividadeId" = at.id
      JOIN entregaveis en ON en.id = ae."entregavelId"
    WHERE at."contratoId" = $1 AND at."excluidaEm" IS NULL
      AND at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO')
      AND en.contrato_id = $1 AND en.etapa_id = $2 AND en.arquivado_em IS NULL
  ) AS pendentes`, [contratoId, etapaId, parcial]) as Array<{ pendentes: boolean }>;
  return Boolean(linhas[0]?.pendentes);
}


/** Solicita automaticamente a PRIMEIRA conclusão da etapa quando todos os filhos
 * estiverem elegíveis. NUNCA aprova a própria solicitação, nem reinscreve uma
 * etapa reaberta/em revisão: nestes casos exige solicitação manual explícita.
 * Auditoria e solicitação são gravadas na mesma transação do gatilho. */
export async function concluirEtapaAposFilhos(
  m: EntityManager, contratoId: string, etapaId: string,
  auditar: (antes: { status: StatusEtapa; reabertoEm: Date | null; conclusaoSolicitadaEm: Date | null },
    depois: { status: StatusEtapa; reabertoEm: Date | null; conclusaoSolicitadaEm: Date | null; conclusaoSolicitadaPor: string | null }) => Promise<void>,
  solicitanteId: string | null = null,
): Promise<boolean> {
  const repo = m.getRepository(Etapa);
  const etapa = await repo.findOneBy({ id: etapaId, contratoId });
  if (!etapa || etapa.arquivadoEm || etapa.conclusaoSolicitadaEm || etapa.encerramentoSolicitadoEm ||
      etapa.reabertoEm || [StatusEtapa.CONCLUIDA, StatusEtapa.CONCLUIDO_PARCIALMENTE, StatusEtapa.ENCERRADA, StatusEtapa.FINALIZADA].includes(etapa.status)) return false;
  if (!await documentacaoVerificada(m, contratoId, etapaId) ||
      await filhosPendentesDeConclusao(m, contratoId, etapaId)) return false;
  const antes = { status: etapa.status, reabertoEm: etapa.reabertoEm ?? null,
    conclusaoSolicitadaEm: etapa.conclusaoSolicitadaEm ?? null };
  etapa.conclusaoSolicitadaEm = new Date();
  etapa.conclusaoSolicitadaPor = solicitanteId;
  await repo.save(etapa);
  await auditar(antes, { status: etapa.status, reabertoEm: etapa.reabertoEm ?? null,
    conclusaoSolicitadaEm: etapa.conclusaoSolicitadaEm, conclusaoSolicitadaPor: solicitanteId });
  return true;
}

/** Consulta transacional: sem atividades não há obrigação 0/X. Apenas atividades
 * ainda não verificadas impedem a conclusão; arquivadas já foram verificadas. */
export async function atividadesPendentesDeVerificacao(m: EntityManager, contratoId: string,
  etapaId: string | null = null, entregavelId: string | null = null): Promise<boolean> {
  const rows = await m.query(`SELECT EXISTS (
    SELECT 1 FROM atividades at
      JOIN atividade_entregaveis ae ON ae."atividadeId" = at.id
      JOIN entregaveis en ON en.id = ae."entregavelId"
      JOIN etapas t ON t.id=en.etapa_id AND t.contrato_id=en.contrato_id
    WHERE at."contratoId" = $1 AND at."excluidaEm" IS NULL
      AND at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO') AND en.contrato_id = $1 AND en.arquivado_em IS NULL AND t.arquivado_em IS NULL
      AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
      AND ($3::uuid IS NULL OR en.id = $3::uuid)
  ) AS pendentes`, [contratoId, etapaId, entregavelId]) as Array<{ pendentes: boolean }>;
  return Boolean(rows[0]?.pendentes);
}

/** Compatibilidade de chamada: nunca concluir implicitamente ao verificar uma atividade.
 * A operação explícita no serviço de entregáveis é a única que decide o estado.
 */
export async function concluirEntregavelAposAtividade(
  _m: EntityManager, _contratoId: string, _entregavelId: string,
  _auditar: (entregavel: Entregavel, anterior: { statusExecucao: Entregavel['statusExecucao']; reabertoEm: Date | null }) => Promise<void>,
): Promise<Entregavel | null> { return null; }
