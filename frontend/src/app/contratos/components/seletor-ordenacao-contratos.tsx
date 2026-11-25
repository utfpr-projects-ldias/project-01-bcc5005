'use client';
import { useCamadaInterativa } from '@/lib/camadas-interativas';
import { useEffect, useId, useRef, useState } from 'react';

export type OrdemContratos = 'inicio-desc' | 'inicio-asc' | 'numero-asc' | 'numero-desc';
const opcoes: ReadonlyArray<{ valor: OrdemContratos; texto: string }> = [
  { valor:'inicio-desc', texto:'Mais recente' },
  { valor:'inicio-asc', texto:'Mais antigo' },
  { valor:'numero-asc', texto:'Número crescente' },
  { valor:'numero-desc', texto:'Número decrescente' },
];
/** Controle de ordenação sem caixa externa, reutilizado em listas operacionais. */
export function SeletorOrdenacao<T extends string>({ valor, onChange, opcoes, rotulo, rotuloLista, alinhamento = "inicio" }: {
  valor: T; onChange: (valor: T) => void; opcoes: ReadonlyArray<{valor:T;texto:string}>; rotulo:string; rotuloLista:string; alinhamento?: "inicio"|"fim";
}) {
  const id = useId();
  const [aberto,setAberto] = useState(false);
  const raiz=useRef<HTMLDivElement>(null);
  const opcoesRef=useRef<Array<HTMLButtonElement|null>>([]);
  useCamadaInterativa(aberto,()=>raiz.current,()=>{setAberto(false);raiz.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();},900);
  useEffect(()=>{
    if(!aberto)return;
    const fora=(evento:PointerEvent)=>{if(evento.target instanceof Node && !raiz.current?.contains(evento.target))setAberto(false);};
    const fechar=()=>setAberto(false);
    document.addEventListener('pointerdown',fora,true);window.addEventListener('pi:fechar-menus',fechar);
    return ()=>{document.removeEventListener('pointerdown',fora,true);window.removeEventListener('pi:fechar-menus',fechar);};
  },[aberto]);
  const atual=opcoes.find(o=>o.valor===valor)??opcoes[0];
  return <div ref={raiz} className="relative min-w-0" data-pi-ordenacao-contratos data-pi-ordenacao>
    <button type="button" aria-haspopup="listbox" aria-expanded={aberto} aria-controls={id}
      aria-label={rotulo} onClick={()=>setAberto(v=>!v)} onKeyDown={evento=>{if(evento.key==='ArrowDown'||evento.key==='ArrowUp'){evento.preventDefault();setAberto(true);requestAnimationFrame(()=>opcoesRef.current[evento.key==='ArrowDown'?0:opcoes.length-1]?.focus());}}}
      className="inline-flex min-h-9 max-w-full items-center gap-2 border-0 bg-transparent px-0 py-1.5 text-left text-sm text-foreground/80 transition hover:text-foreground focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-foreground">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"><path d="M7 4v16m-4-4 4 4 4-4M17 20V4m-4 4 4-4 4 4" /></svg>
      <span className="min-w-0 flex-1 truncate font-medium">{atual.texto}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 shrink-0 opacity-65 transition ${aberto?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {aberto&&<div id={id} role="listbox" aria-label={rotuloLista} className={`absolute ${alinhamento === "fim" ? "right-0" : "left-0"} top-full z-[80] mt-1 min-w-[190px] overflow-hidden rounded-lg border border-current/20 bg-background p-1 shadow-xl`}>
      {opcoes.map((opcao,indice)=><button key={opcao.valor} ref={el=>{opcoesRef.current[indice]=el;}} type="button" role="option" aria-selected={opcao.valor===valor}
        onKeyDown={evento=>{if(evento.key==='ArrowDown'||evento.key==='ArrowUp'){evento.preventDefault();opcoesRef.current[(indice+(evento.key==='ArrowDown'?1:opcoes.length-1))%opcoes.length]?.focus();}else if(evento.key==='Home'){evento.preventDefault();opcoesRef.current[0]?.focus();}else if(evento.key==='End'){evento.preventDefault();opcoesRef.current[opcoes.length-1]?.focus();}}}
        onClick={()=>{onChange(opcao.valor);setAberto(false);raiz.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();}}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current ${opcao.valor===valor?'font-semibold text-foreground':'text-foreground/70'}`}>
        {opcao.texto}{opcao.valor===valor&&<span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}

export function SeletorOrdenacaoContratos({ valor, onChange }: { valor: OrdemContratos; onChange:(valor:OrdemContratos)=>void }) {
  return <SeletorOrdenacao valor={valor} onChange={onChange} opcoes={opcoes} rotulo="Ordenar contratos" rotuloLista="Ordem dos contratos"/>;
}
