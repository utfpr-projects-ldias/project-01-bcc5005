'use client';
import { useCallback, useEffect, useState } from 'react';

type TipoToast = 'sucesso' | 'erro' | 'aviso' | 'conclusao';
type EntradaToast = { id: number; mensagem: string; tipo: TipoToast };
const CANAL = 'sgc:toast';
let proximoId = 0;

function emitir(tipo: TipoToast, mensagem: string) {
  if (typeof window === 'undefined' || !mensagem.trim()) return;
  window.dispatchEvent(new CustomEvent<EntradaToast>(CANAL, {
    detail: { id: ++proximoId, tipo, mensagem: mensagem.trim() },
  }));
}
export const toastSucesso = (mensagem: string) => emitir('sucesso', mensagem);
export const toastErro = (mensagem: string) => emitir('erro', mensagem);
export const toastAviso = (mensagem: string) => emitir('aviso', mensagem);
export const toastConclusao = (mensagem: string) => emitir('conclusao', mensagem);

/** Feedback fora do fluxo de layout; não substitui erros de validação persistentes. */
export function ToastNotificacoes() {
  const [toasts, setToasts] = useState<EntradaToast[]>([]);
  useEffect(() => {
    function receber(evento: Event) {
      const entrada = (evento as CustomEvent<EntradaToast>).detail;
      if (!entrada || !['sucesso', 'erro', 'aviso', 'conclusao'].includes(entrada.tipo)) return;
      // Não empilhar a mesma mensagem duplicada em requisições concomitantes.
      setToasts(anteriores => [...anteriores.filter(a => a.tipo !== entrada.tipo || a.mensagem !== entrada.mensagem).slice(-2), entrada]);
    }
    window.addEventListener(CANAL, receber);
    return () => window.removeEventListener(CANAL, receber);
  }, []);
  const dispensar = useCallback((id: number) => setToasts(anteriores => anteriores.filter(t => t.id !== id)), []);
  return <div aria-label="Notificações" className="pointer-events-none fixed bottom-4 right-4 z-[250] flex w-[min(370px,calc(100vw-2rem))] flex-col gap-2 sm:bottom-6 sm:right-6">
    {toasts.map(toast => <ToastItem key={toast.id} toast={toast} dispensar={dispensar} />)}
  </div>;
}

function ToastItem({ toast, dispensar }: { toast: EntradaToast; dispensar: (id: number) => void }) {
  const duracao = toast.tipo === 'erro' ? 6500 : toast.tipo === 'aviso' ? 5100 : 3900;
  useEffect(() => {
    const temporizador = window.setTimeout(() => dispensar(toast.id), duracao);
    return () => window.clearTimeout(temporizador);
  }, [toast.id, duracao, dispensar]);
  const estilo = toast.tipo === 'conclusao'
    ? { borda: 'border-violet-400/55', fundo: 'bg-[#201529]/95', cor: 'text-violet-200', faixa: 'bg-violet-400', nome: 'Comprovação concluída' }
    : toast.tipo === 'sucesso'
    ? { borda: 'border-emerald-500/35', fundo: 'bg-[#101e18]/95', cor: 'text-emerald-300', faixa: 'bg-emerald-400', nome: 'Concluído' }
    : toast.tipo === 'erro'
      ? { borda: 'border-rose-400/45', fundo: 'bg-[#24171b]/95', cor: 'text-rose-300', faixa: 'bg-rose-400', nome: 'Não concluído' }
      : { borda: 'border-amber-400/45', fundo: 'bg-[#211e15]/95', cor: 'text-amber-300', faixa: 'bg-amber-300', nome: 'Atenção' };
  return <div role={toast.tipo === 'erro' ? 'alert' : 'status'}
    className={`toast-entrada pointer-events-auto relative isolate overflow-hidden rounded-xl border ${estilo.borda} ${estilo.fundo} text-slate-100 shadow-[0_12px_32px_rgba(0,0,0,0.35)] backdrop-blur-lg`}>
    <div className={`absolute inset-y-0 left-0 w-[3px] ${estilo.faixa}`} aria-hidden="true" />
    <div className="flex items-start gap-3 px-3.5 py-3 pl-4">
      <span aria-hidden="true" className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.06] ${estilo.cor}`}>
        {toast.tipo === 'sucesso' || toast.tipo === 'conclusao' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m5 12 4 4L19 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          : toast.tipo === 'erro' ? <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9"/><path d="M12 7v6m0 4h.01"/></svg>
            : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 3 2 21h20L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg>}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-[10px] font-semibold uppercase tracking-[0.13em] ${estilo.cor}`}>{estilo.nome}</p>
        <p className="mt-0.5 break-words text-xs leading-relaxed text-slate-100 sm:text-[13px]">{toast.mensagem}</p>
      </div>
      <button type="button" aria-label="Fechar notificação" title="Dispensar" onClick={() => dispensar(toast.id)}
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-brand-green/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-emerald-300">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m18 6-12 12M6 6l12 12"/></svg>
      </button>
    </div>
    <div aria-hidden="true" className="h-[2px] w-full bg-white/[0.06]">
      <span className={`toast-progresso block h-full w-full ${estilo.faixa}`} style={{ animationDuration: `${duracao}ms` }} />
    </div>
  </div>;
}
