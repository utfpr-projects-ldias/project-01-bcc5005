'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { EVENTO_NAVEGACAO_INTERNA } from './navegacao-interna';

/** A lista permanece montada: filtros, pesquisa e rolagem sobrevivem à seleção. */
export function NavegadorEntregaveis({ selecionado, lista, children }: {
  nomeEtapa?: string; selecionado: string | null; painelDireitoAberto: boolean; lista: ReactNode; children: ReactNode;
}) {
  const painel = useRef<HTMLElement>(null);
  const detalhes = useRef<HTMLDivElement>(null);
  const sujo = useRef(false);
  const [descarte, setDescarte] = useState<{ continuar?: () => void } | null>(null);
  const anterior = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (anterior.current === selecionado) return;
    anterior.current = selecionado;
    sujo.current = false;
    const quadro = requestAnimationFrame(() => {
      if (selecionado) detalhes.current?.focus({ preventScroll: true });
      else painel.current?.querySelector<HTMLElement>('input, select, button')?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(quadro);
  }, [selecionado]);
  useEffect(() => {
    const proteger = (evento: Event) => {
      if (!detalhes.current?.isConnected || detalhes.current.closest('[hidden]') || !sujo.current) return;
      evento.preventDefault();
      const continuar = (evento as CustomEvent<{ continuar?: () => void }>).detail?.continuar;
      setDescarte(atual => atual ?? { continuar });
    };
    const salvo = () => { sujo.current = false; };
    window.addEventListener(EVENTO_NAVEGACAO_INTERNA, proteger);
    window.addEventListener('pi:rascunho-execucao-salvo', salvo);
    return () => {
      window.removeEventListener(EVENTO_NAVEGACAO_INTERNA, proteger);
      window.removeEventListener('pi:rascunho-execucao-salvo', salvo);
    };
  }, []);
  return <div data-pi-navegador-entregaveis data-selecionado={Boolean(selecionado)} className="min-w-0">
    <div className="pi-entregaveis-area relative min-w-0" data-selecionado={Boolean(selecionado)}>
      <aside ref={painel} aria-label="Lista de entregáveis" hidden={Boolean(selecionado)} inert={Boolean(selecionado) || undefined} data-pi-lista-entregaveis data-aberto={!selecionado} className="min-w-0 space-y-3">
        {lista}
      </aside>
      <div data-pi-area-detalhe-entregavel tabIndex={-1} ref={detalhes} className="min-w-0" onChangeCapture={e => { if (e.target instanceof HTMLElement && detalhes.current?.contains(e.target) && e.target.closest('form') && !e.target.closest('[data-tec08-modal]')) sujo.current = true; }} onInputCapture={e => { if (e.target instanceof HTMLElement && detalhes.current?.contains(e.target) && e.target.closest('form') && !e.target.closest('[data-tec08-modal]')) sujo.current = true; }}>
        {selecionado ? children : null}
      </div>
    </div>
    {descarte && <ConfirmacaoSimples titulo="Descartar alterações?" descricao="Há um registro ou edição ainda não salvo neste entregável. Se continuar, essas alterações serão perdidas." confirmar="Descartar alterações" perigoso descarte onCancelar={()=>setDescarte(null)} onConfirmar={()=>{const continuar=descarte.continuar;sujo.current=false;setDescarte(null);window.dispatchEvent(new CustomEvent('pi:descartar-rascunho-execucao',{detail:{entregavelId:selecionado}}));if(continuar)requestAnimationFrame(continuar);}}/>}
  </div>;
}
