"use client";

import { useEffect, useId, useRef } from "react";
import { useCamadaInterativa } from "@/lib/camadas-interativas";
import { createPortal } from "react-dom";
import { IconeConclusao } from "./icones-ciclo-vida";
import type { EstadoContextual } from "@/lib/estado-visivel-contrato";
import { contextoDaDecisao, coresDecisao } from "@/lib/cores-decisoes";

type Props = {
  titulo: string;
  descricao: string;
  confirmar: string;
  ocupado?: boolean;
  perigoso?: boolean;
  descarte?: boolean;
  cancelarVermelho?: boolean;
  confirmacaoRoxa?: boolean;
  aprovarVerde?: boolean;
  estadoContextual?: EstadoContextual;
  preservarCorOrigem?: boolean;
  pendencias?: string[];
  somenteConsulta?: boolean;
  somenteConfirmar?: boolean;
  neutro?: boolean;
  compactoConclusao?: boolean;
  onCancelar: () => void;
  onConfirmar: () => void;
  justificativa?: string;
  onJustificativaChange?: (valor: string) => void;
  justificativaMinima?: number;
  /** Quantidade do comprovante: usada apenas em decisões com execução mensurável. */
  quantidade?: string;
  quantidadeMaxima?: string;
  unidadeMedida?: string | null;
  onQuantidadeChange?: (valor: string) => void;
};

