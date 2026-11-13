'use client';
import { useEffect, useRef, useState } from 'react';

export type OrdemContratos = 'inicio-desc' | 'inicio-asc' | 'numero-asc' | 'numero-desc';
const opcoes: ReadonlyArray<{ valor: OrdemContratos; texto: string }> = [
  { valor:'inicio-desc', texto:'Mais recente' },
  { valor:'inicio-asc', texto:'Mais antigo' },
  { valor:'numero-asc', texto:'Número crescente' },
  { valor:'numero-desc', texto:'Número decrescente' },
];
/** Dropdown customizado: lista acessível e sem estilo nativo do select HTML. */
export function SeletorOrdenacaoContratos({ valor, onChange }: {
  valor: OrdemContratos; onChange: (valor: OrdemContratos) => void;
}) {
  const [aberto,setAberto] = useState(false);
  const raiz=useRef<HTMLDivElement>(null);
  const opcoesRef=useRef<Array<HTMLButtonElement|null>>([]);
  useEffect(()=>{
    if(!aberto)return;
    const fora=(evento:PointerEvent)=>{if(evento.target instanceof Node && !raiz.current?.contains(evento.target))setAberto(false);};
    const teclado=(evento:KeyboardEvent)=>{if(evento.key==='Escape'){evento.stopPropagation();setAberto(false);raiz.current?.querySelector<HTMLButtonElement>('[aria-haspopup]')?.focus();}};
    document.addEventListener('pointerdown',fora);document.addEventListener('keydown',teclado);
    return ()=>{document.removeEventListener('pointerdown',fora);document.removeEventListener('keydown',teclado);};
  },[aberto]);
  const atual=opcoes.find(o=>o.valor===valor)??opcoes[0];
  return <div ref={raiz} className="relative min-w-0" data-pi-ordenacao-contratos>
    <button type="button" aria-haspopup="listbox" aria-expanded={aberto} aria-controls="opcoes-ordem-contratos"
      aria-label="Ordenar contratos" onClick={()=>setAberto(v=>!v)}
      className="inline-flex min-h-9 max-w-full items-center gap-2 border-0 bg-transparent underline decoration-current/45 underline-offset-4 px-0 py-1.5 text-left text-sm text-foreground/80 transition hover:text-foreground hover:decoration-current/75 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-foreground">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4 shrink-0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round"><path d="M4 6h16M4 11h12M4 16h8" /></svg>
      <span className="min-w-0 flex-1 truncate font-medium">{atual.texto}</span>
      <svg viewBox="0 0 24 24" aria-hidden="true" className={`h-4 w-4 shrink-0 opacity-65 transition ${aberto?'rotate-180':''}`} fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m6 9 6 6 6-6"/></svg>
    </button>
    {aberto&&<div id="opcoes-ordem-contratos" role="listbox" aria-label="Ordem dos contratos" className="absolute left-0 top-full z-[80] mt-1 min-w-[190px] overflow-hidden rounded-lg border border-current/20 bg-background p-1 shadow-xl">
      {opcoes.map((opcao,indice)=><button key={opcao.valor} ref={el=>{opcoesRef.current[indice]=el;}} type="button" role="option" aria-selected={opcao.valor===valor}
        onKeyDown={evento=>{if(evento.key==='ArrowDown'||evento.key==='ArrowUp'){evento.preventDefault();opcoesRef.current[(indice+(evento.key==='ArrowDown'?1:opcoes.length-1))%opcoes.length]?.focus();}else if(evento.key==='Home'){evento.preventDefault();opcoesRef.current[0]?.focus();}else if(evento.key==='End'){evento.preventDefault();opcoesRef.current[opcoes.length-1]?.focus();}}}
        onClick={()=>{onChange(opcao.valor);setAberto(false);}}
        className={`flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-xs transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current ${opcao.valor===valor?'font-semibold text-foreground':'text-foreground/70'}`}>
        {opcao.texto}{opcao.valor===valor&&<span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>;
}
