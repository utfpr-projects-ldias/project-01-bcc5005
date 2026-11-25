import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { inicioDiaCivilUtc, proximoDiaCivil } from '../common/data-civil.js';

/** Uma linha por requisito. A situação e o arquivo correspondem à versão atual;
 * o histórico permanece acessível pelo detalhamento autorizado existente. */
export function consultaEvidenciasConsolidadas(contratoId: string, filtros: Record<string,string>) {
  if (Object.values(filtros).some(v=>typeof v!=='string')) throw new BadRequestException('Filtro inválido');
  const page = Number(filtros.page || 1), limit = Number(filtros.limit || 20);
  if (!Number.isInteger(page) || page < 1 || page > 10000 || !Number.isInteger(limit) || limit < 1 || limit > 50)
    throw new BadRequestException('Paginação inválida');
  const parametros: unknown[] = [contratoId];
  const param = (valor: unknown) => { parametros.push(valor); return `$${parametros.length}`; };
  const condicoes = ['e.contrato_id=$1', 'e.arquivado_em IS NULL', ...(filtros.incluirArquivadas==='1'?[]:['ev.arquivado_em IS NULL']), 'et.arquivado_em IS NULL'];
  for (const [campo,coluna] of [['etapaId','e.etapa_id'],['entregavelId','e.id']] as const) {
    if (!filtros[campo]) continue;
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(filtros[campo])) throw new BadRequestException('Vínculo inválido');
    condicoes.push(`${coluna}=${param(filtros[campo])}::uuid`);
  }
  const texto=(campo:string,max=120)=>{const v=filtros[campo];if(v==null)return '';if(typeof v!=='string'||v.length>max)throw new BadRequestException('Filtro de texto inválido');return v.trim();};
  const busca=texto('busca'), tipo=texto('tipo',100), atividade=texto('atividade'), ocorrencia=texto('ocorrencia');
  if (busca) condicoes.push(`strpos(lower(concat_ws(' ',ev.descricao,ev.tipo_evidencia,e.nome,et.nome,ult.nome_original)),lower(${param(busca)}))>0`);
  if (tipo) condicoes.push(`ev.tipo_evidencia=${param(tipo)}`);
  // Projeção pública: reabertura documental e devolução são ambas revisão.
  // O estado persistido continua distinguindo os dois eventos para auditoria.
  const statusAtual = `CASE WHEN ult.id IS NOT NULL AND ev.reaberto_em IS NOT NULL AND ult.status<>'VERIFICADA' THEN 'REJEITADA' ELSE COALESCE(ult.status,'SEM_ENVIO') END`;
  if (filtros.status) {
    if (!['SEM_ENVIO','PENDENTE_VERIFICACAO','VERIFICADA','REJEITADA'].includes(filtros.status)) throw new BadRequestException('Situação inválida');
    condicoes.push(`(${statusAtual})=${param(filtros.status)}`);
  }
  try {
    if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio>filtros.dataFim) throw new RangeError();
    if (filtros.dataInicio) condicoes.push(`ult.criado_em>=${param(inicioDiaCivilUtc(filtros.dataInicio).toISOString())}::timestamptz`);
    if (filtros.dataFim) condicoes.push(`ult.criado_em<${param(inicioDiaCivilUtc(proximoDiaCivil(filtros.dataFim)).toISOString())}::timestamptz`);
  } catch { throw new BadRequestException('Período de envio inválido'); }
  const sqlAtividades=`SELECT a.titulo FROM atividades a WHERE a."contratoId"=e.contrato_id AND a."excluidaEm" IS NULL AND (EXISTS(SELECT 1 FROM atividade_comprovantes ac WHERE ac.atividade_id=a.id AND ac.contrato_id=e.contrato_id AND ac.comprovante_id=ult.id) OR (ult.id IS NULL AND a.id::text=ANY(string_to_array(ev.rascunho_envio->>'atividadesVinculadas',',')) AND EXISTS(SELECT 1 FROM atividade_entregaveis ae WHERE ae."atividadeId"=a.id AND ae."entregavelId"=e.id)))`;
  const sqlOcorrencias=`SELECT o.titulo FROM ocorrencias o WHERE o.contrato_id=e.contrato_id AND (o.id=ult.ocorrencia_quantidade_id OR EXISTS (SELECT 1 FROM ocorrencia_comprovantes oc WHERE oc.contrato_id=e.contrato_id AND oc.comprovante_id=ult.id AND oc.ocorrencia_id=o.id) OR (ult.id IS NULL AND o.entregavel_id=e.id AND o.substituida_em IS NULL AND (o.id::text=ANY(string_to_array(ev.rascunho_envio->>'ocorrenciasVinculadas',',')) OR o.id::text=ev.rascunho_envio->>'ocorrenciaQuantidadeId' OR o.id::text=ev.rascunho_envio->>'ocorrenciaExecucaoId')))`;
  if(atividade)condicoes.push(`EXISTS (${sqlAtividades} AND strpos(lower(a.titulo),lower(${param(atividade)}))>0)`);
  if(ocorrencia)condicoes.push(`EXISTS (${sqlOcorrencias} AND strpos(lower(o.titulo),lower(${param(ocorrencia)}))>0)`);
  const base=`FROM evidencias_esperadas ev JOIN entregaveis e ON e.id=ev.entregavel_id JOIN etapas et ON et.id=e.etapa_id AND et.contrato_id=e.contrato_id
    LEFT JOIN LATERAL (SELECT c.id,c.status,c.nome_original,c.criado_em,c.tamanho,c.ocorrencia_quantidade_id FROM comprovantes_evidencia c
      WHERE c.evidencia_esperada_id=ev.id AND c.contrato_id=e.contrato_id AND c.entregavel_id=e.id ORDER BY c.criado_em DESC,c.id DESC LIMIT 1) ult ON TRUE
    WHERE ${condicoes.join(' AND ')}`;
  const dados=`SELECT ev.id, e.id AS "entregavelId", e.nome AS "entregavel", et.nome AS "etapa", ev.tipo_evidencia AS "tipoEvidencia",ev.descricao,ev.obrigatoria,ev.arquivado_em AS "arquivadoEm",
    (${statusAtual}) AS status,ult.id AS "comprovanteId",ult.nome_original AS "nomeOriginal",ult.criado_em AS "criadoEm",ult.tamanho,
    ARRAY(${sqlAtividades} ORDER BY a.titulo,a.id) AS atividades, ARRAY(${sqlOcorrencias} ORDER BY o.titulo,o.id) AS ocorrencias
    ${base} ORDER BY ult.criado_em DESC NULLS LAST,ev.id LIMIT $${parametros.length+1} OFFSET $${parametros.length+2}`;
  return { page,limit,contagem:`SELECT count(*)::int AS total ${base}`,dados,parametros,paginados:[...parametros,limit,(page-1)*limit] };
}
export async function listarEvidenciasConsolidadas(manager: EntityManager,contratoId:string,filtros:Record<string,string>) {
  const q=consultaEvidenciasConsolidadas(contratoId,filtros);
  const [contagem,data]=await Promise.all([manager.query(q.contagem,q.parametros),manager.query(q.dados,q.paginados)]);
  return {data,meta:{total:Number(contagem[0]?.total??0),page:q.page,limit:q.limit}};
}