/** Confirmação da própria interface, sem window.confirm ou dependência externa. */
export function ConfirmacaoSimples({ titulo, descricao, confirmar, ocupado = false, perigoso = false, descarte = false, confirmacaoRoxa = false, aprovarVerde = false, estadoContextual = 'normal', preservarCorOrigem = false, onCancelar, onConfirmar, justificativa, onJustificativaChange, justificativaMinima = 15, quantidade, quantidadeMaxima, unidadeMedida, onQuantidadeChange, pendencias = [], somenteConsulta = false, somenteConfirmar = false, neutro = false, compactoConclusao = false }: Props) {
  const modalId = useId();
  const quantidadeValida = !onQuantidadeChange || (quantidade != null && (unidadeMedida==='%'?/^\d{1,3}(?:\.\d{1,2})?$/:/^(?:\d{1,15})(?:\.\d{1,3})?$/).test(quantidade) &&
    Number(quantidade) > 0 && (quantidadeMaxima == null || Number(quantidade) <= Number(quantidadeMaxima)));
  const contextoReabertura = /\b(reabrir|reativar|retomar|reverter)\b/i.test(`${titulo} ${confirmar}`);
  // Na reabertura, o destino é revisão: a ação não herda a cor do estado anterior.
  const estadoDaAcao = contextoReabertura ? 'revisao' : preservarCorOrigem ? estadoContextual : contextoDaDecisao(`${titulo} ${confirmar}`, estadoContextual);
  const cadastroNeutro = /\b(cadastrar|cadastro|criar contrato)\b/i.test(`${titulo} ${confirmar}`);
  const cores = { borda: 'border-slate-500/40', texto: 'text-foreground', foco: 'focus-visible:outline-current', campo: 'focus-visible:border-slate-500' };
  const coresAcao = coresDecisao(estadoDaAcao);
  const confirmacaoArquivo = /^arquivar\b/i.test(`${titulo} ${confirmar}`.trim());
  // A intenção EXPLÍCITA da ação tem precedência sobre o estado da janela:
  // aprovação sempre verde, confirmação roxa quando solicitada, perigo vermelho.
  // Sem essa ordem, uma confirmação de conclusão (estado violeta) ignorava
  // aprovarVerde e aparecia roxa apesar de a aprovação ser uma decisão verde.
  const corBotao = confirmacaoArquivo ? 'border-orange-600 bg-orange-600 text-white hover:bg-orange-500 focus-visible:outline-orange-500'
    : perigoso ? 'border-red-500 bg-red-700 text-white hover:bg-red-600'
    : aprovarVerde ? 'border-green-600 bg-green-800 text-white hover:bg-green-700'
    : confirmacaoRoxa ? 'border-violet-500 bg-violet-700 text-white hover:bg-violet-600'
    : cadastroNeutro ? 'border-[#477d8a] bg-[#35616f] text-white hover:brightness-110'
    : estadoDaAcao !== 'normal' ? coresAcao.botao
    : 'border-[#477d8a] bg-[#35616f] text-white hover:brightness-110';
  const dialogoRef = useRef<HTMLDivElement>(null);
  useCamadaInterativa(true, () => dialogoRef.current, () => { if (!ocupado) onCancelar(); }, 240);
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogoRef.current?.focus({ preventScroll: true });
    return () => { if (anterior?.isConnected) anterior.focus({ preventScroll: true }); };
  }, []);
  function teclado(evento: React.KeyboardEvent<HTMLDivElement>) {
    if (evento.key === "Escape" && !ocupado) { evento.preventDefault(); onCancelar(); }
    if (evento.key === "Tab") {
      const focaveis = Array.from(dialogoRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [href]') ?? []);
      const primeiro = focaveis[0], ultimo = focaveis[focaveis.length - 1];
      if (!primeiro || !ultimo) { evento.preventDefault(); return; }
      if (document.activeElement === dialogoRef.current) { evento.preventDefault(); (evento.shiftKey ? ultimo : primeiro).focus(); }
      else if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
    }
  }
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[240] flex items-center justify-center bg-black/25 backdrop-blur-[1px] p-4" onKeyDown={evento => { evento.stopPropagation(); teclado(evento); }}>
      <div ref={dialogoRef} tabIndex={-1} role="dialog" aria-modal="true" data-tec08-estado={estadoDaAcao} aria-labelledby={`${modalId}-titulo`} aria-describedby={`${modalId}-descricao`}
        data-pi-confirmacao-padronizada data-pi-confirmacao-neutra={neutro || undefined} data-pi-confirmacao-descarte={descarte || undefined} className={`max-h-[90dvh] overflow-y-auto w-full min-w-0 ${descarte ? 'max-w-md' : compactoConclusao ? 'max-w-lg' : 'max-w-sm'} rounded-2xl border ${cores.borda} bg-background p-5 text-foreground shadow-2xl [overflow-wrap:anywhere]`}>
        {descarte && <span aria-hidden="true" className="pi-icone-descarte"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v5m0 3v.1M10.3 4.5 3 18a1.6 1.6 0 0 0 1.4 2.4h15.2A1.6 1.6 0 0 0 21 18L13.7 4.5a1.9 1.9 0 0 0-3.4 0Z"/></svg></span>}
        <h2 id={`${modalId}-titulo`} className={`text-lg font-semibold ${cores.texto}`}>{titulo}</h2>
        <p id={`${modalId}-descricao`} className="mt-2 break-words text-sm text-foreground/75">{descricao}</p>
        {pendencias.length > 0 && <ul className="mt-3 space-y-1 rounded-lg border border-current/15 p-3 text-xs text-foreground/80" aria-label="Pendências">{pendencias.map((p,i) => <li key={i}>{p}</li>)}</ul>}
        {onJustificativaChange && <label className="mt-4 block text-sm font-medium text-foreground" htmlFor={`${modalId}-justificativa`}>
          Justificativa obrigatória ({justificativaMinima} a 200 caracteres)
          <textarea id={`${modalId}-justificativa`} rows={3} maxLength={200} required
            value={justificativa ?? ''} onChange={evento => onJustificativaChange(evento.target.value)}
            aria-describedby={`${modalId}-contador`}
            className={`mt-2 block w-full resize-y rounded-lg border ${cores.borda} bg-background p-3 text-foreground focus-visible:outline-2 ${cores.foco} ${cores.campo}`} />
          <span id={`${modalId}-contador`} className="mt-1 block text-right text-xs text-foreground/65">{(justificativa ?? '').length}/200</span>
        </label>}
        {onQuantidadeChange && <label className="mt-4 block space-y-1 text-sm font-medium" htmlFor={`${modalId}-quantidade`}>
          {unidadeMedida==='%'?'Percentual verificado (%)':`Quantidade verificada (${unidadeMedida || 'unidades'})`}
          <input id={`${modalId}-quantidade`} type="text" inputMode="decimal" maxLength={19}
            value={quantidade ?? ''} onChange={evento => onQuantidadeChange(evento.target.value)}
            aria-label={unidadeMedida==='%'?'Percentual verificado da evidência':'Quantidade verificada da evidência'} aria-invalid={!quantidadeValida}
            className={`block w-full rounded-lg border ${cores.borda} bg-background px-3 py-2 text-foreground`} />
          {!quantidadeValida && <span role="alert" className="text-xs text-error-text">Valor positivo, com até {unidadeMedida==='%'?'duas':'três'} casas decimais, não superior ao declarado.</span>}
        </label>}
        <div className={`mt-5 flex flex-wrap items-center ${compactoConclusao && !somenteConsulta ? 'justify-between' : 'justify-end'} gap-2 [&>button]:min-h-10`}>
          {!somenteConfirmar && <button type="button" disabled={ocupado} onClick={onCancelar}
            className={`inline-flex min-h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition disabled:opacity-50 focus-visible:outline-2 ${cores.foco} border ${cores.borda} hover:bg-current/10`}>{somenteConsulta ? "Fechar" : descarte ? "Continuar editando" : "Cancelar"}</button>}
          {!somenteConsulta && <button type="button" aria-busy={ocupado} disabled={ocupado || !quantidadeValida || Boolean(onJustificativaChange && ((justificativa ?? '').trim().length < justificativaMinima || (justificativa ?? '').trim().length > 200))} onClick={onConfirmar}
            data-tec08-confirmar="true" data-tec08-acao-perigosa={perigoso && !confirmacaoArquivo || undefined} data-pi-intencao-confirmacao={confirmacaoArquivo ? 'arquivado' : cadastroNeutro ? 'normal' : estadoDaAcao} data-tec08-acao-roxa={confirmacaoRoxa || undefined} data-tec08-acao-aprovar={aprovarVerde || undefined} className={`inline-flex min-h-9 shrink-0 items-center justify-center ${compactoConclusao ? 'whitespace-normal' : 'whitespace-nowrap'} rounded-lg border px-3 py-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-wait disabled:opacity-65 ${corBotao} ${cores.foco}`}>
            {compactoConclusao && confirmacaoRoxa && <IconeConclusao className="mr-1 h-4 w-4 shrink-0"/>}{ocupado ? "Aguarde..." : confirmar}
          </button>}
        </div>
      </div>
    </div>
  , document.body);
}
