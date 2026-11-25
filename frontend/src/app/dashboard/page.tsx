'use client';
import { useEffect, useRef, useState } from 'react';
import { ConsultaDashboard } from './components/consulta-dashboard';
import { useConsulta, useRepositorioConsultas } from '@/app/components/provedor-consultas';
import { AreaContratos } from '@/app/contratos/components/area-contratos';
import { dataPlanejada } from '@/lib/entregaveis';
import { formatarPercentualSemAnteciparConclusao } from '@/lib/apresentacao-indicadores';
import { consultarCarteiraDashboard, type FiltroDashboard, type LinhaDashboard } from '@/lib/dashboard';
import { ModalAlertasDashboard, PainelContratoDashboard, type DestinoDashboard } from './components/painel-contrato-dashboard';
import { Avanco, EstadoConsulta, FracaoDocumental, Icone, SituacaoContrato, type IconeDashboard } from './components/elementos-dashboard';
import './dashboard.css';

const indicadores: {filtro:Exclude<FiltroDashboard,'todos'>;titulo:string;icone:IconeDashboard;tom:string}[]=[
  {filtro:'ativos',titulo:'Contratos ativos',icone:'contratos',tom:'azul'},
  {filtro:'planejamento',titulo:'Em planejamento',icone:'planejamento',tom:'neutro'},
  {filtro:'encerramento',titulo:'Vigência a vencer',icone:'prazo',tom:'ambar'},
  {filtro:'atrasados',titulo:'Contratos com atraso',icone:'alerta',tom:'vermelho'},
  {filtro:'concluidos',titulo:'Contratos concluídos',icone:'concluido',tom:'violeta'},
  {filtro:'pendentes',titulo:'Entregáveis pendentes',icone:'pendente',tom:'neutro'},
  {filtro:'proximas',titulo:'Próximas obrigações',icone:'proximas',tom:'ambar'},
];
const inteiro=(n:number)=>n.toLocaleString('pt-BR');
type Selecao={linha:LinhaDashboard;modo:'matriz'|'alertas';foco:HTMLElement};

