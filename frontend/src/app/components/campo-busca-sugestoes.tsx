'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

/** Popup com sugestões sobreposto: não aumenta o modal nem desmonta o formulário abaixo. */
export function CampoBuscaSugestoes({ valor, onChange, opcoes, rotulo, placeholder = 'Digite para pesquisar...', maximo = 5 }: {
  valor: string; onChange: (valor: string) => void; opcoes: string[]; rotulo: string; placeholder?: string; maximo?: number;
}) {
  const id = useId();
  const campo = useRef<HTMLInputElement>(null);
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  const [posicao, setPosicao] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const normal = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
  const sugestoes = Array.from(new Set(opcoes)).filter(s => normal(s).includes(normal(valor))).slice(0, maximo);
  useEffect(() => {
    if (!aberta) return;
    function posicionar() {
      const r = campo.current?.getBoundingClientRect(); if (!r) return;
      const abaixo = window.innerHeight - r.bottom - 12;
      const emCima = abaixo < 156 && r.top > 200;
      const altura = Math.min(222, Math.max(100, emCima ? r.top - 12 : abaixo));
      setPosicao({ top: emCima ? r.top - altura - 4 : r.bottom + 4, left: r.left, width: r.width, maxHeight: altura });
    }
    posicionar(); window.addEventListener('resize', posicionar); window.addEventListener('scroll', posicionar, true);
    return () => { window.removeEventListener('resize', posicionar); window.removeEventListener('scroll', posicionar, true); };
  }, [aberta]);
  const selecionar = (s: string) => { onChange(s); setAberta(false); setIndice(0); };
  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { e.stopPropagation(); setAberta(false); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberta(true); setIndice(n => Math.min(n + 1, Math.max(0, sugestoes.length - 1))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIndice(n => Math.max(0, n - 1)); }
    if (e.key === 'Enter' && aberta && sugestoes[indice]) { e.preventDefault(); selecionar(sugestoes[indice]); }
  }
  return <div className="min-w-0 flex-1">
    <label htmlFor={id} className="sr-only">{rotulo}</label>
    <div className="relative">
      <input ref={campo} id={id} type="search" role="combobox" aria-autocomplete="list" aria-expanded={aberta} aria-controls={`${id}-opcoes`}
        aria-activedescendant={aberta && sugestoes[indice] ? `${id}-opcao-${indice}` : undefined}
        autoComplete="off" aria-label={rotulo} value={valor} placeholder={placeholder}
        onFocus={() => { setAberta(true); setIndice(0); }} onClick={() => setAberta(true)} onKeyDown={teclado}
        onChange={e => { onChange(e.target.value); setIndice(0); setAberta(true); }}
        onBlur={() => setAberta(false)}
        className="w-full min-w-0 rounded-xl border border-brand-green/30 bg-background px-4 py-3 text-sm text-foreground outline-none focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20" />
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/60"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
    </div>
    {aberta && posicao && typeof document !== 'undefined' && createPortal(<div role="listbox" id={`${id}-opcoes`} aria-label={`Sugestões: ${rotulo}`}
      style={{ position: 'fixed', ...posicao }} className="z-[260] overflow-y-auto rounded-xl border border-brand-green/40 bg-background p-1 shadow-2xl">
      {sugestoes.map((s, i) => <button type="button" role="option" aria-selected={s === valor} id={`${id}-opcao-${i}`} key={`${s}-${i}`}
        onMouseDown={e => e.preventDefault()} onClick={() => selecionar(s)} onMouseEnter={() => setIndice(i)}
        className={`block w-full truncate rounded-lg px-3 py-2 text-left text-sm ${indice === i ? 'bg-brand-green/15 text-foreground' : 'hover:bg-brand-green/10'}`}>{s}</button>)}
      {sugestoes.length === 0 && <p className="px-3 py-2 text-xs text-foreground/65">Nenhuma opção encontrada.</p>}
    </div>, document.body)}
  </div>;
}
