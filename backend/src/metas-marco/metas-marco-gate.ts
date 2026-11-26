import { IsNull, type EntityManager } from 'typeorm';
import { MetaMarco, VinculoMetaMarco } from './meta-marco.entity.js';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { medicaoReconhecidaAtual, resumoMedicao } from '../ocorrencias/medicao-ocorrencia.js';
import { atividadeElegivelMeta, ocorrenciaElegivelMeta } from './registro-elegivel-meta.js';
import { milesimos, quantidadeDecimal } from '../common/quantidade-exata.js';
import { consultarArvoreMeta } from './arvore-registros-meta.js';
import { listarExecucoesMeta, somarExecucoesMeta } from './execucao-manual-meta.js';
import { calcularAvancoMeta, resumirPreparacao } from './calculo-metas.js';

export async function projetarMeta(m:EntityManager, meta:MetaMarco) {
  const vinculos=await m.find(VinculoMetaMarco,{where:{metaId:meta.id,contratoId:meta.contratoId,status:'APROVADO'},order:{solicitadoEm:'ASC',id:'ASC'}});
  const arvore=await consultarArvoreMeta(m,meta.contratoId,meta.entregavelId,vinculos);
  const registrosManuais=await listarExecucoesMeta(m,meta);
  const manual=somarExecucoesMeta(registrosManuais);
  let quantidade=manual.aprovada, comprometida=manual.aprovada+manual.reservada, operacionais=0, operacionaisValidos=0, provasObrigatorias=0, provasObrigatoriasValidas=0;
  const hashes=new Set<string>(), hashesObrigatorios=new Set<string>(), ocorrencias=new Set<string>();
  const itens:Array<(typeof arvore)[number]&{desvinculavel:boolean;titulo:string;estadoRegistro:string;entregavelId:string|null;elegivel:boolean;evidenciaEsperadaId?:string|null}>=[];
  let documentacaoOcorrencias=true, vinculoForaDoMarco=false;
  const foraDoMarco=(v:typeof arvore[number])=>{
    vinculoForaDoMarco=true;
    itens.push({...v,desvinculavel:v.direto,titulo:'Registro de outro entregável',estadoRegistro:'FORA_DO_MARCO',entregavelId:null,elegivel:false});
  };
  for(const v of arvore){
    if(v.tipo==='OCORRENCIA'){
      const o=await m.findOneBy(Ocorrencia,{id:v.registroId,contratoId:meta.contratoId});
      if(o&&o.entregavelId!==meta.entregavelId){foraDoMarco(v);continue;}
      const e=o?await m.findOneBy(Entregavel,{id:o.entregavelId,contratoId:meta.contratoId}):null;
      const elegivel=Boolean(o&&e&&!e.arquivadoEm&&await ocorrenciaElegivelMeta(m,o));
      const unidade=o?.unidadeMedidaMarco??e?.unidadeMedida;
      const mesmaUnidade=!!unidade&&unidade.trim().toLocaleLowerCase('pt-BR')===meta.unidadeMedida?.trim().toLocaleLowerCase('pt-BR');
      if(meta.tipo==='QUANTITATIVA'&&o&&e&&o.entregavelId===meta.entregavelId&&o.metaMarcoOrigemId===meta.id&&!e.arquivadoEm&&mesmaUnidade&&o.modoRegistro==='QUANTITATIVO'&&!o.substituidaEm&&!ocorrencias.has(o.id)){
        ocorrencias.add(o.id);const reconhecida=milesimos(await medicaoReconhecidaAtual(m,o));quantidade+=reconhecida;const r=await resumoMedicao(m,o);const registrada=milesimos(r.quantidadeRegistradaExata??r.quantidadeRegistrada);comprometida+=registrada>reconhecida?registrada:reconhecida;
      }
      if(o&&elegivel&&o.status==='CONCLUIDO_PARCIALMENTE')documentacaoOcorrencias=false;
      // A exigência nativa permanece válida mesmo quando não há comprovante ligado ao item.
      if(o&&elegivel&&o.status==='CONCLUIDO'&&(Number(o.minimoEvidenciasVerificadas??0)>0||Number(o.minimoFotos??0)>0||Number(o.minimoRelatorios??0)>0||Number(o.minimoEvidenciasLivres??0)>0||Boolean(o.evidenciaExigida&&o.evidenciaExigida!=='NENHUMA'))&&!(await resumoMedicao(m,o)).documentacaoAtendida)documentacaoOcorrencias=false;
      operacionais++;if(elegivel)operacionaisValidos++;
      const desvinculavel=Boolean(v.direto&&o&&!o.substituidaEm&&e&&!e.arquivadoEm&&['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status));
      itens.push({...v,desvinculavel,tipo:'OCORRENCIA' as const,registroId:v.registroId,titulo:o?.titulo??'Ocorrência indisponível',estadoRegistro:o?.status??'INDISPONIVEL',entregavelId:o?.entregavelId??null,elegivel});
    }else if(v.tipo==='ATIVIDADE'){
      const a=await m.findOne(AtividadeEntity,{where:{id:v.registroId,contratoId:meta.contratoId},relations:{entregaveis:true}});
      if(a&&!a.entregaveis.some(e=>e.id===meta.entregavelId&&e.contratoId===meta.contratoId)){foraDoMarco(v);continue;}
      const elegivel=Boolean(a&&atividadeElegivelMeta(a,meta.contratoId));operacionais++;if(elegivel)operacionaisValidos++;
      itens.push({...v,desvinculavel:Boolean(v.direto&&a&&!a.excluidaEm&&!a.arquivadaEm&&a.status==='REGISTRADA'),tipo:'ATIVIDADE' as const,registroId:v.registroId,titulo:a?.titulo??'Atividade indisponível',estadoRegistro:a?.status??'INDISPONIVEL',entregavelId:null,elegivel});
    }else if(v.tipo==='EVIDENCIA'){
      // O vínculo identifica a evidência esperada através da versão originalmente associada.
      // Só a versão corrente, no mesmo destino e não reaberta, conta como prova.
      const [c]=await m.query(`SELECT ev.id AS esperada, ev.tipo_evidencia AS titulo, ev.obrigatoria, ev.arquivado_em,
        ev.reaberto_em, ev.entregavel_id, e.arquivado_em AS entregavel_arquivado, atual.status, atual.sha256, atual.verificado_em
        FROM evidencias_esperadas ev
        JOIN entregaveis e ON e.id=ev.entregavel_id AND e.contrato_id=$2
        LEFT JOIN LATERAL (SELECT status,sha256,verificado_em FROM comprovantes_evidencia WHERE evidencia_esperada_id=ev.id AND contrato_id=$2 ORDER BY criado_em DESC,id DESC LIMIT 1) atual ON true
        WHERE ev.id=$1`,[v.registroId,meta.contratoId]) as {esperada:string;titulo:string;obrigatoria:boolean;arquivado_em:unknown;reaberto_em:unknown;entregavel_id:string;entregavel_arquivado:unknown;status:string;sha256:string;verificado_em:unknown}[];
      if(c&&c.entregavel_id!==meta.entregavelId){foraDoMarco(v);continue;}
      const elegivel=Boolean(v.versaoVinculadaAtual&&c&&!c.arquivado_em&&!c.entregavel_arquivado&&!c.reaberto_em&&c.status==='VERIFICADA'&&c.verificado_em&&c.sha256);
      if(c?.obrigatoria){provasObrigatorias++;if(elegivel){provasObrigatoriasValidas++;hashesObrigatorios.add(c.sha256);}}
      if(elegivel)hashes.add(c.sha256);
      itens.push({...v,desvinculavel:Boolean(v.direto&&c&&!c.arquivado_em&&!c.entregavel_arquivado&&c.status!=='VERIFICADA'),tipo:'EVIDENCIA' as const,registroId:v.registroId,titulo:c?.titulo??'Evidência indisponível',estadoRegistro:!v.versaoVinculadaAtual?'VERSAO_HISTORICA':c?.arquivado_em?'ARQUIVADA':c?.reaberto_em?'EM_REVISAO':c?.status??(c?'SEM_ENVIO':'INDISPONIVEL'),entregavelId:c?.entregavel_id??null,evidenciaEsperadaId:c?.esperada??null,elegivel});
    }
  }
  const provasPrevistas=Math.max(meta.provasExigidas,provasObrigatorias), provasValidas=Math.min(provasPrevistas,hashesObrigatorios.size+Math.min(Math.max(0,meta.provasExigidas-provasObrigatorias),[...hashes].filter(h=>!hashesObrigatorios.has(h)).length));
  const documental=documentacaoOcorrencias&&hashes.size>=meta.provasExigidas&&provasObrigatoriasValidas===provasObrigatorias&&hashesObrigatorios.size===provasObrigatorias;
  // O critério descritivo é reconhecido pela decisão autorizada, não por um número mínimo de registros.
  const operacaoCompleta=operacionais===operacionaisValidos&&manual.pendentes===0&&(operacionaisValidos>0||hashes.size>0||manual.aprovada>0n);
  const fisico=!vinculoForaDoMarco&&operacaoCompleta&&(meta.tipo==='DESCRITIVA'||quantidade>=milesimos(meta.quantidadePrevista));
  const reconhecida=['CONCLUIDA','CONCLUIDA_PARCIALMENTE','PENDENTE_REGULARIZACAO'].includes(meta.estado)&&fisico;
  const avanco=calcularAvancoMeta(meta.tipo,quantidadeDecimal(quantidade),meta.quantidadePrevista,reconhecida);
  const pronto=meta.estado==='CONCLUIDA'&&fisico&&documental;
  return {...meta,fisicoReconhecido:reconhecida,vinculos:itens,registrosManuais:registrosManuais.map(({pedidoOriginal: _pedido, ...registro})=>{void _pedido;return registro;}),quantidadeComprometida:quantidadeDecimal(comprometida),quantidadeRealizada:quantidadeDecimal(quantidade),percentualPreparacao:avanco,pronto,fisico,documental,provasPrevistas,provasValidas,
    podeIntegral:fisico&&documental,podeParcial:fisico&&!documental};
}
export async function avaliarMetasMarco(m:EntityManager,contratoId:string,entregavelId:string){
  const metas=await m.find(MetaMarco,{where:{contratoId,entregavelId,arquivadoEm:IsNull()},order:{criadoEm:'ASC',id:'ASC'}});
  const itens=await Promise.all(metas.map(meta=>projetarMeta(m,meta)));
  const resumo=resumirPreparacao(itens);
  const fisicoApto=itens.length>0&&resumo.pesoDistribuido===10000&&itens.every(x=>x.fisicoReconhecido&&x.estado!=='PENDENTE_REGULARIZACAO');
  return {...resumo,fisicoApto,metas:itens};
}
