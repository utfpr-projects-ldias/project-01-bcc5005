import type { EntityManager } from 'typeorm';
import { Etapa } from '../etapas/etapa.entity.js';
import { Entregavel } from './entregavel.entity.js';
import { Contrato } from '../contratos/contrato.entity.js';
import { StatusExecucaoEntregavel } from './status-execucao-entregavel.enum.js';
import { StatusEtapa } from '../etapas/status-etapa.enum.js';
import { aptidaoFisicaParaConclusao } from './conclusao-fisica.js';
/**
 * True somente quando cada nível ativo contém pelo menos um filho e cada
 * evidência OBRIGATÓRIA ativa possui versão mais recente verificada.
 * Evidências opcionais jamais bloqueiam o aceite. Sem conclusão por 0/0.
 * Reaberturas explícitas são verificadas separadamente nas entidades.
 */
export async function documentacaoVerificada(m: EntityManager, contratoId: string, etapaId: string | null = null,
  entregavelId: string | null = null): Promise<boolean> {
  const rows = await m.query(`
    SELECT COUNT(DISTINCT et.id)::int AS etapas,
           COUNT(DISTINCT en.id)::int AS entregaveis,
           COUNT(DISTINCT ev.id)::int AS evidencias,
           COUNT(DISTINCT ev.id) FILTER (WHERE v.status = 'VERIFICADA')::int AS verificadas,
           COUNT(DISTINCT et.id) FILTER (WHERE en.id IS NULL)::int AS etapas_sem_entregavel,
           COUNT(DISTINCT en.id) FILTER (WHERE ev.id IS NULL)::int AS entregaveis_sem_evidencia
      FROM etapas et
      LEFT JOIN entregaveis en ON en.etapa_id = et.id AND en.arquivado_em IS NULL
      LEFT JOIN evidencias_esperadas ev ON ev.entregavel_id = en.id AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE
      LEFT JOIN LATERAL (
        SELECT ce.status FROM comprovantes_evidencia ce
          WHERE ce.evidencia_esperada_id = ev.id
          ORDER BY ce.criado_em DESC, ce.id DESC LIMIT 1
      ) v ON TRUE
     WHERE et.contrato_id = $1 AND et.arquivado_em IS NULL
       AND ($2::uuid IS NULL OR et.id = $2::uuid)
       AND ($3::uuid IS NULL OR en.id = $3::uuid)
  `, [contratoId, etapaId, entregavelId]) as Array<Record<string, number | string>>;
  const r = rows[0];
  return !!r && Number(r.etapas) > 0 && Number(r.entregaveis) > 0 && Number(r.evidencias) > 0 &&
    Number(r.verificadas) === Number(r.evidencias) &&
    Number(r.etapas_sem_entregavel) === 0 && Number(r.entregaveis_sem_evidencia) === 0;
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
      SELECT 1 FROM entregaveis en WHERE en.contrato_id = $1
        AND en.arquivado_em IS NULL AND en.reaberto_em IS NOT NULL
        AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
    ) OR EXISTS (
      SELECT 1 FROM evidencias_esperadas ev
        INNER JOIN entregaveis en ON en.id = ev.entregavel_id
        WHERE en.contrato_id = $1 AND en.arquivado_em IS NULL
          AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE AND ev.reaberto_em IS NOT NULL
          AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
    ) AS possui_revisao`, [contratoId, etapaId]) as Array<{ possui_revisao: boolean }>;
  return Boolean(linhas[0]?.possui_revisao);
}


/** Impede concluir a etapa com um entregável ativo ainda em revisão ou não
 * concluído. Também considera evidências explicitamente reabertas, mesmo que
 * a contagem de comprovantes seja 100%. A etapa pai não faz parte do filtro.
 * A consulta roda na MESMA transação da verificação/conclusão. */
export async function filhosPendentesDeConclusao(m: EntityManager, contratoId: string, etapaId: string): Promise<boolean> {
  const linhas = await m.query(`SELECT EXISTS (
    SELECT 1 FROM entregaveis en
     WHERE en.contrato_id = $1 AND en.etapa_id = $2 AND en.arquivado_em IS NULL
       AND (en.reaberto_em IS NOT NULL OR en.status_execucao IS DISTINCT FROM 'CONCLUIDO')
  ) OR EXISTS (
    SELECT 1 FROM evidencias_esperadas ev
      JOIN entregaveis en ON en.id = ev.entregavel_id
     WHERE en.contrato_id = $1 AND en.etapa_id = $2 AND en.arquivado_em IS NULL
       AND ev.arquivado_em IS NULL AND ev.obrigatoria IS TRUE AND ev.reaberto_em IS NOT NULL
  ) OR EXISTS (
    -- Uma atividade não verificada (REGISTRADA ou PENDENTE_CONCLUSAO) vinculada a qualquer entregável desta etapa
    -- impede a conclusão; VERIFICADA e ARQUIVADA (verificada antes) não impedem.
    SELECT 1 FROM atividades at
      JOIN atividade_entregaveis ae ON ae."atividadeId" = at.id
      JOIN entregaveis en ON en.id = ae."entregavelId"
    WHERE at."contratoId" = $1 AND at."excluidaEm" IS NULL
      AND at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO')
      AND en.contrato_id = $1 AND en.etapa_id = $2
  ) AS pendentes`, [contratoId, etapaId]) as Array<{ pendentes: boolean }>;
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
      etapa.reabertoEm || [StatusEtapa.CONCLUIDA, StatusEtapa.ENCERRADA, StatusEtapa.FINALIZADA].includes(etapa.status)) return false;
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
    WHERE at."contratoId" = $1 AND at."excluidaEm" IS NULL
      AND at.status IN ('REGISTRADA', 'PENDENTE_CONCLUSAO') AND en.contrato_id = $1
      AND ($2::uuid IS NULL OR en.etapa_id = $2::uuid)
      AND ($3::uuid IS NULL OR en.id = $3::uuid)
  ) AS pendentes`, [contratoId, etapaId, entregavelId]) as Array<{ pendentes: boolean }>;
  return Boolean(rows[0]?.pendentes);
}

