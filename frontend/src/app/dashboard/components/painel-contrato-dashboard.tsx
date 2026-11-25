'use client';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useState } from 'react';
import { useConsulta } from '@/app/components/provedor-consultas';
import { TabelaMatrizAcompanhamento } from '@/app/contratos/components/matriz-acompanhamento';
import { consultarDetalheDashboard, type AlertaDashboard, type LinhaDashboard, type PrazoDashboard } from '@/lib/dashboard';
import { dataPlanejada } from '@/lib/entregaveis';
import { formatarVigencia } from '@/lib/prazo-vigencia';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';
import { Avanco, EstadoConsulta, FracaoDocumental, Icone, Metrica, SituacaoContrato } from './elementos-dashboard';

export type DestinoDashboard={tipo:'CONTRATO'|'ETAPA'|'ENTREGAVEL'|'OCORRENCIA';id:string};
type AbrirDestino=(contratoId:string,destino:DestinoDashboard,foco:HTMLElement)=>void;
const rotulos={ETAPA:'Etapa',ENTREGAVEL:'Entregável',OCORRENCIA:'Ocorrência',CONTRATO:'Contrato'};
export function AlertasDashboard({contratoId,alertas,abrirDestino}:{contratoId:string;alertas:AlertaDashboard[];abrirDestino:AbrirDestino}){
  const [filtro,setFiltro]=useState<'todos'|'Prioritário'|'Atenção'>('todos');
  const itens=alertas.filter(a=>filtro==='todos'||a.severidade===filtro).sort((a,b)=>Number(b.severidade==='Prioritário')-Number(a.severidade==='Prioritário')||(a.data??'9999').localeCompare(b.data??'9999'));
  return <section aria-label="Alertas" className="db-listagem">
    <div className="db-subfiltros"><label className="db-campo"><span>Prioridade</span><select value={filtro} onChange={e=>setFiltro(e.target.value as typeof filtro)}><option value="todos">Todas</option><option value="Prioritário">Prioritário</option><option value="Atenção">Atenção</option></select></label><span className="db-muted">{itens.length} alertas</span></div>
    {!itens.length?<div className="db-vazio">Nenhum alerta.</div>:<ul className="db-eventos">{itens.map(a=><li key={`${a.tipo}:${a.objeto}:${a.id}`}><span className="db-evento-data">{a.data?<time dateTime={a.data}>{dataPlanejada(a.data)}</time>:'—'}</span><div className="db-evento-texto"><button type="button" onClick={e=>abrirDestino(contratoId,{tipo:a.objeto,id:a.id},e.currentTarget)}>{a.motivo}</button><span>{rotulos[a.objeto]}</span></div><span className="db-etiqueta" data-tom={a.severidade==='Prioritário'?'vermelho':'ambar'}>{a.severidade}</span></li>)}</ul>}
  </section>;
}
/** A carteira contém apenas uma amostra dos alertas; consulta o conjunto completo. */
export function ModalAlertasDashboard({resumo,dias,fechar,abrirDestino,foco,bloqueado=false}:{resumo:LinhaDashboard;dias:number;fechar:()=>void;abrirDestino:AbrirDestino;foco:HTMLElement;bloqueado?:boolean}){
  const id=resumo.contrato.id;
  const q=useConsulta(['dashboard','contrato',id,dias],signal=>consultarDetalheDashboard(id,dias,signal));
  const d=q.erro?undefined:q.dados;
  const ocupado=q.carregando||q.atualizando;
  return createPortal(<div className="pi-dashboard db-modal-shell db-alertas-modal-shell"><ModalEtapa neutro titulo="Alertas" contexto={resumo.contrato.numeroContrato} compacto ocupado={false} focoRetorno={foco} bloqueadoPorSubmodal={bloqueado} rotuloFechar="Fechar alertas" onFechar={fechar}>
    <div className="pi-dashboard db-alertas-modal" aria-busy={ocupado}>
      <EstadoConsulta ocupado={ocupado} erro={q.erro} repetir={()=>void q.atualizar().catch(()=>{})}/>
      {d?<AlertasDashboard contratoId={id} alertas={d.alertas} abrirDestino={abrirDestino}/>:!q.erro?<div className="db-vazio">Carregando alertas…</div>:null}
    </div>
  </ModalEtapa></div>,document.body);
}
function Cronograma({contratoId,prazos,abrirDestino}:{contratoId:string;prazos:PrazoDashboard[];abrirDestino:AbrirDestino}){
  const [filtro,setFiltro]=useState<'abertos'|'todos'|'atrasados'>('abertos');
  const itens=prazos.filter(p=>filtro==='todos'||(filtro==='abertos'?p.aberto:p.atrasado));
  return <section aria-label="Cronograma de obrigações" className="db-listagem"><div className="db-subfiltros"><label className="db-campo"><span>Situação</span><select value={filtro} onChange={e=>setFiltro(e.target.value as typeof filtro)}><option value="abertos">Abertas</option><option value="todos">Todas</option><option value="atrasados">Atrasadas</option></select></label><span className="db-muted">{itens.length} obrigações</span></div>{!itens.length?<div className="db-vazio">Nenhuma obrigação.</div>:<ol className="db-eventos">{itens.map(p=><li key={`${p.tipo}:${p.id}`}><time dateTime={p.data} className="db-evento-data">{dataPlanejada(p.data)}</time><div className="db-evento-texto"><button type="button" onClick={e=>abrirDestino(contratoId,{tipo:p.tipo,id:p.id},e.currentTarget)}>{p.nome}</button><span>{rotulos[p.tipo]}</span></div><span className="db-muted">{p.aberto?'Aberta':'Finalizada'}</span><EtiquetaAtraso atrasado={p.atrasado}/></li>)}</ol>}</section>;
}
export function PainelContratoDashboard({resumo,dias,fechar,abrirDestino,foco,bloqueado=false,abaInicial='matriz'}:{resumo:LinhaDashboard;dias:number;fechar:()=>void;abrirDestino:AbrirDestino;foco:HTMLElement;bloqueado?:boolean;abaInicial?:'matriz'|'alertas'}){
  const id=resumo.contrato.id;
  const q=useConsulta(['dashboard','contrato',id,dias],signal=>consultarDetalheDashboard(id,dias,signal));
  const [aba,setAba]=useState<'matriz'|'cronograma'|'alertas'>(abaInicial);
  const d=q.erro?undefined:q.dados;
  // A linha já autorizada evita um quadro vazio ao abrir o detalhe. Após erro
  // (inclusive 401/403/404), não exibe a projeção anterior.
  const r=q.erro?undefined:d??resumo;
  const ocupado=q.carregando||q.atualizando;
  return createPortal(<div className="pi-dashboard db-modal-shell db-detalhe-modal-shell"><ModalEtapa neutro titulo="Dashboard do contrato" contexto={resumo.contrato.numeroContrato} ocupado={false} focoRetorno={foco} bloqueadoPorSubmodal={bloqueado} rotuloFechar="Fechar dashboard do contrato" onFechar={fechar}><section aria-label="Dashboard individual" className="db-detalhe">
    <header className="db-cabecalho db-detalhe-acoes"><div className="db-acoes"><button type="button" className="db-botao" aria-label="Atualizar contrato" onClick={()=>void q.atualizar().catch(()=>{})}>Atualizar</button>{r&&<button type="button" className="db-botao db-primario" onClick={e=>abrirDestino(id,{tipo:'CONTRATO',id},e.currentTarget)}>Abrir contrato <Icone nome="contratos"/></button>}</div></header>
    {r&&<div className="db-superficie db-detalhe-resumo"><div className="db-detalhe-identidade"><div><span className="db-muted">Contrato · #{r.contrato.codigoPublico}</span><h2>{r.contrato.numeroContrato}</h2><p>{r.contrato.objeto}</p></div><SituacaoContrato contrato={r.contrato}/></div><dl className="db-detalhe-dados"><div><dt>Órgão contratante</dt><dd>{r.contrato.orgaoContratante}</dd></div><div><dt>Vigência</dt><dd>{formatarVigencia(r.contrato.inicioVigencia,r.contrato.terminoVigencia)}{r.ativo&&<span className="db-secundario" data-vencido={r.diasRestantes<0||undefined}>{r.diasRestantes<0?`Vencido há ${-r.diasRestantes} d`:r.diasRestantes===0?'Vence hoje':`${r.diasRestantes} d restantes`}</span>}</dd></div><div><dt>Responsável</dt><dd>{r.responsavel??'—'}</dd></div></dl>
    <div className="db-metricas-detalhe"><Metrica titulo="Execução física"><Avanco valor={r.avanco}/></Metrica><Metrica titulo="Comprovação"><FracaoDocumental fracao={r.comprovacao}/></Metrica><Metrica titulo="Etapas finalizadas">{r.etapas.concluidas}/{r.etapas.total}</Metrica><Metrica titulo="Entregáveis concluídos">{r.entregaveis.concluidos}/{r.entregaveis.total}</Metrica><Metrica titulo="Em andamento">{r.entregaveis.emAndamento}</Metrica><Metrica titulo="Entregáveis atrasados">{r.entregaveis.atrasados}</Metrica><Metrica titulo="Atividades verificadas">{r.atividades.verificadas}/{r.atividades.total}</Metrica><Metrica titulo="Evidências verificadas">{r.evidencias?`${r.evidencias.feitas}/${r.evidencias.total}`:'—'}</Metrica><Metrica titulo="Próxima obrigação">{r.proxima?dataPlanejada(r.proxima.data):'—'}</Metrica></div>{r.configuracaoPendente&&<span className="db-etiqueta" data-tom="ambar">Configuração de pesos pendente</span>}</div>}
    <section className="db-superficie db-detalhe-conteudo" aria-busy={ocupado}>
      <div className="db-abas" role="group" aria-label="Visualizações do dashboard individual">{(['matriz','cronograma','alertas'] as const).map(a=><button type="button" key={a} aria-pressed={aba===a} onClick={()=>setAba(a)}><Icone nome={a==='matriz'?'matriz':a==='cronograma'?'planejamento':'alerta'}/>{a==='matriz'?'Matriz de execução':a==='cronograma'?'Cronograma':'Alertas'}{a==='alertas'&&r&&<span className="db-contagem">{d?.alertas.length??resumo.totalAlertas}</span>}</button>)}</div>
      <EstadoConsulta ocupado={ocupado} erro={q.erro} repetir={()=>void q.atualizar().catch(()=>{})}/>
      <div className="db-detalhe-viewport">{d?aba==='matriz'?<TabelaMatrizAcompanhamento itens={d.matriz} abrir={(eid,foco)=>{if(foco)abrirDestino(id,{tipo:'ENTREGAVEL',id:eid},foco);}}/>:aba==='cronograma'?<Cronograma contratoId={id} prazos={d.prazos} abrirDestino={abrirDestino}/>:<AlertasDashboard contratoId={id} alertas={d.alertas} abrirDestino={abrirDestino}/>:<div className="db-vazio">{q.erro?'Consulta indisponível':'Carregando detalhes…'}</div>}</div>
    </section>
  </section></ModalEtapa></div>,document.body);
}
