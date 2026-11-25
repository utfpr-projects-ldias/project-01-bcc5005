'use client';
import { useEffect, useRef } from 'react';

type Camada = { elemento: () => HTMLElement | null; fechar: () => void; prioridade: number; ordem: number };
const pilhas = new WeakMap<Document, { camadas: Camada[]; teclado: (evento: KeyboardEvent) => void }>();
let ordem = 0;

function caminhoVisual(el: HTMLElement): number[] {
  const caminho: number[] = [];
  for (let atual: HTMLElement | null = el; atual; atual = atual.parentElement) {
    const estilo = atual.ownerDocument.defaultView?.getComputedStyle(atual);
    if (!estilo) continue;
    const z = estilo.zIndex;
    if (z && z !== 'auto' && Number.isFinite(Number(z))) caminho.unshift(Number(z));
    else if (estilo.isolation === 'isolate' || (estilo.transform && estilo.transform !== 'none') || estilo.position === 'fixed' || estilo.position === 'sticky') caminho.unshift(0);
  }
  return caminho;
}
function compararCamadas(a: Camada, b: Camada) {
  const ea = a.elemento(), eb = b.elemento();
  if (ea && eb) {
    if (ea !== eb && ea.contains(eb)) return 1;
    if (ea !== eb && eb.contains(ea)) return -1;
    const za = caminhoVisual(ea), zb = caminhoVisual(eb);
    for (let i = 0; i < Math.max(za.length, zb.length); i++) {
      const diferenca = (zb[i] ?? 0) - (za[i] ?? 0);
      if (diferenca) return diferenca;
    }
  }
  return b.prioridade - a.prioridade || b.ordem - a.ordem;
}
export function registrarCamada(doc: Document, elemento: Camada['elemento'], fechar: () => void, prioridade: number) {
  let pilha = pilhas.get(doc);
  if (!pilha) {
    const camadas: Camada[] = [];
    const teclado = (evento: KeyboardEvent) => {
      if (evento.key !== 'Escape' || evento.defaultPrevented || evento.isComposing) return;
      const superior = camadas.filter(c => { const el = c.elemento(); return el?.isConnected && !el.closest('[hidden], [inert], [aria-hidden="true"]'); }).sort(compararCamadas)[0];
      if (!superior) return;
      // Seletores nativos/com autocompletar possuem sua própria primeira camada.
      if (evento.target instanceof Element && evento.target.closest('[role="combobox"][aria-expanded="true"]')) return;
      evento.preventDefault(); evento.stopImmediatePropagation();
      if (!evento.repeat) superior.fechar();
    };
    pilha = { camadas, teclado }; pilhas.set(doc,pilha);
    doc.addEventListener('keydown',teclado,true);
  }
  const camada = {elemento,fechar,prioridade,ordem:++ordem}; pilha.camadas.push(camada);
  return () => {
    const i=pilha.camadas.indexOf(camada); if(i>=0)pilha.camadas.splice(i,1);
    if(!pilha.camadas.length){doc.removeEventListener('keydown',pilha.teclado,true);pilhas.delete(doc);}
  };
}
/** Um Escape é consumido por uma única camada; callbacks permanecem atuais. */
export function useCamadaInterativa(ativa: boolean, elemento: () => HTMLElement | null, fechar: () => void, prioridade = 100) {
  const atual=useRef({elemento,fechar});
  useEffect(()=>{atual.current={elemento,fechar};},[elemento,fechar]);
  useEffect(()=>{
    if(!ativa)return;
    return registrarCamada(document,()=>atual.current.elemento(),()=>atual.current.fechar(),prioridade);
  },[ativa,prioridade]);
}
