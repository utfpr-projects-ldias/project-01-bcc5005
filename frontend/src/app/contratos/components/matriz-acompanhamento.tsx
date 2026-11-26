'use client';
import { BarraTabela, ComprovacaoTabela } from './tabela-operacional';
import type { MatrizDashboard } from '@/lib/dashboard';
import { useProgresso } from '@/hooks/use-progresso';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { dataPlanejada, ROTULOS_TIPO } from '@/lib/entregaveis';
import { rotuloEstadoEntregavel } from '@/lib/identidade-operacional';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';
const numero = (v:string|number|null|undefined) => {if(v==null)return '—';const texto=String(v);if(!/^\d+(?:\.\d+)?$/.test(texto))return '—';const [inteiro,decimal='']=texto.split('.');const fracao=decimal.replace(/0+$/,'');return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g,'.')+(fracao?`,${fracao}`:'');};
export function MatrizAcompanhamento({contratoId,abrir}:{contratoId:string;abrir:(id:string,origem?:HTMLElement)=>void}){
 const {progresso,loading,erro}=useProgresso(contratoId);
 const entregaveis=useEntregaveis(contratoId);
 const documentos=useResumoDocumentalContrato(contratoId);
 const itens=progresso?.entregaveis??[];
 const porId=new Map((entregaveis.dados??[]).map(e=>[e.id,e]));
 const linhas:MatrizDashboard[]=itens.map(e=>{const item=porId.get(e.entregavelId),doc=documentos.dados?.[e.entregavelId];return {...e,etapa:null,unidadeMedida:item?.unidadeMedida??null,comprovacao:doc?.situacaoComprovacao??null,exigenciasDocumentais:doc?{feitas:doc.exigenciasDocumentaisAtendidas??doc.verificadas,total:doc.exigenciasDocumentaisTotal??doc.obrigatorias}:null};});
 if(loading)return <p role="status">Consultando matriz…</p>;
 if(erro)return <p role="alert">{erro}</p>;
 return <TabelaMatrizAcompanhamento itens={linhas} abrir={abrir}/>;
}
/** Apresentação compartilhada: o dashboard usa a projeção consolidada sem repetir requisições. */
export function TabelaMatrizAcompanhamento({itens,abrir}:{itens:MatrizDashboard[];abrir?:(id:string,origem?:HTMLElement)=>void}){
 return <section aria-label="Matriz de execução" className="space-y-3">
 {!itens.length?<p className="text-sm text-foreground/65">Nenhum entregável considerado na execução.</p>:<div className="pi-tabela-scroll"><table className="pi-tabela-operacional w-full text-left" aria-label="Matriz de execução"><thead><tr>{['Entregável','Previsto','Realizado','Avanço','Comprovação','Execução','Alertas'].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead><tbody>{itens.map(e=>{const un=e.tipo==='QUANTITATIVO'?e.unidadeMedida??'':e.tipo==='RECORRENTE'?'períodos':'';const fracao=e.exigenciasDocumentais;return <tr key={e.entregavelId}><th scope="row" className="min-w-40 text-left">{abrir?<button type="button" className="text-left font-semibold hover:underline" onClick={ev=>abrir(e.entregavelId,ev.currentTarget)}>{e.nome}</button>:<strong>{e.nome}</strong>}<p className="text-xs font-normal text-foreground/65">{e.etapa?`${e.etapa} · `:''}{ROTULOS_TIPO[e.tipo]}</p></th><td>{e.previsto==null?'—':`${numero(e.previsto)} ${un}`}</td><td>{e.realizado==null?'—':`${numero(e.realizado)} ${un}`}</td><td><BarraTabela valor={e.percentualExecucao}/></td><td>{fracao?fracao.total?<ComprovacaoTabela fracao={fracao}/>:<span className="text-xs text-foreground/65">Sem exigências</span>:<span className="text-xs text-foreground/65">Indisponível</span>}</td><td>{rotuloEstadoEntregavel(e.statusEntregavel,false,Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada),false,e.tipo==='CONTINUO'&&Boolean(e.finalizadoComAtraso))}</td><td><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.tipo!=='CONTINUO'&&e.finalizadoComAtraso}/>{!e.atrasado&&(!e.finalizadoComAtraso||e.tipo==='CONTINUO')?'—':null}</td></tr>;})}</tbody></table></div>}
 </section>;
}
export function CronogramaContrato({contratoId,abrir,abrirOcorrencia}:{contratoId:string;abrir:(id:string,origem?:HTMLElement)=>void;abrirOcorrencia:(id:string)=>void}){
 const entregaveis=useEntregaveis(contratoId);const agenda=useOcorrencias(contratoId);
 const itens=[...(entregaveis.dados??[]).filter(e=>!e.arquivadoEm).flatMap(e=>e.terminoPrevisto||e.inicioPrevisto?[{id:e.id,data:e.terminoPrevisto??e.inicioPrevisto!,nome:e.nome,tipo:'Entregável',atrasado:e.atrasado,acao:(el:HTMLElement)=>abrir(e.id,el)}]:[]),...agenda.ocorrencias.filter(o=>!o.substituidaEm).flatMap(o=>o.periodoFim||o.dataPrevista||o.periodoInicio?[{id:o.id,data:o.periodoFim??o.dataPrevista??o.periodoInicio!,nome:o.titulo,tipo:'Ocorrência',atrasado:o.atrasado,acao:()=>abrirOcorrencia(o.id)}]:[])].sort((a,b)=>a.data.localeCompare(b.data)||a.nome.localeCompare(b.nome,'pt-BR'));
 return <section aria-label="Cronograma de obrigações" className="space-y-2">{entregaveis.carregando||agenda.loading?<p role="status">Consultando cronograma…</p>:entregaveis.erro||agenda.erro?<p role="alert">Não foi possível consultar o cronograma.</p>:!itens.length?<p className="text-sm text-foreground/65">Nenhuma obrigação com data prevista.</p>:<ol className="max-h-96 divide-y divide-slate-500/20 overflow-y-auto">{itens.map(e=><li key={`${e.tipo}:${e.id}`} className="flex min-w-0 flex-wrap items-center gap-3 py-2 text-sm"><time className="shrink-0 text-xs tabular-nums text-foreground/65" dateTime={e.data}>{dataPlanejada(e.data)}</time><button type="button" className="min-w-0 flex-1 break-words text-left hover:underline" onClick={ev=>e.acao(ev.currentTarget)}>{e.nome}</button><span className="text-xs text-foreground/65">{e.tipo}</span><EtiquetaAtraso atrasado={e.atrasado}/></li>)}</ol>}</section>;
}
