import { milesimos } from '../common/quantidade-exata.js';
import { resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import type { Entregavel } from './entregavel.entity.js';
import type { ComprovanteEvidencia } from './comprovante-evidencia.entity.js';

export type VinculoQuantidade = { quantidadeExecutada?: string | null; ocorrenciaQuantidadeId?: string | null;
  origemQuantidade?: 'NOVA_EXECUCAO' | 'COMPROVACAO' | null; referenciaExecucao?: string | null };

export function normalizarVinculoQuantidade(dto: VinculoQuantidade) {
  const quantidade = dto.quantidadeExecutada ?? null;
  if (quantidade === null) {
    if (dto.ocorrenciaQuantidadeId || dto.origemQuantidade || dto.referenciaExecucao)
      throw new BadRequestException('Informe a quantidade para associar uma execução.');
    return null;
  }
  if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(quantidade) || Number(quantidade) <= 0)
    throw new BadRequestException('Informe quantidade positiva com até três casas decimais.');
  if (!dto.origemQuantidade || !['NOVA_EXECUCAO','COMPROVACAO'].includes(dto.origemQuantidade))
    throw new BadRequestException('Informe se é nova execução ou comprovação de uma existente.');
  const referencia = dto.referenciaExecucao?.trim().normalize('NFKC').toLocaleLowerCase('pt-BR').replace(/\s+/g, ' ') ?? '';
  if (!referencia || referencia.length > 100)
    throw new BadRequestException('Identifique a execução (até 100 caracteres). Use a mesma referência para a mesma execução.');
  return { quantidadeDeclarada: quantidade, ocorrenciaQuantidadeId: dto.ocorrenciaQuantidadeId ?? null,
    origemQuantidade: dto.origemQuantidade, referenciaExecucao: referencia };
}

export type ExecucaoQuantitativa = { ocorrenciaId: string; referencia: string; rotulo: string; quantidade: string };

/** Fontes persistidas e válidas: cada opção identifica uma execução, não um texto livre. */
export async function listarExecucoesQuantitativas(m: EntityManager, contratoId: string, ids: string[]): Promise<ExecucaoQuantitativa[]> {
  if (!ids.length) return [];
  return m.query(`SELECT l.ocorrencia_id AS "ocorrenciaId", 'manual:'||l.id AS referencia,
      'Lançamento '||COALESCE(l.justificativa, left(l.id::text,8)) AS rotulo, l.quantidade::text AS quantidade
    FROM ocorrencia_lancamentos l WHERE l.contrato_id=$1 AND l.ocorrencia_id=ANY($2::uuid[]) AND l.excluido_em IS NULL AND l.status_execucao='APROVADO' AND l.quantidade>0
    UNION ALL
    SELECT o.id, 'atividade:'||a.id, a.titulo,
      COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=o.id THEN a.quantidade_execucao ELSE 0 END)::text
    FROM ocorrencias o JOIN atividades a ON a."contratoId"=o.contrato_id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
    LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=o.id
    WHERE o.contrato_id=$1 AND o.id=ANY($2::uuid[]) AND (a."ocorrenciaId"=o.id OR EXISTS (
      SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=o.id AND ao."contratoId"=$1))
      AND COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=o.id THEN a.quantidade_execucao ELSE 0 END)>0
    UNION ALL
    SELECT c.ocorrencia_quantidade_id, 'evidencia:'||c.id, c.nome_original, c.quantidade_aprovada::text
    FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
    JOIN ocorrencia_comprovantes oc ON oc.comprovante_id=c.id AND oc.ocorrencia_id=c.ocorrencia_quantidade_id AND oc.contrato_id=c.contrato_id
    WHERE c.contrato_id=$1 AND c.ocorrencia_quantidade_id=ANY($2::uuid[]) AND c.origem_quantidade='NOVA_EXECUCAO'
      AND c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND c.quantidade_aprovada>0 AND ev.arquivado_em IS NULL AND ev.reaberto_em IS NULL
      AND NOT EXISTS (SELECT 1 FROM atividade_comprovantes ac JOIN atividades a ON a.id=ac.atividade_id AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'
        LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=c.ocorrencia_quantidade_id
        WHERE ac.comprovante_id=c.id AND ac.contrato_id=c.contrato_id AND a."contratoId"=c.contrato_id
          AND (a."ocorrenciaId"=c.ocorrencia_quantidade_id OR EXISTS (SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=c.ocorrencia_quantidade_id AND ao."contratoId"=c.contrato_id))
          AND COALESCE(am.quantidade,CASE WHEN a."ocorrenciaId"=c.ocorrencia_quantidade_id THEN a.quantidade_execucao ELSE 0 END)>0)
      AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))`, [contratoId, ids]);
}

