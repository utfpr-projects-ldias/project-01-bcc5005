import type { EntityManager } from 'typeorm';
import { IsNull } from 'typeorm';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { StatusExecucaoEntregavel as EstadoEntrega } from '../entregaveis/status-execucao-entregavel.enum.js';
import { Etapa } from '../etapas/etapa.entity.js';
import { StatusEtapa } from '../etapas/status-etapa.enum.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

/** Apenas inicia estados abertos. O chamador já validou a operação e bloqueou o contrato.
 * Não conclui automaticamente, não altera pesos, percentuais ou comprovação. */
export async function iniciarHierarquiaOperacional(m: EntityManager, auditoria: AuditoriaService, ator: UsuarioAutenticado, contratoId:string, entregavelId:string) {
  const e=await m.findOneBy(Entregavel,{id:entregavelId,contratoId});
  if(!e||e.arquivadoEm||!([null,EstadoEntrega.NAO_INICIADO,EstadoEntrega.EM_ANDAMENTO,EstadoEntrega.CONCLUIDO,EstadoEntrega.CONCLUIDO_PARCIALMENTE] as (EstadoEntrega|null)[]).includes(e.statusExecucao??null))return;
  if(!e.statusExecucao||e.statusExecucao===EstadoEntrega.NAO_INICIADO){
    const anterior=e.statusExecucao??null;
    const alterado=await m.update(Entregavel,{id:e.id,contratoId,arquivadoEm:IsNull(),statusExecucao:anterior??IsNull()},{statusExecucao:EstadoEntrega.EM_ANDAMENTO});
    if(alterado.affected)await auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ENTREGAVEL_EXECUCAO_ATUALIZADA,entidadeTipo:'ENTREGAVEL',entidadeId:e.id,dadosAnteriores:{statusExecucao:anterior},dadosPosteriores:{statusExecucao:EstadoEntrega.EM_ANDAMENTO,operacao:'INICIO_POR_EXECUCAO_RECONHECIDA'}});
  }
  if(!e.etapaId)return;
  const etapa=await m.findOneBy(Etapa,{id:e.etapaId,contratoId});
  if(!etapa||etapa.arquivadoEm||etapa.conclusaoSolicitadaEm||etapa.encerramentoSolicitadoEm||etapa.status!==StatusEtapa.PLANEJADA)return;
  const alterada=await m.update(Etapa,{id:etapa.id,contratoId,status:StatusEtapa.PLANEJADA,arquivadoEm:IsNull()},{status:StatusEtapa.EM_ANDAMENTO});
  if(alterada.affected)await auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.ETAPA_STATUS_ALTERADO,entidadeTipo:'ETAPA',entidadeId:etapa.id,dadosAnteriores:{status:StatusEtapa.PLANEJADA},dadosPosteriores:{status:StatusEtapa.EM_ANDAMENTO,entregavelId:e.id,motivo:'INICIO_POR_EXECUCAO_RECONHECIDA'}});
}

/** Projeção de registros anteriores à regularização. Não escreve durante GET. */
export async function entregaveisComInicio(m:EntityManager,contratoId:string,etapaId?:string,entregavelId?:string):Promise<Set<string>> {
  const rows:{id:string}[]=await m.query(`SELECT e.id FROM entregaveis e WHERE e.contrato_id=$1 AND e.arquivado_em IS NULL
    AND ($2::uuid IS NULL OR e.etapa_id=$2) AND ($3::uuid IS NULL OR e.id=$3) AND (
      e.status_execucao IN ('EM_ANDAMENTO','CONCLUIDO','CONCLUIDO_PARCIALMENTE') OR COALESCE(e.percentual_execucao,0)>0 OR COALESCE(e.quantidade_realizada,0)>0 OR e.data_efetiva_marco IS NOT NULL
      OR EXISTS(SELECT 1 FROM ocorrencias o WHERE o.contrato_id=e.contrato_id AND o.entregavel_id=e.id AND o.substituida_em IS NULL AND (o.status IN ('EM_ANDAMENTO','EM_REVISAO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','CONCLUIDO','CONCLUIDO_PARCIALMENTE') OR o.data_realizada IS NOT NULL))
      OR EXISTS(SELECT 1 FROM execucoes_entregavel l WHERE l.contrato_id=e.contrato_id AND l.entregavel_id=e.id AND l.origem='MANUAL' AND l.status='APROVADO')
      OR EXISTS(SELECT 1 FROM execucoes_quantitativas_diretas l WHERE l.contrato_id=e.contrato_id AND l.entregavel_id=e.id AND l.status='APROVADO')
      OR EXISTS(SELECT 1 FROM atividade_entregaveis ae JOIN atividades a ON a.id=ae."atividadeId" AND a."contratoId"=e.contrato_id WHERE ae."entregavelId"=e.id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA')
      OR EXISTS(SELECT 1 FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.entregavel_id=e.id WHERE c.contrato_id=e.contrato_id AND c.entregavel_id=e.id AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)))
    )`,[contratoId,etapaId??null,entregavelId??null]);
  return new Set(rows.map(r=>r.id));
}
