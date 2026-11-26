import { mensagemErroDominioHttp } from './erro-dominio-http';
export type TipoMetaMarco='DESCRITIVA'|'QUANTITATIVA';
export type TipoRegistroMeta='OCORRENCIA'|'ATIVIDADE'|'EVIDENCIA';
export type EstadoMetaMarco='ABERTA'|'PENDENTE_CONCLUSAO'|'PENDENTE_CONCLUSAO_PARCIAL'|'PENDENTE_ENCERRAMENTO'|'PENDENTE_REGULARIZACAO'|'CONCLUIDA'|'CONCLUIDA_PARCIALMENTE'|'ENCERRADA';
export type AcaoMeta='solicitar-conclusao'|'solicitar-conclusao-parcial'|'solicitar-encerramento'|'solicitar-regularizacao'|'aprovar'|'devolver'|'reabrir'|'arquivar'|'reativar';
export type DadosMetaMarco={titulo:string;tipo:TipoMetaMarco;pesoCentesimos:number;criterioConclusao:string;quantidadePrevista:string|null;unidadeMedida:string|null;provasExigidas:number;dataPrevista?:string|null;inicioPrevisto?:string|null;terminoPrevisto?:string|null;observacoes?:string|null};
export type VinculoMeta={id:string;direto:boolean;paiId:string|null;desvinculavel:boolean;tipo:TipoRegistroMeta;registroId:string;titulo:string;estadoRegistro:string;entregavelId:string|null;evidenciaEsperadaId?:string|null;elegivel:boolean};
export type ExecucaoManualMeta={id:string;quantidade:string;data:string;observacao:string|null;status:'PENDENTE'|'APROVADO'|'REJEITADO';motivo:string|null;versao:string};
export type MetaMarco=DadosMetaMarco&{id:string;estado:EstadoMetaMarco;arquivadoEm:string|null;quantidadeRealizada:string;quantidadeComprometida?:string;registrosManuais?:ExecucaoManualMeta[];percentualPreparacao:number;provasPrevistas:number;provasValidas:number;pronto:boolean;fisico:boolean;documental:boolean;podeIntegral:boolean;podeParcial:boolean;justificativaEstado?:string|null;vinculos:VinculoMeta[]};
export type ResumoMetasMarco={entregavelId:string;metas:MetaMarco[];arquivadas:MetaMarco[];total:number;concluidas:number;pesoDistribuido:number;percentualPreparacao:number;execucaoFisica:number;aptoPelasMetas:boolean;fisicoApto?:boolean};
const API=(process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001').replace(/\/$/,'');
const url=(c:string,e:string,caminho='')=>`${API}/contratos/${encodeURIComponent(c)}/entregaveis/${encodeURIComponent(e)}/metas${caminho}`;
async function solicitar<T>(c:string,e:string,caminho='',init?:RequestInit):Promise<T>{
 const r=await fetch(url(c,e,caminho),{credentials:'include',cache:'no-store',...init,headers:{Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}});
 if(!r.ok)throw Object.assign(new Error(await mensagemErroDominioHttp(r,r.status===403?'Sem permissão para esta operação.':'Não foi possível atualizar as metas.')),{status:r.status});
 return await r.json() as T;
}
export const listarMetasMarco=(c:string,e:string,signal?:AbortSignal)=>solicitar<ResumoMetasMarco>(c,e,'',{signal});
export const criarMetaMarco=(c:string,e:string,d:DadosMetaMarco)=>solicitar<MetaMarco>(c,e,'',{method:'POST',body:JSON.stringify(d)});
export const editarMetaMarco=(c:string,e:string,id:string,d:DadosMetaMarco)=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(d)});
export const candidatosMetaMarco=(c:string,e:string,id:string,tipo:TipoRegistroMeta,signal?:AbortSignal)=>solicitar<{id:string;titulo:string}[]>(c,e,`/${encodeURIComponent(id)}/candidatos?tipo=${tipo}`,{signal});
export const vincularMetaMarco=(c:string,e:string,id:string,tipo:TipoRegistroMeta,registroId:string)=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}/vinculos`,{method:'POST',body:JSON.stringify({tipo,registroId})});
export const desvincularMetaMarco=(c:string,e:string,id:string,vinculoId:string)=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}/vinculos/${encodeURIComponent(vinculoId)}`,{method:'DELETE'});
export const transicionarMetaMarco=(c:string,e:string,id:string,acao:AcaoMeta,justificativa='')=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(id)}/${acao==='reabrir'?'reabertura':acao==='arquivar'?'arquivamento':acao==='reativar'?'reativacao':['aprovar','devolver'].includes(acao)?'decisao':'solicitacao'}`,{method:'POST',body:JSON.stringify({acao,justificativa})});

export const criarManualMeta=(c:string,e:string,metaId:string,d:{id:string;valor:string;data:string;observacao?:string})=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(metaId)}/manuais`,{method:'POST',body:JSON.stringify(d)});
export const corrigirManualMeta=(c:string,e:string,metaId:string,id:string,d:{valor:string;data:string;observacao?:string;motivo:string;versaoEsperada:string})=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(metaId)}/manuais/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify(d)});
export const decidirManualMeta=(c:string,e:string,metaId:string,id:string,d:{decisao:'APROVADO'|'REJEITADO';motivo?:string;versaoEsperada:string})=>solicitar<MetaMarco>(c,e,`/${encodeURIComponent(metaId)}/manuais/${encodeURIComponent(id)}/decidir`,{method:'POST',body:JSON.stringify(d)});