/**
 * Conclusão automática após verificar a última atividade registrada.
 * Mesmas condições da conclusão explícita: documentação verificada, nenhuma
 * evidência reaberta e nenhuma atividade REGISTRADA nesse entregável.
 * Não conclui contratos; registra a mudança no mesmo EntityManager.
 */
export async function concluirEntregavelAposAtividade(
  m: EntityManager, contratoId: string, entregavelId: string,
  auditar: (entregavel: Entregavel, anterior: { statusExecucao: Entregavel['statusExecucao']; reabertoEm: Date | null }) => Promise<void>,
): Promise<Entregavel | null> {
  // Serializar com as operações que cadastram atividades e fecham contratos.
  const contrato = await m.findOne(Contrato, { where: { id: contratoId }, lock: { mode: 'pessimistic_write' } });
  if (!contrato || contrato.arquivadoEm || !['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contrato.status)) return null;
  const repo = m.getRepository(Entregavel);
  const e = await repo.findOneBy({ id: entregavelId, contratoId });
  if (!e || e.arquivadoEm || (e.statusExecucao === StatusExecucaoEntregavel.CONCLUIDO && !e.reabertoEm)) return null;
  const etapa = await m.getRepository(Etapa).findOneBy({ id: e.etapaId, contratoId });
  if (!etapa || etapa.arquivadoEm || etapa.status === StatusEtapa.ENCERRADA ||
      (etapa.status === StatusEtapa.CONCLUIDA && !etapa.reabertoEm)) return null;
  if (!(await aptidaoFisicaParaConclusao(m, e)).apto) return null;
  if (!await documentacaoVerificada(m, contratoId, e.etapaId, entregavelId) ||
      await atividadesPendentesDeVerificacao(m, contratoId, null, entregavelId)) return null;
  const linhas = await m.query(`SELECT EXISTS (
    SELECT 1 FROM evidencias_esperadas
      WHERE entregavel_id = $1 AND arquivado_em IS NULL AND obrigatoria IS TRUE AND reaberto_em IS NOT NULL
  ) AS pendentes`, [entregavelId]) as Array<{ pendentes: boolean }>;
  if (linhas[0]?.pendentes) return null;
  const anterior = { statusExecucao: e.statusExecucao, reabertoEm: e.reabertoEm ?? null };
  e.statusExecucao = StatusExecucaoEntregavel.CONCLUIDO;
  e.reabertoEm = null;
  await repo.save(e);
  await auditar(e, anterior);
  return e;
}
