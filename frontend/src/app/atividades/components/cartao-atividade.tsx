'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useListaContratos } from '@/hooks/use-contratos';
import { justificativaAtividadeSchema } from '@/lib/validacao-atividade';
import { transicionarAtividadeApi, type Atividade, type EstadoAtividade } from '@/hooks/use-atividades';
import type { Entregavel } from '@/lib/entregaveis';
import { ModalEdicaoAtividade } from './modal-edicao-atividade';

type Acao = 'verificar' | 'reabrir' | 'arquivar' | 'reativar' | 'excluir';
export type PermissoesAtividade = Partial<Record<'editarAtividades' | 'verificarAtividades' | 'reabrirAtividades' |
  'arquivarAtividades' | 'reativarAtividades' | 'excluirAtividadesArquivadas', boolean>>;
const ROTULO: Record<Acao, string> = { verificar: 'Verificar', reabrir: 'Reabrir', arquivar: 'Arquivar', reativar: 'Reativar', excluir: 'Excluir' };
const ICONES = {
  editar: <><path d="m4 20 4-.7L19 8.3a2 2 0 0 0-2.8-2.8l-11 11L4 20Z" /><path d="m14.5 7 2.5 2.5" /></>,
  verificar: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  reabrir: <><path d="M3 10a9 9 0 1 1 2 7"/><path d="M3 3v7h7" /></>,
  arquivar: <><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v12h14V8M9 13h6" /></>,
  reativar: <><path d="M3 10a9 9 0 1 1 2 7" /><path d="M3 3v7h7" /><path d="M12 9v6m-3-3h6" /></>,
  excluir: <><path d="M4 7h16M9 7V5h6v2M7 7l1 13h8l1-13M10 11v6M14 11v6" /></>,
} as const;
function Icone({ nome }: { nome: keyof typeof ICONES }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{ICONES[nome]}</svg>;
}
const SITUACOES: Record<EstadoAtividade, { titulo: string; estilo: string }> = {
  REGISTRADA: { titulo: 'Registrada', estilo: 'border-brand-green/35 bg-brand-green/10 text-brand-neon' },
  VERIFICADA: { titulo: 'Verificada', estilo: 'border-violet-400/35 bg-violet-500/10 text-violet-200' },
  ARQUIVADA: { titulo: 'Arquivada', estilo: 'border-amber-500/40 bg-amber-500/10 text-amber-200' },
};
export type EstadoVisualEntregavel = 'normal' | 'revisao' | 'concluido' | 'arquivado';
export function statusVisualEntregavel(ent: Pick<Entregavel, 'arquivadoEm' | 'reabertoEm' | 'statusExecucao'>): EstadoVisualEntregavel {
  if (ent.arquivadoEm) return 'arquivado';
  if (ent.statusExecucao === 'CONCLUIDO' && !ent.reabertoEm) return 'concluido';
  if (ent.reabertoEm) return 'revisao';
  return 'normal';
}
const COR_ATIVIDADE = {
  REGISTRADA: { borda: 'border-brand-green/35', fundo: 'bg-brand-green/[0.025]', texto: 'text-brand-neon',
    linha: 'border-brand-green/20', botao: 'border-brand-green/35 text-brand-neon hover:bg-brand-green/10' },
  VERIFICADA: { borda: 'border-violet-400/50', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-300',
    linha: 'border-violet-400/25', botao: 'border-violet-400/40 text-violet-300 hover:bg-violet-500/10' },
  ARQUIVADA: { borda: 'border-amber-500/50', fundo: 'bg-amber-500/[0.04]', texto: 'text-amber-300',
    linha: 'border-amber-500/25', botao: 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10' },
} satisfies Record<EstadoAtividade, { borda: string; fundo: string; texto: string; linha: string; botao: string }>;
const COR_ENTREGAVEL: Record<EstadoVisualEntregavel, string> = {
  normal: 'border-brand-green/30 bg-brand-green/[0.03] text-brand-neon',
  revisao: 'border-teal-500/45 bg-teal-500/[0.045] text-teal-300',
  concluido: 'border-violet-400/45 bg-violet-500/[0.045] text-violet-300',
  arquivado: 'border-amber-500/45 bg-amber-500/[0.045] text-amber-300',
};
const BOTAO = 'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';

/** Mesmo ícone de contrato utilizado na navegação lateral. */
export function IconeContrato({ tamanho = 18 }: { tamanho?: number }) {
  return <svg aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 5V3h8v2M7 10h10M7 14h7" /></svg>;
}
export function abrirContratoContextual(contratoId: string, gatilho: HTMLElement, mostrarPainel: (gatilho: HTMLElement) => void, navegar: (url: string) => void) {
  const url = `/contratos/${encodeURIComponent(contratoId)}`;
  if (typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches) {
    // Dispositivos pequenos usam a página de contrato em outra aba, sem iframe estreito.
    const aba = window.open(url, '_blank');
    if (aba) aba.opener = null;
    else navegar(url);
    return;
  }
  mostrarPainel(gatilho);
}

/** Ícone de caixa: vínculo com entregável, distinto do ícone de contrato. */
export function IconeEntregavel({ tamanho = 15 }: { tamanho?: number }) {
  return <svg data-tec08-icone-entregavel aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v10"/></svg>;
}

/** Painel de contexto com a página REAL do contrato, sem duplicar sidebar no iframe. */
export function PreviaContrato({ contratoId, fechar, foco }: { contratoId: string; fechar: () => void; foco: HTMLElement | null }) {
  const consulta = useListaContratos();
  const contrato = consulta.dados?.find(item => item.id === contratoId);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus({ preventScroll: true });
    const teclado = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } };
    window.addEventListener('keydown', teclado);
    return () => { document.body.style.overflow = anterior; window.removeEventListener('keydown', teclado); if (foco?.isConnected) foco.focus({ preventScroll: true }); };
  }, [fechar, foco]);
  const url = `/contratos/${encodeURIComponent(contratoId)}`;
  return createPortal(<div className="fixed inset-0 z-[250] bg-black/65" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) fechar(); }}>
    <section aria-label="Visualização do contrato" role="dialog" aria-modal="true"
      className="tec08-painel-contrato absolute inset-y-2 right-2 left-2 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-brand-green/40 bg-background shadow-[0_20px_90px_rgba(0,0,0,0.6)] md:inset-y-4 md:right-4 md:left-[92px] xl:left-[238px]">
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-brand-green/25 px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-lg border border-brand-green/25 bg-brand-green/10 p-2 text-brand-neon"><IconeContrato /></span>
          <div className="min-w-0"><h2 className="truncate font-semibold">{contrato?.codigoPublico ? `Contrato ${contrato.codigoPublico}` : 'Detalhes do contrato'}</h2>
            <p className="max-w-[65vw] truncate text-xs text-foreground/65">{contrato?.objeto ?? 'Visão contextual completa'}</p></div></div>
        <div className="flex gap-2"><Link href={url} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-brand-green/30 px-3 py-2 text-xs font-semibold text-brand-neon hover:bg-brand-green/10">Abrir em nova aba</Link>
          <button ref={fecharRef} type="button" aria-label="Fechar painel do contrato" onClick={fechar} className="rounded-lg border border-brand-green/30 px-3 py-2 text-sm hover:bg-brand-green/10">Fechar ×</button></div>
      </header>
      <iframe title="Página completa do contrato" src={`${url}?painel=1`} loading="eager" className="min-h-0 w-full flex-1 border-0 bg-background" />
    </section>
  </div>, document.body);
}
/** O MESMO cartão para diário, contrato, modal e entregável; ações autorizadas pela API. */
export function CartaoAtividade({ atividade, contratoId, permissoes, compacto = false, onEditar, onAtualizada, dentroEntregavel = false, abrirDetalhesInicialmente = false, estadosEntregaveis = {} }: {
  atividade: Atividade; contratoId: string; permissoes?: PermissoesAtividade; compacto?: boolean;
  onEditar?: (atividade: Atividade, gatilho: HTMLButtonElement) => void; onAtualizada?: () => void; dentroEntregavel?: boolean; abrirDetalhesInicialmente?: boolean;
  estadosEntregaveis?: Record<string, EstadoVisualEntregavel>;
}) {
  const cache = useRepositorioConsultasOpcional();
  const [pendente, setPendente] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [gatilho, setGatilho] = useState<HTMLElement | null>(null);
  const [detalheAberto, setDetalheAberto] = useState(abrirDetalhesInicialmente);
  const [carregandoCard, setCarregandoCard] = useState(false);
  const [listaEntregaveisAberta, setListaEntregaveisAberta] = useState(false);
  const [edicaoAberta, setEdicaoAberta] = useState(false);
  const [gatilhoEdicao, setGatilhoEdicao] = useState<HTMLButtonElement | null>(null);
  const justificativaAjudaId = useId();
  const estado = atividade.status ?? 'REGISTRADA';
  const situacao = SITUACOES[estado];
  const cores = COR_ATIVIDADE[estado];
  const estadoModal = estado === 'VERIFICADA' ? 'concluido' : estado === 'ARQUIVADA' ? 'arquivado' : 'normal';

  const acaoDisponivel = (acao: Acao) => {
    if (acao === 'verificar') return estado === 'REGISTRADA' && Boolean(permissoes?.verificarAtividades);
    if (acao === 'reabrir') return estado === 'VERIFICADA' && Boolean(permissoes?.reabrirAtividades);
    if (acao === 'arquivar') return estado === 'VERIFICADA' && Boolean(permissoes?.arquivarAtividades);
    if (acao === 'reativar') return estado === 'ARQUIVADA' && Boolean(permissoes?.reativarAtividades);
    return estado === 'ARQUIVADA' && Boolean(permissoes?.excluirAtividadesArquivadas);
  };
  async function confirmar(evento: FormEvent) {
    evento.preventDefault(); if (!pendente || ocupado) return;
    const motivoValidado = pendente === 'verificar' ? { success: true as const, data: '' } : justificativaAtividadeSchema.safeParse(motivo);
    if (!motivoValidado.success) { setErro(motivoValidado.error.issues[0]?.message ?? 'Informe a justificativa.'); return; }
    setOcupado(true); setErro('');
    try {
      await transicionarAtividadeApi(contratoId, atividade.id, pendente, motivoValidado.data);
      cache?.invalidar(['atividades', contratoId]);
      // Verificar a última atividade pode concluir entregável e etapa no backend.
      // Atualizar também os detalhes, cards e resumos documentais relacionados.
      if (pendente === 'verificar') {
        cache?.invalidar(['entregaveis', 'contrato', contratoId]);
        cache?.invalidar(['etapas', 'contrato', contratoId]);
        cache?.invalidar(['contratos']);
      }
      onAtualizada?.();
      setPendente(null); setMotivo('');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível executar a operação.'); }
    finally { setOcupado(false); }
  }
  function abrirDetalheCard() {
    // O diálogo é local e síncrono: resposta imediata. O feedback curto só
    // sinaliza o clique no cartão; não substitui o carregamento real da API.
    setCarregandoCard(true);
    setDetalheAberto(true);
    window.setTimeout(() => setCarregandoCard(false), 250);
  }
  function solicitar(acao: Acao, elemento: HTMLButtonElement) { setGatilho(elemento); setPendente(acao); setMotivo(''); setErro(''); }
  return <article data-tec08-item-clicavel data-tec08-card-carregando={carregandoCard || undefined} data-atividade-id={atividade.id} data-atividade-estado={estado}
    role="button" tabIndex={0} aria-label={`Abrir cartão da atividade ${atividade.titulo}`}
    onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrirDetalheCard(); } }} onClick={e => {
    if (!(e.target instanceof Element) || !e.currentTarget.contains(e.target) || e.target.closest('button,a,input,textarea,select,[role="dialog"]')) return;
    abrirDetalheCard();
  }} className={`group min-w-0 rounded-xl border ${cores.borda} ${cores.fundo} transition-colors duration-200 ${compacto ? 'p-3 sm:p-4' : 'p-4 sm:p-5'} cursor-pointer hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1"><button type="button" aria-label={`Ver detalhes da atividade ${atividade.titulo}`} onClick={abrirDetalheCard} className={`inline-flex max-w-full break-words text-left font-semibold ${cores.texto} hover:underline focus-visible:outline-2`}>{atividade.titulo}</button>
        <p className="text-xs text-foreground/65"><time dateTime={atividade.dataHora}>{new Date(atividade.dataHora).toLocaleString('pt-BR')}</time> · {atividade.tipo}</p></div>
      <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${situacao.estilo}`}>{situacao.titulo}</span>
    </div>
    <p className={`mt-3 whitespace-pre-wrap break-words text-sm text-foreground/80 ${compacto ? 'line-clamp-2' : 'line-clamp-3'}`}>{atividade.descricao}</p>
    <p className="mt-2 break-words text-xs text-foreground/65">{atividade.responsavel ? `Responsável: ${atividade.responsavel}` : 'Responsável não informado'}</p>
    {atividade.entregaveis.length > 0 && <div className="mt-3 flex min-w-0 flex-wrap gap-1.5" aria-label="Entregáveis vinculados à atividade">
      {atividade.entregaveis.slice(0, 2).map(ent => <span key={ent.id} title={ent.nome}
        className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${cores.borda} ${cores.fundo} ${cores.texto}`}>
        <span className="shrink-0" aria-hidden="true"><IconeEntregavel /></span><span className="min-w-0 max-w-36 truncate sm:max-w-52">{ent.nome}</span>
      </span>)}
      {atividade.entregaveis.length > 2 && <span aria-label={`${atividade.entregaveis.length - 2} entregáveis adicionais`}
        title={`Mais ${atividade.entregaveis.length - 2} entregáveis vinculados`}
        className={`inline-flex shrink-0 items-center rounded-md border px-2.5 py-1 text-xs ${cores.borda} ${cores.texto}`}>…</span>}
    </div>}
    <div className={`mt-3 flex flex-wrap items-center gap-2 border-t pt-3 ${cores.linha}`} aria-label={`Ações de ${atividade.titulo}`}>
      <button type="button" className={`mr-auto text-xs font-semibold underline underline-offset-4 hover:text-foreground ${cores.texto}`} onClick={abrirDetalheCard}>Ver detalhes</button>
      {estado === 'REGISTRADA' && permissoes?.editarAtividades && (onEditar
        ? <button type="button" title="Editar atividade" aria-label="Editar" className={`${BOTAO} ${cores.botao}`} onClick={e => onEditar(atividade, e.currentTarget)}><Icone nome="editar" /></button>
        : <button type="button" title="Editar atividade" aria-label="Editar" className={`${BOTAO} ${cores.botao}`} onClick={e => { setGatilhoEdicao(e.currentTarget); setEdicaoAberta(true); }}><Icone nome="editar" /></button>)}
      {(['verificar','reabrir','arquivar','reativar','excluir'] as const).filter(acaoDisponivel).map(acao =>
        <button key={acao} type="button" title={`${ROTULO[acao]} atividade`} aria-label={ROTULO[acao]}
          className={`${BOTAO} ${acao === 'excluir' ? 'border-error-text/45 text-error-text hover:bg-error-text/10' : cores.botao}`}
          onClick={e => solicitar(acao, e.currentTarget)}><Icone nome={acao} /></button>)}
    </div>
    {detalheAberto && !listaEntregaveisAberta && createPortal(<ModalEtapa titulo={atividade.titulo} contexto="Detalhes da atividade" estadoContextual={estadoModal} camada={dentroEntregavel ? "evidencia" : "principal"} compacto
      ocupado={false} onFechar={() => setDetalheAberto(false)} rotuloFechar="Fechar detalhes da atividade">
      <div className="space-y-4 text-sm" data-testid="detalhe-atividade-modal">
        <div className="flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full border px-3 py-1 text-xs ${situacao.estilo}`}>{situacao.titulo}</span>
          <time className="text-xs text-foreground/65" dateTime={atividade.dataHora}>{new Date(atividade.dataHora).toLocaleString('pt-BR')}</time></div>
        <div className={`rounded-xl border p-4 ${cores.borda} ${cores.fundo}`}><p className="text-xs text-foreground/60">Tipo · {atividade.tipo}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-foreground/90">{atividade.descricao}</p></div>
        <dl className={`grid gap-3 rounded-xl border p-4 sm:grid-cols-2 ${cores.borda} ${cores.fundo}`}>
          {([['Responsável', atividade.responsavel], ['Duração', atividade.duracao], ['Local', atividade.local], ['Participantes', atividade.participantes?.join(', ')], ['Observações', atividade.observacoes]] as const).map(([nome, valor]) =>
            <div key={nome} className="min-w-0"><dt className="text-xs text-foreground/60">{nome}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{valor || 'Não informado'}</dd></div>)}
        </dl>
        {atividade.entregaveis.length > 0 && <div className={`flex flex-wrap items-center justify-start border-t pt-3 ${cores.linha}`}>
          <button type="button" onClick={() => setListaEntregaveisAberta(true)}
            className={`inline-flex min-h-10 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 ${cores.botao}`}>
            <IconeEntregavel /> Ver entregáveis <span className={`rounded-full px-2 py-0.5 text-xs ${cores.fundo}`}>{atividade.entregaveis.length}</span>
          </button>
        </div>}
      </div>
    </ModalEtapa>, document.body)}
    {listaEntregaveisAberta && createPortal(<ModalEtapa titulo="Entregáveis vinculados" contexto={`Atividade: ${atividade.titulo}`} estadoContextual={estadoModal}
      camada={dentroEntregavel ? 'evidencia' : 'principal'} compacto ocupado={false} somenteIconeFechar
      rotuloFechar="Fechar lista de entregáveis"
      onFechar={() => setListaEntregaveisAberta(false)}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Esta atividade está vinculada a {atividade.entregaveis.length} {atividade.entregaveis.length === 1 ? 'entregável' : 'entregáveis'} do contrato. Os vínculos são apenas informativos nesta visualização.</p>
        <ol className="max-h-[55dvh] space-y-2 overflow-y-auto" aria-label="Lista de entregáveis vinculados">
          {atividade.entregaveis.map((ent, indice) => <li key={ent.id}
            data-entregavel-estado={estadosEntregaveis[ent.id] ?? 'normal'}
            className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 sm:p-4 ${COR_ENTREGAVEL[estadosEntregaveis[ent.id] ?? 'normal']}`} >
            <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${COR_ENTREGAVEL[estadosEntregaveis[ent.id] ?? 'normal']}`}>{indice + 1}</span>
            <div className="min-w-0 flex-1"><p title={ent.nome} className="break-words text-sm font-semibold leading-relaxed [overflow-wrap:anywhere]">{ent.nome}</p>
              <p className="mt-1 text-xs text-foreground/55">Entregável vinculado</p></div>
          </li>)}
        </ol>
      </div>
    </ModalEtapa>, document.body)}
    {edicaoAberta && <ModalEdicaoAtividade atividade={atividade} contratoId={contratoId} origem={gatilhoEdicao}
      onFechar={() => setEdicaoAberta(false)} onSalvo={() => { cache?.invalidar(['atividades', contratoId]); onAtualizada?.(); }} />}
    {pendente && createPortal(<ModalEtapa titulo={`${ROTULO[pendente]} atividade`} contexto={atividade.titulo} estadoContextual={estadoModal} camada={dentroEntregavel ? "evidencia" : "principal"} compacto
      ocupado={ocupado} focoRetorno={gatilho} onFechar={() => { if (!ocupado) setPendente(null); }} rotuloFechar="Fechar confirmação">
      <form className="space-y-4" onSubmit={confirmar}>
        <p className="text-sm text-foreground/75">{pendente === 'verificar' ? 'Confirme a verificação. Após esse passo, a edição só poderá ser liberada por uma reabertura autorizada.' : pendente === 'excluir' ? 'Esta atividade arquivada será retirada das listas, mas seus vínculos e sua trilha de auditoria serão preservados.' : 'A operação ficará registrada na rastreabilidade do contrato.'}</p>
        {pendente !== 'verificar' && <div className="space-y-1.5">
          <label htmlFor={`${justificativaAjudaId}-campo`} className="block text-sm font-semibold">Justificativa *</label>
          <p id={`${justificativaAjudaId}-orientacao`} className="text-xs text-foreground/65">Obrigatória: mínimo de 15 e máximo de 200 caracteres.</p>
          <textarea id={`${justificativaAjudaId}-campo`} aria-describedby={`${justificativaAjudaId}-orientacao ${justificativaAjudaId}-contador`}
            aria-invalid={motivo.length > 0 && motivo.trim().length < 15} value={motivo} onChange={e => setMotivo(e.target.value)}
            required minLength={15} maxLength={200} rows={3}
            className="w-full rounded-lg border border-brand-green/30 bg-background p-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon" />
          <p id={`${justificativaAjudaId}-contador`} aria-live="polite" className="text-right text-xs tabular-nums text-foreground/60">{motivo.length}/200 caracteres</p>
        </div>}
        {erro && <p role="alert" className="rounded-lg border border-error-text/35 p-2 text-sm text-error-text">{erro}</p>}
        <div className="flex justify-end gap-2 border-t border-brand-green/15 pt-3"><button type="button" onClick={() => setPendente(null)} disabled={ocupado} className="rounded-lg border border-brand-green/30 px-3 py-2 text-sm">Cancelar</button>
          <button type="submit" aria-busy={ocupado} disabled={ocupado} className={`rounded-lg px-4 py-2 text-sm font-semibold ${pendente === 'excluir' ? 'border border-error-text bg-error-text/10 text-error-text' : 'bg-brand-green text-on-brand-green'}`}>{ocupado ? 'Processando...' : `Confirmar ${ROTULO[pendente].toLowerCase()}`}</button></div>
      </form>
    </ModalEtapa>, document.body)}
  </article>;
}
