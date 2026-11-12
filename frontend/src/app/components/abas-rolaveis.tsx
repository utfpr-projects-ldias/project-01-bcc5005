'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/** Aba horizontal com navegação por grupos; nunca quebra nem corta definitivamente os itens.
 * A rolagem por toque/trackpad continua disponível e as setas são controles acessíveis. */
export function AbasRolaveis({ children, className = '' }: { children: ReactNode; className?: string }) {
  const faixa = useRef<HTMLDivElement>(null);
  const [posicao, setPosicao] = useState({ total: 1, atual: 0 });
  const atualizar = useCallback(() => {
    const elemento = faixa.current;
    if (!elemento) return;
    const largura = elemento.clientWidth;
    const max = Math.max(0, elemento.scrollWidth - largura);
    const total = largura > 0 && max > 4 ? Math.max(2, Math.ceil(elemento.scrollWidth / largura)) : 1;
    const atual = max > 0 ? Math.max(0, Math.min(total - 1, Math.round(elemento.scrollLeft / max * (total - 1)))) : 0;
    setPosicao(anterior => anterior.total === total && anterior.atual === atual ? anterior : { total, atual });
  }, []);
  useEffect(() => {
    atualizar();
    const elemento = faixa.current;
    if (!elemento) return;
    const observar = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(atualizar);
    if (observar) { observar.observe(elemento); if (elemento.firstElementChild) observar.observe(elemento.firstElementChild); }
    window.addEventListener('resize', atualizar);
    return () => { observar?.disconnect(); window.removeEventListener('resize', atualizar); };
  }, [atualizar, children]);
  const navegar = (indice: number) => {
    const elemento = faixa.current;
    if (!elemento || posicao.total < 2) return;
    const destino = Math.max(0, Math.min(posicao.total - 1, indice));
    const max = Math.max(0, elemento.scrollWidth - elemento.clientWidth);
    const left = max * destino / (posicao.total - 1);
    if (typeof elemento.scrollTo === 'function') elemento.scrollTo({ left, behavior: 'smooth' });
    else elemento.scrollLeft = left;
    setPosicao(anterior => ({ ...anterior, atual: destino }));
  };
  return <div className={`min-w-0 max-w-full w-full ${className}`}>
    <div ref={faixa} className="tec08-abas-rolagem max-w-full" onScroll={atualizar}
      onClick={evento => {
        const alvo = evento.target;
        if (!(alvo instanceof Element)) return;
        const aba = alvo.closest('[role="tab"]') as HTMLElement | null;
        const elemento = faixa.current;
        if (!aba || !elemento) return;
        // Abas longas (ex.: Documento principal) devem ficar inteiramente visíveis ao selecionar.
        const janela = elemento.getBoundingClientRect();
        const limitesAba = aba.getBoundingClientRect();
        const inicio = elemento.scrollLeft + (limitesAba.left - janela.left);
        const fim = inicio + limitesAba.width;
        const esquerda = elemento.scrollLeft;
        const direita = esquerda + elemento.clientWidth;
        if (inicio < esquerda || fim > direita) {
          const posicaoNova = inicio < esquerda ? inicio : fim - elemento.clientWidth;
          if (typeof elemento.scrollTo === 'function') elemento.scrollTo({ left: posicaoNova, behavior: 'smooth' });
          else elemento.scrollLeft = posicaoNova;
        }
      }}>
      {children}
    </div>
    {posicao.total > 1 && <nav aria-label="Navegar entre grupos de abas" className="mt-2 flex w-full items-center justify-center gap-2">
      <button type="button" aria-label="Grupo de abas anterior" disabled={posicao.atual === 0}
        onClick={() => navegar(posicao.atual - 1)}
        className="flex h-7 w-8 items-center justify-center rounded-md border border-foreground/20 text-foreground/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-30">‹</button>
      <div className="flex items-center justify-center gap-1.5">
        {Array.from({ length: posicao.total }, (_, indice) => <button type="button" key={indice}
          aria-label={`Ir para grupo de abas ${indice + 1}`} aria-current={indice === posicao.atual ? 'step' : undefined}
          onClick={() => navegar(indice)}
          className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-brand-neon ${indice === posicao.atual ? 'w-5 bg-slate-300' : 'w-2 bg-slate-600 hover:bg-slate-400'}`} />)}
      </div>
      <button type="button" aria-label="Próximo grupo de abas" disabled={posicao.atual === posicao.total - 1}
        onClick={() => navegar(posicao.atual + 1)}
        className="flex h-7 w-8 items-center justify-center rounded-md border border-foreground/20 text-foreground/80 hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-30">›</button>
    </nav>}
  </div>;
}
