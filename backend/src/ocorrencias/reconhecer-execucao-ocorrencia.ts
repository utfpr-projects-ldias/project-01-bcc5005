import type { EntityManager } from 'typeorm';
import type { AuditoriaService } from '../auditoria/auditoria.service.js';
import { AcaoAuditoria } from '../auditoria/acao-auditoria.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { Ocorrencia } from './ocorrencia.entity.js';
import { StatusOcorrencia } from './status-ocorrencia.enum.js';
import { resumoMedicao, proximoStatusAutomatico, conclusaoTemporalPermitida } from './medicao-ocorrencia.js';

/** Chamador já bloqueou a raiz. A mesma regra dos lançamentos quantitativos
 * e atividades: reconhecer fatos não aprova a ocorrência por si só. */
export async function reconhecerExecucaoOcorrencia(m:EntityManager,auditoria:AuditoriaService,ator:UsuarioAutenticado,e:Entregavel,id:string) {
  const o=await m.findOne(Ocorrencia,{where:{id,contratoId:e.contratoId,entregavelId:e.id},lock:{mode:'pessimistic_write'}});
  if(!o||o.substituidaEm||![StatusOcorrencia.NAO_INICIADO,StatusOcorrencia.EM_ANDAMENTO,StatusOcorrencia.EM_REVISAO].includes(o.status))return;
  const r=await resumoMedicao(m,o);
  const anterior=o.status;
  const novo=proximoStatusAutomatico(o,r,conclusaoTemporalPermitida(e.tipo,e.terminoPrevisto)) as StatusOcorrencia;
  if(novo===anterior)return;
  o.status=novo;
  await m.save(Ocorrencia,o);
  await auditoria.registrarNaTransacao(m,ator,{acao:AcaoAuditoria.OCORRENCIA_STATUS_ALTERADO,entidadeTipo:'OCORRENCIA',entidadeId:id,
    dadosAnteriores:{status:anterior},dadosPosteriores:{status:novo,quantidadeExecutada:r.quantidadeExecutadaExata??r.quantidadeExecutada,
      motivo:'RECALCULO_EXECUCAO_RECONHECIDA'}});
}