export default function DashboardPage(){
  const [texto,setTexto]=useState('');
  const [busca,setBusca]=useState('');
  const [filtro,setFiltro]=useState<FiltroDashboard>('todos');
  const [dias,setDias]=useState(30);
  const [pagina,setPagina]=useState(1);
  const [selecionado,setSelecionado]=useState<Selecao|null>(null);
  const gatilhoDetalhe=useRef<HTMLButtonElement|null>(null);
  const cache=useRepositorioConsultas();
  const [previa,setPrevia]=useState<{id:string;foco:HTMLElement;destino:DestinoDashboard}|null>(null);
  const abrirDestino=(id:string,destino:DestinoDashboard,foco:HTMLElement)=>setPrevia({id,foco,destino});
  const abrirContrato=(id:string,foco:HTMLElement)=>abrirDestino(id,{tipo:'CONTRATO',id},foco);
  // O mesmo mecanismo de retenção da carteira contratual. Ao trocar a chave,
  // conserva a geometria e os dados da última resposta, nunca após um erro.
  const q=useConsulta(['dashboard','carteira',busca,filtro,pagina,dias],signal=>consultarCarteiraDashboard(busca,filtro,pagina,dias,signal),{manterDadosNoEscopo:'dashboard:carteira'});
  const d=q.erro?undefined:q.dados;
  const k=d?.indicadores;
  const ocupado=q.carregando||q.atualizando;
  function filtrar(f:FiltroDashboard){setFiltro(f);setPagina(1);setSelecionado(null);setPrevia(null);}
  function limpar(){setTexto('');setBusca('');setDias(30);filtrar('todos');}
  function atualizar(){void q.atualizar().catch(()=>{});}
  useEffect(()=>{
    let ultima=Date.now();
    const atualizarVisivel=()=>{
      if(document.visibilityState==='hidden'||Date.now()-ultima<5000)return;
      ultima=Date.now();
      cache.invalidar(['dashboard']);
    };
    const intervalo=window.setInterval(atualizarVisivel,60_000);
    window.addEventListener('focus',atualizarVisivel);
    document.addEventListener('visibilitychange',atualizarVisivel);
    return ()=>{window.clearInterval(intervalo);window.removeEventListener('focus',atualizarVisivel);document.removeEventListener('visibilitychange',atualizarVisivel);};
  },[cache]);
  function abrir(linha:LinhaDashboard,modo:Selecao['modo'],gatilho:HTMLButtonElement){
    if(ocupado)return;
    gatilhoDetalhe.current=gatilho;
    setSelecionado({linha,modo,foco:gatilho});
  }
  // Não reaproveitar um detalhe cuja autorização foi perdida na carteira.
  const detalhe=selecionado&&d?.linhas.some(l=>l.contrato.id===selecionado.linha.contrato.id)?selecionado:null;
  const previaAutorizada=previa&&d?.linhas.some(l=>l.contrato.id===previa.id)?previa:null;
  useEffect(()=>{
    if(!detalhe&&gatilhoDetalhe.current){
      if(gatilhoDetalhe.current.isConnected)gatilhoDetalhe.current.focus({preventScroll:true});
      gatilhoDetalhe.current=null;
    }
  },[detalhe]);
  const filtrosAtivos=!!(texto||busca||filtro!=='todos'||dias!==30);
  return <AreaContratos titulo="Dashboard"><div className="pi-dashboard" data-pi-dashboard>
    <div inert={Boolean(detalhe||previaAutorizada)||undefined}>
      <header className="db-cabecalho">
        <h2>Visão geral</h2>
        <div className="db-acoes">
          {d&&<time className="db-data" dateTime={d.hoje}>{dataPlanejada(d.hoje)}</time>}
        </div>
      </header>
      <section aria-label="Indicadores da carteira" className="db-metricas" aria-busy={ocupado}>
        {indicadores.map(c=><button key={c.filtro} type="button" aria-pressed={filtro===c.filtro} aria-label={`${c.titulo}: ${k?inteiro(k[c.filtro]):'indisponível'}`} onClick={()=>filtrar(filtro===c.filtro?'todos':c.filtro)} className="db-metrica" data-tom={c.tom}>
          <span className="db-metrica-rotulo">{c.titulo}</span>
          <strong className="db-metrica-valor">{k?inteiro(k[c.filtro]):'—'}</strong>
          <Icone nome={c.icone} classe="db-metrica-icone"/>
        </button>)}
        <div className="db-metrica db-metrica-estatica" data-tom="azul">
          <span className="db-metrica-rotulo">Avanço médio físico</span>
          <Icone nome="progresso" classe="db-metrica-icone"/>
          <strong className="db-metrica-valor">{k?.avanco!=null?formatarPercentualSemAnteciparConclusao(k.avanco,1):'—'}</strong>
          {k?.avanco!=null?<div className="db-media-barra" aria-hidden="true"><i style={{width:`${Math.min(100,Math.max(0,k.avanco))}%`}}/></div>:<span className="db-metrica-nota">{k?'Sem base para cálculo':''}</span>}
        </div>
      </section>
      <section aria-label="Carteira de contratos" className="db-superficie db-carteira">
        <header className="db-secao-cabecalho"><div className="db-titulo-grupo"><h2>Contratos</h2><span className="db-contagem" aria-label="Total de contratos filtrados">{d?inteiro(d.total):'—'}</span></div></header>
        <form className="db-filtros" onSubmit={e=>{e.preventDefault();setBusca(texto.trim());setPagina(1);setSelecionado(null);}}>
          <label className="db-campo db-busca"><span>Buscar por</span><span className="db-input-busca"><Icone nome="buscar"/><input type="search" value={texto} maxLength={120} onChange={e=>setTexto(e.target.value)} placeholder="Número, órgão, código ou objeto"/></span></label>
          <button className="db-botao db-primario" type="submit">Pesquisar</button>
          <label className="db-campo"><span>Situação</span><select value={filtro} onChange={e=>filtrar(e.target.value as FiltroDashboard)}><option value="todos">Todas</option>{indicadores.map(c=><option key={c.filtro} value={c.filtro}>{c.titulo}</option>)}</select></label>
          <label className="db-campo db-prazo"><span>Prazo próximo</span><select value={dias} onChange={e=>{setDias(Number(e.target.value));setPagina(1);setSelecionado(null);}}>{[7,15,30,60,90].map(n=><option key={n} value={n}>{n} dias</option>)}</select></label>
          <button type="button" className="db-botao db-limpar" onClick={limpar} disabled={!filtrosAtivos}>Limpar filtros</button>
        </form>
        <EstadoConsulta ocupado={ocupado} erro={q.erro} repetir={atualizar}/>
        <div className="db-tabela-viewport" aria-busy={ocupado} inert={ocupado||undefined}>
          <table className="db-tabela" aria-label="Carteira de contratos">
            <colgroup><col className="db-col-identidade"/><col className="db-col-vigencia"/><col className="db-col-avanco"/><col className="db-col-doc"/><col className="db-col-proxima"/><col className="db-col-status"/><col className="db-col-alerta"/><col className="db-col-acoes"/></colgroup>
            <thead><tr>{['Contrato / Objeto','Vigência','Execução física','Comprovação','Próxima obrigação','Situação','Alertas','Ações'].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead>
            <tbody>{d?.linhas.map(l=>{const c=l.contrato;return <tr key={c.id}>
              <td><button type="button" className="db-identidade" onClick={e=>abrirContrato(c.id,e.currentTarget)}><strong>{c.numeroContrato}</strong><span title={c.objeto}>{c.objeto}</span></button><span className="db-orgao" title={c.orgaoContratante}>{c.orgaoContratante} · #{c.codigoPublico}</span></td>
              <td><time dateTime={c.terminoVigencia}>{dataPlanejada(c.terminoVigencia)}</time><span className="db-secundario">Início {dataPlanejada(c.inicioVigencia)}</span></td>
              <td><Avanco valor={l.avanco}/></td>
              <td><FracaoDocumental fracao={l.comprovacao}/></td>
              <td>{l.proxima?<><time dateTime={l.proxima.data}>{dataPlanejada(l.proxima.data)}</time><span className="db-secundario db-truncar" title={l.proxima.nome}>{l.proxima.nome}</span></>:<span className="db-muted">—</span>}</td>
              <td><SituacaoContrato contrato={c}/></td>
              <td>{l.totalAlertas?<button type="button" className="db-alerta-contagem" aria-label={`${l.totalAlertas} alertas do contrato ${c.numeroContrato}`} onClick={e=>abrir(l,'alertas',e.currentTarget)}><Icone nome="alerta"/>{l.totalAlertas}</button>:<span className="db-muted">—</span>}</td>
              <td><div className="db-acoes-linha"><button type="button" className="db-icone-botao" title="Ver dashboard do contrato" aria-label={`Ver dashboard de ${c.numeroContrato}`} onClick={e=>abrir(l,'matriz',e.currentTarget)}><Icone nome="direita"/></button><button type="button" className="db-icone-botao" title="Abrir contrato" aria-label={`Abrir contrato ${c.numeroContrato}`} onClick={e=>abrirContrato(c.id,e.currentTarget)}><Icone nome="contratos"/></button></div></td>
            </tr>;})}</tbody>
          </table>
          {!d?.linhas.length&&<div className="db-vazio">{q.erro?'Consulta indisponível':ocupado?'Carregando contratos…':d?.totalCarteira===0&&!busca?'Nenhum contrato disponível na sua carteira.':'Nenhum contrato encontrado.'}</div>}
        </div>
        <footer className="db-paginacao" aria-label="Paginação da carteira">
          <span>{d?`${inteiro(d.total)} de ${inteiro(d.totalCarteira)} contratos`:'—'}</span>
          <div className="db-acoes"><button type="button" className="db-icone-botao" aria-label="Anterior" disabled={ocupado||!d||d.pagina<=1} onClick={()=>d&&setPagina(d.pagina-1)}><Icone nome="esquerda"/></button><span className="db-pagina">{d?`${d.pagina} / ${d.paginas}`:'— / —'}</span><button type="button" className="db-icone-botao" aria-label="Próxima" disabled={ocupado||!d||d.pagina>=d.paginas} onClick={()=>d&&setPagina(d.pagina+1)}><Icone nome="direita"/></button></div>
        </footer>
      </section>
    </div>
    {detalhe?.modo==='matriz'&&<PainelContratoDashboard key={detalhe.linha.contrato.id} resumo={detalhe.linha} dias={dias} foco={detalhe.foco} bloqueado={Boolean(previaAutorizada)} fechar={()=>setSelecionado(null)} abrirDestino={abrirDestino}/>}
    {detalhe?.modo==='alertas'&&<ModalAlertasDashboard key={detalhe.linha.contrato.id} resumo={detalhe.linha} dias={dias} foco={detalhe.foco} bloqueado={Boolean(previaAutorizada)} fechar={()=>setSelecionado(null)} abrirDestino={abrirDestino}/>}
    {previaAutorizada&&<ConsultaDashboard key={`${previaAutorizada.id}:${previaAutorizada.destino.tipo}:${previaAutorizada.destino.id}`} contratoId={previaAutorizada.id} destino={previaAutorizada.destino} foco={previaAutorizada.foco} fechar={()=>{const foco=previaAutorizada.foco;setPrevia(null);cache.invalidar(['dashboard','contrato',previaAutorizada.id]);atualizar();requestAnimationFrame(()=>{if(foco.isConnected)foco.focus({preventScroll:true});});}}/>}
  </div></AreaContratos>;
}
