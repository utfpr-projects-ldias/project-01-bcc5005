'use client';
import { useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { bloquearRolagemDocumento } from '@/lib/bloqueio-rolagem-modal';
import { useCamadaInterativa } from '@/lib/camadas-interativas';
export type PaginaContrato = 'visao' | 'etapas' | 'atividades' | 'documentos';
const paginas: {id:PaginaContrato;nome:string; desenho:ReactNode}[] = [
  {id:'visao',nome:'Acompanhamento',desenho:<><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></>},
  {id:'etapas',nome:'Etapas',desenho:<path d="M5 4v16M9 6h11M9 12h11M9 18h11"/>},
  {id:'documentos',nome:'Documentos',desenho:<path d="M6 3h8l5 5v13H6zM14 3v6h5M9 14h7m-7 4h7"/>},
];
function Icone({desenho}:{desenho:ReactNode}){return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{desenho}</svg>;}
/** O menu ocupa apenas o viewport central do contrato (iframe), sem alterar o painel global. */
export function NavegacaoContrato({pagina,onPagina,painelGlobalAberto,acoes,children}:{pagina:PaginaContrato;onPagina:(p:PaginaContrato)=>boolean;painelGlobalAberto:boolean;acoes?:ReactNode;children:ReactNode}){
  const [aberto,setAberto]=useState(false);
  const [topo,setTopo]=useState(56);
  const [acento,setAcento]=useState('');
  const id=useId();
  const header=useRef<HTMLElement>(null), toggle=useRef<HTMLButtonElement>(null), painel=useRef<HTMLElement>(null);
  const atual=paginas.find(p=>p.id===pagina)??paginas[0];
  const visivel=aberto&&!painelGlobalAberto;
  function fechar(restaurar=true){setAberto(false);if(restaurar)requestAnimationFrame(()=>toggle.current?.focus({preventScroll:true}));}
  useCamadaInterativa(visivel,()=>painel.current,()=>fechar(),45);
  useEffect(()=>{
    const recolher=()=>setAberto(false);
    window.addEventListener('pi:recolher-navegacao-contrato',recolher);
    return ()=>window.removeEventListener('pi:recolher-navegacao-contrato',recolher);
  },[]);
  useEffect(()=>{if(painelGlobalAberto)setAberto(false);},[painelGlobalAberto]);
  useEffect(()=>{setAberto(false);},[pagina]);
  useEffect(()=>{
    if(!visivel)return;
    const liberar=bloquearRolagemDocumento();
    const medir=()=>{setTopo(Math.max(0,header.current?.getBoundingClientRect().bottom??56));if(header.current)setAcento(getComputedStyle(header.current).getPropertyValue('--pi-texto-proprio').trim());};
    medir(); window.addEventListener('resize',medir);window.addEventListener('scroll',medir,true);
    const quadro=requestAnimationFrame(()=>painel.current?.querySelector<HTMLElement>('[aria-current="page"]')?.focus({preventScroll:true}));
    return ()=>{liberar();cancelAnimationFrame(quadro);window.removeEventListener('resize',medir);window.removeEventListener('scroll',medir,true);};
  },[visivel]);
  function escolher(p:PaginaContrato){if(onPagina(p)){window.dispatchEvent(new Event('pi:recolher-lista-entregaveis'));fechar();}}
  return <div data-pi-workspace-contrato className="min-w-0">
    <header ref={header} className="pi-workspace-cabecalho flex min-w-0 items-center justify-between gap-2 border-b border-slate-500/20 bg-background">
      <nav className="pi-nav-desktop" aria-label="Páginas do contrato">{paginas.map(p=><button type="button" key={p.id} id={`tab-${p.id}`} aria-current={pagina===p.id?'page':undefined} aria-controls={`painel-${p.id}`} onClick={()=>escolher(p.id)}><Icone desenho={p.desenho}/>{p.nome}</button>)}</nav>
      <h2 className="pi-nav-mobile pi-contrato-acento flex min-w-0 items-center gap-2 py-3 text-base font-semibold"><Icone desenho={atual.desenho}/>{atual.nome}</h2>
      <div className="flex shrink-0 items-center gap-1">
        <button ref={toggle} type="button" aria-label={visivel?'Fechar navegação do contrato':'Abrir navegação do contrato'} title={visivel?'Fechar navegação do contrato':'Abrir navegação do contrato'} aria-expanded={visivel} aria-controls={id} disabled={painelGlobalAberto} className="pi-nav-mobile pi-navegacao-toggle inline-flex h-9 w-9 items-center justify-center rounded-lg hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current disabled:opacity-40" onClick={()=>{if(visivel)fechar();else{window.dispatchEvent(new Event('pi:recolher-lista-entregaveis'));window.dispatchEvent(new Event('pi:fechar-menus'));setTopo(Math.max(0,header.current?.getBoundingClientRect().bottom??56));setAberto(true);}}} onKeyDown={e=>{if(visivel&&e.key==='Tab'){e.preventDefault();const itens=painel.current?.querySelectorAll<HTMLButtonElement>('button');(e.shiftKey?itens?.item(itens.length-1):itens?.item(0))?.focus();}}}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M15 4v16M6 9h5M6 13h5"/></svg>
        </button>{acoes}
      </div>
    </header>
    <div className="pi-workspace-conteudo relative min-w-0 py-4" inert={visivel||undefined}>{children}</div>
    {typeof document!=='undefined'&&createPortal(<div data-pi-navegacao-overlay style={{'--pi-nav-top':`${topo}px`,...(acento?{'--pi-texto-proprio':acento}:{})} as CSSProperties}><button type="button" tabIndex={-1} aria-label="Recolher navegação" aria-hidden={!visivel||undefined} data-pi-fundo-navegacao data-aberto={visivel} onClick={()=>fechar()}/>
    <nav ref={painel} id={id} aria-label="Páginas do contrato" aria-hidden={!visivel||undefined} inert={!visivel||undefined} data-pi-navegacao-direita data-pi-painel-temporario={visivel||undefined} data-aberto={visivel} className="pi-navegacao-contextual" onKeyDown={e=>{
      if(e.key==='Tab'){const itens=Array.from(painel.current?.querySelectorAll<HTMLButtonElement>('button')??[]);if((e.shiftKey&&document.activeElement===itens[0])||(!e.shiftKey&&document.activeElement===itens.at(-1))){e.preventDefault();toggle.current?.focus();}return;}
      const i=paginas.findIndex(p=>p.id===(document.activeElement as HTMLElement)?.dataset.pagina);
      const n=e.key==='ArrowDown'?(i+1)%paginas.length:e.key==='ArrowUp'?(i+paginas.length-1)%paginas.length:e.key==='Home'?0:e.key==='End'?paginas.length-1:-1;
      if(n>=0){e.preventDefault();painel.current?.querySelector<HTMLButtonElement>(`[data-pagina="${paginas[n].id}"]`)?.focus();}
    }}>
      <p className="px-3 pb-2 pt-1 text-xs font-medium text-foreground/60">Navegação</p>
      {paginas.map(p=><button key={p.id} data-pagina={p.id} type="button" aria-current={pagina===p.id?'page':undefined} aria-controls={`painel-${p.id}`} onClick={()=>escolher(p.id)} className="pi-pagina-menu flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-current"><Icone desenho={p.desenho}/>{p.nome}</button>)}
    </nav></div>,document.body)}
  </div>;
}