/** Detalhes da medição, não um segundo motor de avanço contratual. Cada chave identifica uma fonte original. */
export async function listarContribuicoesQuantitativas(m: EntityManager, contratoId: string, ids: string[]) {
  if (!ids.length) return [];
  return m.query(`SELECT l.id, 'MANUAL' AS origem, l.ocorrencia_id AS "ocorrenciaId", 'Registro manual' AS titulo,
      l.quantidade::text AS quantidade, CASE WHEN l.excluido_em IS NOT NULL THEN 'INATIVO' ELSE l.status_execucao END AS situacao, l.data_execucao::text AS "dataExecucao",
      COALESCE(u.nome,u.email,'Usuário') AS "autorNome", COALESCE(l.observacao,l.justificativa) AS observacao,
      NULL::uuid AS "evidenciaId", l.bloqueado_em IS NOT NULL AS bloqueado, NULL::text AS "referenciaExecucao", l.xmin::text AS versao, CASE WHEN l.excluido_em IS NOT NULL THEN 'EXCLUIDO' ELSE NULL END AS "situacaoRegistro"
    FROM ocorrencia_lancamentos l LEFT JOIN usuarios u ON u.id=l.criado_por
    WHERE l.contrato_id=$1 AND l.ocorrencia_id=ANY($2::uuid[])
    UNION ALL
    SELECT a.id, 'ATIVIDADE', o.id, a.titulo,
      COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=o.id THEN a.quantidade_execucao ELSE 0 END)::text,
      CASE WHEN a."excluidaEm" IS NOT NULL OR a.status='ARQUIVADA' THEN 'INATIVO' WHEN a.status='VERIFICADA' THEN 'APROVADO' ELSE 'PENDENTE' END,
      (a."dataHora" AT TIME ZONE 'America/Sao_Paulo')::date::text, a.responsavel, a.observacoes, NULL::uuid, false, am.referencia_execucao, NULL::text, CASE WHEN a."excluidaEm" IS NOT NULL THEN 'EXCLUIDO' WHEN a.status='ARQUIVADA' THEN 'ARQUIVADO' ELSE a.status::text END
    FROM ocorrencias o JOIN atividades a ON a."contratoId"=o.contrato_id
    LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=a.id AND am.ocorrencia_id=o.id
    WHERE o.contrato_id=$1 AND o.id=ANY($2::uuid[]) AND (a."ocorrenciaId"=o.id OR EXISTS (
      SELECT 1 FROM atividade_ocorrencias ao WHERE ao."atividadeId"=a.id AND ao."ocorrenciaId"=o.id AND ao."contratoId"=$1))
      AND (COALESCE(am.quantidade, CASE WHEN a."ocorrenciaId"=o.id THEN a.quantidade_execucao ELSE 0 END)>0 OR am.referencia_execucao IS NOT NULL)
    UNION ALL
    SELECT c.id, 'EVIDENCIA', c.ocorrencia_quantidade_id, c.nome_original,
      CASE WHEN c.status='VERIFICADA' AND ev.reaberto_em IS NULL THEN COALESCE(c.quantidade_aprovada,c.quantidade_declarada) ELSE c.quantidade_declarada END::text,
      CASE WHEN ev.arquivado_em IS NOT NULL OR EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) THEN 'INATIVO' WHEN c.status='REJEITADA' THEN 'REJEITADO' WHEN c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL THEN 'APROVADO' ELSE 'PENDENTE' END,
      (c.criado_em AT TIME ZONE 'America/Sao_Paulo')::date::text, COALESCE(u.nome,u.email,'Usuário'), c.descricao, ev.id, false,
      CASE WHEN c.origem_quantidade='COMPROVACAO' THEN c.referencia_execucao ELSE NULL END, NULL::text, CASE WHEN ev.arquivado_em IS NOT NULL THEN 'ARQUIVADO' WHEN EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) THEN 'SUBSTITUIDO' WHEN ev.reaberto_em IS NOT NULL OR c.status='REJEITADA' THEN 'EM_REVISAO' ELSE c.status::text END
    FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id
    LEFT JOIN usuarios u ON u.id=c.autor_id
    WHERE c.contrato_id=$1 AND c.ocorrencia_quantidade_id=ANY($2::uuid[]) AND c.quantidade_declarada IS NOT NULL
    ORDER BY "dataExecucao" DESC,id`, [contratoId,ids]);
}

