import type { EntityManager } from 'typeorm';
import type { Entregavel } from '../entregaveis/entregavel.entity.js';
import type { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { hojeCivil } from '../common/data-civil.js';
import { medicaoAprovadaAtual } from '../ocorrencias/medicao-ocorrencia.js';
import { resumirAcompanhamento,type RegistroContinuo } from './acompanhamento-continuo.js';
export async function resumoContinuo(m:EntityManager,e:Entregavel,ocorrencias:Ocorrencia[],hoje=hojeCivil()){
 // A ocorrência não possui createdAt: usar a trilha real de criação e os lançamentos ativos.
 // Nenhuma data de aprovação/encerramento é usada como data de envio.
 const ids=ocorrencias.filter(o=>!o.substituidaEm).map(o=>o.id);
 const envios=ids.length?await m.query(`SELECT id,MAX(envio)::text AS envio FROM (
 SELECT a.entidade_id AS id,(a.registrado_em AT TIME ZONE 'America/Sao_Paulo')::date AS envio FROM eventos_auditoria a WHERE a.entidade_tipo='OCORRENCIA' AND a.entidade_id=ANY($1::uuid[]::text[]) AND (a.contrato_id=$2 OR a.contrato_id IS NULL) AND (a.acao='OCORRENCIA_CRIADA' OR (a.acao='OCORRENCIA_EDITADA' AND ((a.dados_posteriores->>'dataRealizada' IS NOT NULL AND a.dados_posteriores->>'dataRealizada' IS DISTINCT FROM a.dados_anteriores->>'dataRealizada') OR (a.dados_posteriores->>'quantidadeRealizada' IS NOT NULL AND a.dados_posteriores->>'quantidadeRealizada' IS DISTINCT FROM a.dados_anteriores->>'quantidadeRealizada'))))
 UNION ALL SELECT l.ocorrencia_id::text,(l.criado_em AT TIME ZONE 'America/Sao_Paulo')::date FROM ocorrencia_lancamentos l WHERE l.contrato_id=$2 AND l.ocorrencia_id=ANY($1::uuid[]) AND l.excluido_em IS NULL AND l.status_execucao<>'REJEITADO'
 UNION ALL SELECT x.ocorrencia_id::text,(x.criado_em AT TIME ZONE 'America/Sao_Paulo')::date FROM execucoes_entregavel x WHERE x.contrato_id=$2 AND x.entregavel_id=$3 AND x.ocorrencia_id=ANY($1::uuid[]) AND x.origem='MANUAL' AND x.status<>'REJEITADO'
 ) envios GROUP BY id`,[ids,e.contratoId,e.id]) as {id:string;envio:string}[]:[];
 const porOcorrencia=new Map(envios.map(r=>[r.id,r.envio]));
 const registros:RegistroContinuo[]=await Promise.all(ocorrencias.filter(o=>!o.substituidaEm).map(async o=>{
  const data=o.dataPrevista??o.periodoFim??o.periodoInicio??'';
  const encerrada=['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status);
  return {id:o.id,tipo:'OCORRENCIA' as const,data,status:o.status,apto:encerrada&&(await medicaoAprovadaAtual(m,o)).apta,enviadoEm:porOcorrencia.get(o.id)??null};
 }));
 const atividades=await m.query(`SELECT DISTINCT a.id,to_char(a."dataHora" AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS data,a.status,to_char(COALESCE((SELECT MIN(ev.registrado_em) FROM eventos_auditoria ev WHERE ev.entidade_tipo='ATIVIDADE' AND ev.entidade_id=a.id::text AND ev.acao='ATIVIDADE_CRIADA' AND (ev.contrato_id=a."contratoId" OR ev.contrato_id IS NULL)),a."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS "enviadoEm" FROM atividades a JOIN atividade_entregaveis ae ON ae."atividadeId"=a.id AND ae."contratoId"=a."contratoId" WHERE a."contratoId"=$1 AND ae."entregavelId"=$2 AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'`,[e.contratoId,e.id]) as {id:string;data:string;status:string;enviadoEm:string|null}[];
 registros.push(...atividades.map(a=>({...a,tipo:'ATIVIDADE' as const,apto:a.status==='VERIFICADA'})));
 // Requisitos gerais referem-se à vigência inteira; são exibidos no último dia, sem representar execução física.
 const evidencias=await m.query(`SELECT ev.id,COALESCE(ev.data_acompanhamento,$3::date)::text AS data,CASE WHEN ev.reaberto_em IS NOT NULL THEN 'REJEITADA' ELSE COALESCE(c.status,'SEM_ENVIO') END AS status,to_char(c.criado_em AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS "enviadoEm" FROM evidencias_esperadas ev LEFT JOIN LATERAL (SELECT status,id,criado_em FROM comprovantes_evidencia WHERE evidencia_esperada_id=ev.id AND contrato_id=$1 AND entregavel_id=$2 ORDER BY criado_em DESC,id DESC LIMIT 1) c ON TRUE WHERE ev.entregavel_id=$2 AND ev.arquivado_em IS NULL`,[e.contratoId,e.id,e.terminoPrevisto]) as {id:string;data:string;status:string;enviadoEm:string|null}[];
 registros.push(...evidencias.map(v=>({...v,tipo:'EVIDENCIA' as const,apto:v.status==='VERIFICADA'})));
 return resumirAcompanhamento(e.inicioPrevisto,e.terminoPrevisto,registros,hoje,e.statusExecucao??null,e.percentualExecucao==null?null:Number(e.percentualExecucao),e.frequenciaAcompanhamento??'DIARIA');
}
