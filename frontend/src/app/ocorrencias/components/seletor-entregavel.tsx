'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

type Item = { id: string; nome: string };
const normalizar = (texto: string) => texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Pesquisa local entre entregáveis já autorizados pela API; não consulta endpoints por tecla. */
export function SeletorEntregavel({ itens, valor, onChange, rotulo = 'Entregável', placeholder = 'Selecione um entregável...', opcaoTodos = false, rotuloTodos = 'Todos os entregáveis' }: {
  itens: Item[]; valor: string; onChange: (id: string) => void;
  rotulo?: string; placeholder?: string; opcaoTodos?: boolean; rotuloTodos?: string;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [realce, setRealce] = useState(0);
  const entrada = useRef<HTMLInputElement>(null);
  const [posicao, setPosicao] = useState<{top: number; left: number; width: number; maxHeight: number} | null>(null);
  useEffect(() => {
    if (!aberto) return;
    const atualizar = () => {
      const caixa = entrada.current?.getBoundingClientRect();
      if (!caixa) return;
      const espacoAbaixo = window.innerHeight - caixa.bottom - 12;
      const acima = espacoAbaixo < 160 && caixa.top > 180;
      setPosicao({ top: acima ? caixa.top - Math.min(224, caixa.top - 12) - 5 : caixa.bottom + 5,
        left: caixa.left, width: caixa.width, maxHeight: Math.max(100, Math.min(224, acima ? caixa.top - 12 : espacoAbaixo)) });
    };
    atualizar();
    window.addEventListener('resize', atualizar);
    window.addEventListener('scroll', atualizar, true);
    return () => { window.removeEventListener('resize', atualizar); window.removeEventListener('scroll', atualizar, true); };
  }, [aberto]);
  const selecionado = itens.find(item => item.id === valor);
  const filtrados = itens.filter(item => normalizar(item.nome).includes(normalizar(busca))).slice(0, 5);
  const escolher = (novo: string) => { onChange(novo); setBusca(''); setRealce(0); setAberto(false); };
  function teclado(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') { setAberto(false); setBusca(''); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setAberto(true); setRealce(v => Math.min(v + 1, filtrados.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setAberto(true); setRealce(v => Math.max(0, v - 1)); }
    if (e.key === 'Enter' && aberto) { e.preventDefault(); const item = filtrados[realce]; if (item) escolher(item.id); }
  }
  return <div ref={ref} className="relative min-w-0" onBlur={e => { if (!ref.current?.contains(e.relatedTarget as Node | null)) { setAberto(false); setBusca(''); } }}>
    <label htmlFor={id} className="block text-xs font-semibold text-foreground/80">{rotulo}</label>
    <div className="relative mt-1.5">
      <input ref={entrada} id={id} type="search" maxLength={120} role="combobox" aria-label={rotulo} aria-autocomplete="list" aria-expanded={aberto} aria-controls={`${id}-lista`} aria-activedescendant={aberto && filtrados[realce] ? `${id}-${filtrados[realce].id}` : undefined} autoComplete="off"
        placeholder={placeholder} value={aberto ? busca : selecionado?.nome ?? ''}
        onFocus={() => { setAberto(true); setBusca(''); setRealce(0); }} onClick={() => setAberto(true)} onKeyDown={teclado}
        onChange={e => { setBusca(e.target.value); setAberto(true); setRealce(0); }}
        className="w-full min-w-0 truncate rounded-lg border border-brand-green/25 bg-background py-2.5 pl-3 pr-9 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25" />
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/65"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    {aberto && posicao && typeof document !== 'undefined' && createPortal(<div id={`${id}-lista`} role="listbox" aria-label={`${rotulo} disponíveis`} style={{position: 'fixed', top: posicao.top, left: posicao.left, width: posicao.width, maxHeight: posicao.maxHeight}} className="z-[240] overflow-y-auto rounded-xl border border-brand-green/35 bg-background p-1 shadow-2xl">
      {opcaoTodos && <button type="button" role="option" aria-selected={!valor} onMouseDown={e => e.preventDefault()} onClick={() => escolher('')} className="block w-full rounded-lg px-3 py-2 text-left text-xs hover:bg-current/10">{rotuloTodos}</button>}
      {filtrados.map((item, index) => <button type="button" role="option" key={item.id} id={`${id}-${item.id}`} aria-selected={item.id === valor} onMouseDown={e => e.preventDefault()} onMouseEnter={() => setRealce(index)} onClick={() => escolher(item.id)} title={item.nome}
        className={`block w-full min-w-0 truncate rounded-lg px-3 py-2 text-left text-sm ${index === realce || item.id === valor ? 'bg-current/10 font-semibold' : 'hover:bg-current/5'}`}>{item.nome}</button>)}
      {filtrados.length === 0 && <p className="px-3 py-3 text-xs text-foreground/70">Nenhum entregável encontrado.</p>}
    </div>, document.body)}
  </div>;
}