export function validarReferenciaComprovacao(fontes: ExecucaoQuantitativa[], ocorrenciaId: string, referencia: string, quantidade: string) {
  const fonte = fontes.find(f => f.ocorrenciaId === ocorrenciaId && f.referencia === referencia);
  if (!fonte || milesimos(quantidade) > milesimos(fonte.quantidade))
    throw new ConflictException('Selecione uma execução válida desta ocorrência; a comprovação não pode exceder a quantidade registrada.');
  return fonte;
}

export async function listarReferenciasDiretas(m: EntityManager, e: Entregavel): Promise<ExecucaoQuantitativa[]> {
  if (e.tipo !== 'QUANTITATIVO' || !e.quantidadeDiretaIntegrada) return [];
  const linhas = await listarQuantidadeDireta(m,e) as {id:string;origem:string;titulo:string;quantidade:string;situacao:string;referenciaExecucao:string|null}[];
  return linhas.filter(l=>l.situacao==='APROVADO'&&!l.referenciaExecucao&&Number(l.quantidade)>0)
    .map(l=>({ocorrenciaId:'',referencia:`${l.origem.toLowerCase()}:${l.id}`,rotulo:l.titulo,quantidade:l.quantidade}));
}

export async function validarOcorrenciaQuantidade(m: EntityManager, e: Entregavel, vinculo: ReturnType<typeof normalizarVinculoQuantidade>) {
  if (!vinculo) return;
  if (!['QUANTITATIVO','RECORRENTE'].includes(e.tipo) || !e.unidadeMedida?.trim())
    throw new ConflictException('Quantidade exige entregável mensurável com unidade de medida.');
  if (!vinculo.ocorrenciaQuantidadeId) {
    if (e.tipo!=='QUANTITATIVO' || !(Number(e.quantidadePrevista)>0) || Number(e.quantidadeRealizada??0)!==0)
      throw new ConflictException('Quantidade direta exige entregável quantitativo com meta, sem quantidade legada nem ocorrência.');
    const existentes=await m.query(`SELECT 1 FROM ocorrencias WHERE contrato_id=$1 AND entregavel_id=$2 AND substituida_em IS NULL LIMIT 1`,[e.contratoId,e.id]);
    if(existentes.length)throw new ConflictException('Registre a quantidade nas ocorrências existentes.');
    if(vinculo.origemQuantidade==='COMPROVACAO') {
      validarReferenciaComprovacao(await listarReferenciasDiretas(m,e),'',vinculo.referenciaExecucao,vinculo.quantidadeDeclarada);
      return;
    }
    if(/^(manual|atividade|evidencia):/.test(vinculo.referenciaExecucao))throw new ConflictException('Utilize uma referência própria da nova execução.');
    return;
  }
  if(e.quantidadeDiretaIntegrada)throw new ConflictException('Este entregável possui medição direta integrada. Não misture com ocorrências.');
  const o = await m.findOneBy(Ocorrencia, { id: vinculo.ocorrenciaQuantidadeId, contratoId: e.contratoId, entregavelId: e.id });
  if (!o || o.substituidaEm || o.modoRegistro !== 'QUANTITATIVO')
    throw new ConflictException('Selecione uma ocorrência quantitativa vigente deste entregável.');
  if (vinculo.origemQuantidade === 'COMPROVACAO') {
    const fontes = await listarExecucoesQuantitativas(m, e.contratoId, [o.id]);
    validarReferenciaComprovacao(fontes, o.id, vinculo.referenciaExecucao, vinculo.quantidadeDeclarada);
  }
  if (vinculo.origemQuantidade === 'NOVA_EXECUCAO' && /^(manual|atividade|evidencia):/.test(vinculo.referenciaExecucao))
    throw new ConflictException('Uma referência de execução existente deve ser cadastrada como comprovação, não como nova execução.');
  if (vinculo.origemQuantidade === 'NOVA_EXECUCAO' && !['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status))
    throw new ConflictException('Reabra a ocorrência antes de incluir uma nova execução física.');
  if (vinculo.origemQuantidade === 'NOVA_EXECUCAO' && e.tipo === 'QUANTITATIVO' && Number(e.quantidadeRealizada ?? 0) !== 0)
    throw new ConflictException('Concilie a quantidade direta antes de registrar nova execução por ocorrência.');
}

/** Uma prova de execução já registrada nunca acrescenta unidades. Duas execuções
 * independentes podem contribuir, mas a mesma referência não pode gerar
 * duas medições no mesmo contrato. O contrato é bloqueado antes desta operação. */
export async function validarContribuicaoEvidencia(m: EntityManager, e: Entregavel, c: ComprovanteEvidencia) {
  const vinculo = normalizarVinculoQuantidade({ quantidadeExecutada: c.quantidadeDeclarada,
    ocorrenciaQuantidadeId: c.ocorrenciaQuantidadeId, origemQuantidade: c.origemQuantidade,
    referenciaExecucao: c.referenciaExecucao });
  await validarOcorrenciaQuantidade(m, e, vinculo);
  if (!vinculo || vinculo.origemQuantidade !== 'NOVA_EXECUCAO') return;
  const duplicada = await m.query(`SELECT 1 FROM comprovantes_evidencia c
    JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
    WHERE c.contrato_id=$1 AND c.id<>$2 AND c.entregavel_id=$3
      AND c.ocorrencia_quantidade_id IS NOT DISTINCT FROM $4::uuid AND c.referencia_execucao=$5
      AND c.status IN ('VERIFICADA','PENDENTE_VERIFICACAO','REJEITADA') AND c.origem_quantidade='NOVA_EXECUCAO' AND c.quantidade_declarada>0
      AND NOT EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))
    LIMIT 1`, [e.contratoId,c.id,e.id,vinculo.ocorrenciaQuantidadeId,vinculo.referenciaExecucao]) as unknown[];
  if (duplicada.length) throw new ConflictException('Execução já registrada por outra evidência. Utilize a opção de comprovação.');
  const vinculada = await m.query(`SELECT 1 FROM atividade_comprovantes ac JOIN atividades a ON a.id=ac.atividade_id AND a."contratoId"=ac.contrato_id AND a."excluidaEm" IS NULL AND a.status<>'ARQUIVADA'
    LEFT JOIN atividade_ocorrencia_medicoes am ON am.atividade_id=ac.atividade_id AND am.ocorrencia_id=$2 AND am.contrato_id=ac.contrato_id
    WHERE ac.comprovante_id=$1 AND (COALESCE(am.quantidade,CASE WHEN a."ocorrenciaId"=$2 THEN a.quantidade_execucao ELSE 0 END)>0 OR ($2::uuid IS NULL AND EXISTS(SELECT 1 FROM atividade_entregavel_medicoes dm WHERE dm.atividade_id=a.id AND dm.contrato_id=ac.contrato_id AND dm.entregavel_id=$3))) LIMIT 1`, [c.id,vinculo.ocorrenciaQuantidadeId,e.id]) as unknown[];
  if (vinculada.length) throw new ConflictException('Este comprovante já está associado à medição de uma atividade.');
  if(vinculo.ocorrenciaQuantidadeId){const o=await m.findOneBy(Ocorrencia,{id:vinculo.ocorrenciaQuantidadeId,contratoId:e.contratoId});if(o)await exigirSaldoQuantidadeOcorrencia(m,o);}
  else await exigirSaldoQuantidadeDireta(m,e);
}

/** A mesma projeção é usada na consulta e no gate de conclusão; só versões atuais contam. */
export async function quantidadeDiretaEvidencias(m: EntityManager,e:Entregavel) {
  if(!e.quantidadeDiretaIntegrada)return null;
  const [r]=await m.query(`SELECT (COALESCE(SUM(c.quantidade_aprovada) FILTER (WHERE c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL),0)+
    (SELECT COALESCE(SUM(md.quantidade),0) FROM execucoes_quantitativas_diretas md WHERE md.contrato_id=$1 AND md.entregavel_id=$2 AND md.status='APROVADO')+
    (SELECT COALESCE(SUM(dm.quantidade),0) FROM atividade_entregavel_medicoes dm JOIN atividades a ON a.id=dm.atividade_id AND a."contratoId"=dm.contrato_id WHERE dm.contrato_id=$1 AND dm.entregavel_id=$2 AND a."excluidaEm" IS NULL AND a.status='VERIFICADA'))::text AS reconhecida,
    (COUNT(*) FILTER (WHERE c.status='PENDENTE_VERIFICACAO')+(SELECT COUNT(*) FROM execucoes_quantitativas_diretas md WHERE md.contrato_id=$1 AND md.entregavel_id=$2 AND md.status='PENDENTE')+(SELECT COUNT(*) FROM atividade_entregavel_medicoes dm JOIN atividades a ON a.id=dm.atividade_id AND a."contratoId"=dm.contrato_id WHERE dm.contrato_id=$1 AND dm.entregavel_id=$2 AND a."excluidaEm" IS NULL AND a.status NOT IN ('VERIFICADA','ARQUIVADA')))::int AS pendentes
    FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id AND ev.arquivado_em IS NULL
    WHERE c.contrato_id=$1 AND c.entregavel_id=$2 AND c.ocorrencia_quantidade_id IS NULL AND c.origem_quantidade='NOVA_EXECUCAO'
      AND NOT EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id))`,[e.contratoId,e.id]);
  return {reconhecida:String(r?.reconhecida??'0'),pendentes:Number(r?.pendentes??0)};
}
export async function listarQuantidadeDireta(m:EntityManager,e:Entregavel) {
  if(!e.quantidadeDiretaIntegrada)return [];
  return m.query(`SELECT c.id,'EVIDENCIA' AS origem,'' AS "ocorrenciaId",c.nome_original AS titulo,
    CASE WHEN c.status='VERIFICADA' AND ev.reaberto_em IS NULL THEN c.quantidade_aprovada ELSE c.quantidade_declarada END::text AS quantidade,
    CASE WHEN ev.arquivado_em IS NOT NULL OR EXISTS(SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) THEN 'INATIVO'
      WHEN c.status='REJEITADA' THEN 'REJEITADO' WHEN c.status='VERIFICADA' AND c.verificado_em IS NOT NULL AND ev.reaberto_em IS NULL THEN 'APROVADO' ELSE 'PENDENTE' END AS situacao,
    (c.criado_em AT TIME ZONE 'America/Sao_Paulo')::date::text AS "dataExecucao",COALESCE(u.email,'Usuário') AS "autorNome",c.descricao AS observacao,ev.id AS "evidenciaId",false AS bloqueado,CASE WHEN c.origem_quantidade='COMPROVACAO' THEN c.referencia_execucao ELSE NULL END AS "referenciaExecucao",NULL::text AS versao, CASE WHEN ev.arquivado_em IS NOT NULL THEN 'ARQUIVADO' WHEN EXISTS (SELECT 1 FROM comprovantes_evidencia n WHERE n.evidencia_esperada_id=c.evidencia_esperada_id AND (n.criado_em,n.id)>(c.criado_em,c.id)) THEN 'SUBSTITUIDO' WHEN ev.reaberto_em IS NOT NULL OR c.status='REJEITADA' THEN 'EM_REVISAO' ELSE c.status::text END AS "situacaoRegistro"
    FROM comprovantes_evidencia c JOIN evidencias_esperadas ev ON ev.id=c.evidencia_esperada_id LEFT JOIN usuarios u ON u.id=c.autor_id
    WHERE c.contrato_id=$1 AND c.entregavel_id=$2 AND c.ocorrencia_quantidade_id IS NULL AND c.origem_quantidade IN ('NOVA_EXECUCAO','COMPROVACAO')
    UNION ALL
    SELECT a.id,'ATIVIDADE','',a.titulo,dm.quantidade::text,
      CASE WHEN a."excluidaEm" IS NOT NULL OR a.status='ARQUIVADA' THEN 'INATIVO' WHEN a.status='VERIFICADA' THEN 'APROVADO' ELSE 'PENDENTE' END,
      (a."dataHora" AT TIME ZONE 'America/Sao_Paulo')::date::text,a.responsavel,a.observacoes,NULL::uuid,false,NULL::text,NULL::text, CASE WHEN a."excluidaEm" IS NOT NULL THEN 'EXCLUIDO' WHEN a.status='ARQUIVADA' THEN 'ARQUIVADO' ELSE a.status::text END
    FROM atividade_entregavel_medicoes dm JOIN atividades a ON a.id=dm.atividade_id AND a."contratoId"=dm.contrato_id
    WHERE dm.contrato_id=$1 AND dm.entregavel_id=$2
    UNION ALL
    SELECT md.id,'MANUAL','','Execução manual',md.quantidade::text,md.status,
      md.data_execucao::text,COALESCE(u.email,'Usuário'),md.observacao,NULL::uuid,false,NULL::text,md.xmin::text,NULL::text
    FROM execucoes_quantitativas_diretas md LEFT JOIN usuarios u ON u.id=md.autor_id
    WHERE md.contrato_id=$1 AND md.entregavel_id=$2 ORDER BY "dataExecucao" DESC`,[e.contratoId,e.id]);
}

/** Validação sob o bloqueio contratual: inclui medições aprovadas e reservadas. */
export async function exigirSaldoQuantidadeOcorrencia(m:EntityManager,o:Ocorrencia){
  if(o.modoRegistro!=='QUANTITATIVO'||o.metaQuantidade==null)return;
  const r=await resumoMedicao(m,o);
  if(milesimos(r.quantidadeRegistradaExata ?? r.quantidadeRegistrada) > milesimos(o.metaQuantidade))throw new ConflictException('A quantidade excede a meta disponível da ocorrência, incluindo registros pendentes.');
}
export async function exigirSaldoQuantidadeDireta(m:EntityManager,e:Entregavel){
  if(e.tipo!=='QUANTITATIVO'||!e.quantidadePrevista)return;
  const linhas=await listarQuantidadeDireta(m,{...e,quantidadeDiretaIntegrada:true} as Entregavel) as {quantidade:string;situacao:string;referenciaExecucao?:string|null}[];
  const total=linhas.filter(l=>!l.referenciaExecucao&&['APROVADO','PENDENTE'].includes(l.situacao)).reduce((n,l)=>n+milesimos(l.quantidade),0n);
  if(total > milesimos(e.quantidadePrevista))throw new ConflictException('A quantidade excede a meta disponível do entregável, incluindo registros pendentes.');
}
