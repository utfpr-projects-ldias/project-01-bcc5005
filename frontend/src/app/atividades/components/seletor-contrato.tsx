'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';

type OpcaoContrato = { id: string; codigoPublico?: string | number | null; objeto: string };
const normalizar = (valor: string) => valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

/** Combobox local, sem criar chamadas de API por tecla e sem mostrar contratos fora da lista autorizada. */
export function SeletorContrato({ contratos, valor, onChange, carregando = false }: {
  contratos: OpcaoContrato[]; valor: string; onChange: (id: string) => void; carregando?: boolean;
}) {
  const idLista = useId();
  const raiz = useRef<HTMLDivElement>(null);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const [realce, setRealce] = useState(0);
  const selecionado = contratos.find(contrato => contrato.id === valor);
  const legenda = (contrato: OpcaoContrato) => `${contrato.codigoPublico ?? 'Sem código'} — ${contrato.objeto}`;
  const filtrados = contratos.filter(contrato => normalizar(legenda(contrato)).includes(normalizar(busca))).slice(0, 100);
  const escolher = (novoValor: string) => { onChange(novoValor); setAberto(false); setBusca(''); setRealce(0); };
  function teclas(evento: KeyboardEvent<HTMLInputElement>) {
    if (evento.key === 'Escape') { setAberto(false); setBusca(''); return; }
    if (evento.key === 'ArrowDown') {
      evento.preventDefault(); setAberto(true); setRealce(p => Math.min(Math.max(filtrados.length - 1, 0), p + 1));
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault(); setAberto(true); setRealce(p => Math.max(0, p - 1));
    } else if (evento.key === 'Enter' && aberto) {
      evento.preventDefault(); if (filtrados[realce]) escolher(filtrados[realce].id);
    }
  }
  return <div ref={raiz} className="relative min-w-0" onBlur={evento => {
    if (!raiz.current?.contains(evento.relatedTarget as Node | null)) { setAberto(false); setBusca(''); }
  }}>
    <label htmlFor="contrato-atividades" className="block text-xs font-semibold text-foreground/80">Contrato</label>
    <div className="relative mt-1.5">
      <input id="contrato-atividades" type="search" role="combobox" aria-label="Contrato" autoComplete="off"
        aria-controls={idLista} aria-expanded={aberto} aria-autocomplete="list"
        aria-activedescendant={aberto && filtrados[realce] ? `${idLista}-${filtrados[realce].id}` : undefined}
        placeholder={carregando ? 'Carregando contratos...' : 'Selecione um contrato...'}
        disabled={carregando}
        value={aberto ? busca : selecionado ? legenda(selecionado) : ''}
        onFocus={() => { setBusca(''); setAberto(true); setRealce(0); }}
        onClick={() => { setAberto(true); }}
        onChange={e => { setBusca(e.target.value); setAberto(true); setRealce(0); }}
        onKeyDown={teclas}
        className="w-full min-w-0 rounded-lg border border-brand-green/25 bg-background py-2.5 pl-3 pr-9 text-sm text-foreground outline-none transition-colors focus:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/30 disabled:opacity-50" />
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/55"><path d="m6 9 6 6 6-6" /></svg>
    </div>
    {aberto && !carregando && <div id={idLista} role="listbox" aria-label="Contratos disponíveis" className="absolute inset-x-0 top-full z-[45] mt-1 max-h-64 overflow-y-auto rounded-xl border border-brand-green/35 bg-background p-1 shadow-2xl">
      <button role="option" aria-selected={!valor} type="button" onMouseDown={e => e.preventDefault()}
        onClick={() => escolher('')} className="w-full rounded-lg px-3 py-2 text-left text-xs text-foreground/70 hover:bg-brand-green/10">Limpar seleção</button>
      {filtrados.length === 0 ? <p className="px-3 py-4 text-sm text-foreground/65">Nenhum contrato encontrado.</p>
      : filtrados.map((contrato, indice) => <button key={contrato.id} id={`${idLista}-${contrato.id}`} role="option" type="button"
        aria-selected={valor === contrato.id} onMouseEnter={() => setRealce(indice)} onMouseDown={e => e.preventDefault()}
        onClick={() => escolher(contrato.id)} title={legenda(contrato)}
        className={`block w-full min-w-0 rounded-lg px-3 py-2 text-left text-sm transition-colors ${realce === indice || valor === contrato.id ? 'bg-brand-green/15 text-brand-neon' : 'text-foreground hover:bg-brand-green/10'}`}>
        <span className="block truncate">{legenda(contrato)}</span>
      </button>)}
      {contratos.length > 100 && <p className="px-3 py-1 text-xs text-foreground/50">Digite para restringir a pesquisa.</p>}
    </div>}
  </div>;
}
