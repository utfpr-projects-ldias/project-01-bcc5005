'use client';

import { useEffect } from 'react';

/** Só os cartões operacionais sinalizados recebem feedback curto de clique.
 * Não afeta menu lateral, botões, links, inputs, abas ou acordeões.
 * Não afirma que a API carregou: estados assíncronos devem usar aria-busy. */
export function FeedbackCartoes() {
  useEffect(() => {
    const pendentes = new Map<HTMLElement, number>();
    function acionado(event: MouseEvent) {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest('button, a, input, textarea, select, [role="button"], [role="tab"], summary')) return;
      const card = event.target.closest<HTMLElement>('[data-tec08-item-clicavel]');
      if (!card || card.closest('aside,[aria-label="Navegação principal"],[aria-label="Navegação móvel"]')) return;
      const anterior = pendentes.get(card);
      if (anterior !== undefined) window.clearTimeout(anterior);
      card.setAttribute('data-tec08-card-carregando', 'true');
      const id = window.setTimeout(() => {
        if (card.isConnected) card.removeAttribute('data-tec08-card-carregando');
        pendentes.delete(card);
      }, 250);
      pendentes.set(card, id);
    }
    document.addEventListener('click', acionado, true);
    return () => {
      document.removeEventListener('click', acionado, true);
      for (const [elemento, id] of pendentes) {
        window.clearTimeout(id);
        elemento.removeAttribute('data-tec08-card-carregando');
      }
    };
  }, []);
  return null;
}
