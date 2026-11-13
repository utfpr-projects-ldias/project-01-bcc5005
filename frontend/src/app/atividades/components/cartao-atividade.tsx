'use client';

import { BotaoAcaoModal } from '@/app/components/botoes-modal';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRepositorioConsultasOpcional, useConsulta } from '@/app/components/provedor-consultas';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { BotaoEditarModal } from '@/app/components/botoes-modal';
import { IconeEngrenagem } from '@/app/components/icone-engrenagem';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { estadoContextualContrato } from '@/lib/estado-visivel-contrato';
import { ResumoPlanejamentoContrato } from '@/app/contratos/components/resumo-planejamento-contrato';
import { useProgresso } from '@/hooks/use-progresso';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { justificativaAtividadeSchema } from '@/lib/validacao-atividade';
import { transicionarAtividadeApi, type Atividade, type EstadoAtividade } from '@/hooks/use-atividades';
import type { Entregavel } from '@/lib/entregaveis';
import { chaveTexto } from '@/lib/repositorio-consultas';
import { consultarElegibilidadeConclusao, type Contrato } from '@/lib/contratos';
import { contextoDaDecisao, coresDecisao } from '@/lib/cores-decisoes';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { ModalEdicaoAtividade } from './modal-edicao-atividade';

type Acao = 'solicitar-conclusao' | 'aprovar-conclusao' | 'cancelar-solicitacao' | 'reabrir' | 'arquivar' | 'reativar' | 'excluir';
export type PermissoesAtividade = Partial<Record<'editarAtividades' | 'verificarAtividades' | 'reabrirAtividades' |
  'arquivarAtividades' | 'reativarAtividades' | 'excluirAtividadesArquivadas', boolean>>;
const ROTULO: Record<Acao, string> = { 'solicitar-conclusao': 'Solicitar conclusão', 'aprovar-conclusao': 'Aprovar', 'cancelar-solicitacao': 'Cancelar solicitação', reabrir: 'Reabrir', arquivar: 'Arquivar', reativar: 'Reativar', excluir: 'Excluir' };
const ICONES = {
  editar: <><path d="m4 20 4-.7L19 8.3a2 2 0 0 0-2.8-2.8l-11 11L4 20Z" /><path d="m14.5 7 2.5 2.5" /></>,
  'solicitar-conclusao': <><path d="M4 12h16M12 4v16" /></>,
  'aprovar-conclusao': <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  'cancelar-solicitacao': <><path d="M5 5l14 14M19 5 5 19" /></>,
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
  PENDENTE_CONCLUSAO: { titulo: 'Pendente de conclusão', estilo: 'border-violet-400/50 bg-violet-500/10 text-violet-200' },
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
  PENDENTE_CONCLUSAO: { borda: 'border-violet-400/45', fundo: 'bg-violet-500/[0.055]', texto: 'text-violet-200',
    linha: 'border-violet-400/20', botao: 'border-violet-400/45 text-violet-200 hover:bg-violet-500/10' },
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
const BOTAO = 'pointer-events-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50';

/** Mesmo ícone de contrato utilizado na navegação lateral. */
export function IconeContrato({ tamanho = 18 }: { tamanho?: number }) {
  return <svg aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 5V3h8v2M7 10h10M7 14h7" /></svg>;
}
export function abrirContratoContextual(_contratoId: string, gatilho: HTMLElement, mostrarPainel: (gatilho: HTMLElement) => void, _navegar: (url: string) => void) {
  // Um único fluxo visual para desktop e celular; sem navegação a uma página independente.
  mostrarPainel(gatilho);
}

/** Modal compartilhado para abrir contratos pela carteira ou pelo diário.
 * A rota interna ainda alimenta o conteúdo do iframe, mas não é uma opção de navegação do usuário.
 */
export function PreviaContrato({ contratoId, fechar, foco }: { contratoId: string; fechar: () => void; foco: HTMLElement | null }) {
  const consulta = useListaContratos();
  const [contratoConfirmado, setContratoConfirmado] = useState<Contrato | null>(null);
  const contrato = contratoConfirmado ?? consulta.dados?.find(item => item.id === contratoId);
  const cacheContrato = useRepositorioConsultasOpcional();
  const progresso = useProgresso(contratoId);
  const elegibilidade = useConsulta(['contratos','elegibilidade-conclusao',contratoId],
    (signal) => consultarElegibilidadeConclusao(contratoId, signal), { validadeMs: 8000 });
  const acessoContrato = useAcessoContrato(contratoId);
  const { dados: usuario } = useMeuPerfil();
  const admin = usuario?.perfil === 'ADMINISTRADOR';
  const permitido = (chave: 'suspenderContrato' | 'cancelarContrato' | 'encerrarContrato' | 'concluirContrato' | 'retomarContrato' | 'reverterCancelamentoContrato' | 'reabrirContrato') => Boolean(admin || acessoContrato.dados?.permissoes?.[chave]);
  const encerramentoElegivel = Boolean(contrato && !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && !['SUSPENSO','CANCELADO','CONCLUIDO','FINALIZADO','ENCERRADO'].includes(contrato.status));
  const enviarAcao = (acao: string) => iframeRef.current?.contentWindow?.postMessage({tipo:'pi:acao-contrato',contratoId,acao},window.location.origin);
  const acaoReabrir = contrato?.status === 'CANCELADO' ? 'reverter-cancelamento'
    : contrato?.status === 'SUSPENSO' ? 'retomar'
    : contrato && ['CONCLUIDO','FINALIZADO','ENCERRADO'].includes(contrato.status) ? 'reabrir' : null;
  const podeReabrir = acaoReabrir === 'reverter-cancelamento' ? permitido('reverterCancelamentoContrato')
    : acaoReabrir === 'retomar' ? permitido('retomarContrato')
    : acaoReabrir === 'reabrir' ? permitido('reabrirContrato') : false;
  const estadoModalContrato = estadoContextualContrato(contrato, Boolean(contrato?.conclusaoSolicitadaEm));
  const corPainel = estadoModalContrato === 'revisao' ? 'border-teal-500/45 bg-teal-500/[0.05] text-teal-600 dark:text-teal-200'
    : estadoModalContrato === 'finalizado' ? 'border-purple-500/45 bg-purple-500/[0.05] text-purple-700 dark:text-purple-200'
    : estadoModalContrato === 'encerrado' ? 'border-slate-500/45 bg-slate-500/[0.05] text-slate-700 dark:text-slate-300'
    : estadoModalContrato === 'concluido' ? 'border-violet-500/45 bg-violet-500/[0.05] text-violet-700 dark:text-violet-200'
    : estadoModalContrato === 'arquivado' ? 'border-amber-500/45 bg-amber-500/[0.05] text-amber-700 dark:text-amber-200'
    : estadoModalContrato === 'suspenso' ? 'border-yellow-500/45 bg-yellow-500/[0.05] text-yellow-700 dark:text-yellow-200'
    : estadoModalContrato === 'cancelado' ? 'border-red-500/45 bg-red-500/[0.05] text-red-700 dark:text-red-200'
    : 'border-brand-green/35 bg-brand-green/[0.04] text-brand-neon';
  const iframeRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    function receber(evento: MessageEvent) {
      if (evento.origin !== window.location.origin || evento.source !== iframeRef.current?.contentWindow) return;
      if (evento.data?.tipo !== 'pi:contrato-atualizado' || evento.data?.contratoId !== contratoId) return;
      const atualizado = evento.data?.contrato as Contrato | undefined;
      if (!atualizado || atualizado.id !== contratoId) return;
      setContratoConfirmado(atualizado);
      cacheContrato?.gravar(chaveTexto(['contratos', 'detalhe', contratoId]), atualizado);
      cacheContrato?.invalidar(['contratos', 'lista']);
      cacheContrato?.invalidar(['contratos', 'pendentes']);
      cacheContrato?.invalidar(['contratos','elegibilidade-conclusao', contratoId]);
      cacheContrato?.invalidar(['execucao', contratoId]);
    }
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  }, [contratoId, cacheContrato]);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus({ preventScroll: true });
    const teclado = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); fechar(); } };
    window.addEventListener('keydown', teclado);
    return () => { document.body.style.overflow = anterior; window.removeEventListener('keydown', teclado); if (foco?.isConnected) foco.focus({ preventScroll: true }); };
  }, [fechar, foco]);
  const percentual = (valor: number | null | undefined) => valor === null || valor === undefined ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  const top = (progresso.progresso?.entregaveis ?? []).slice(0, 3);
  return createPortal(<div className="fixed inset-0 z-[250] bg-black/65" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) fechar(); }}>
    <section aria-label="Detalhes do contrato" role="dialog" aria-modal="true" data-tec08-estado={estadoModalContrato}
      className="pi-modal-contrato-entrada pi-contrato-contextual absolute inset-y-2 right-2 left-[78px] flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-[0_20px_90px_rgba(0,0,0,0.6)] sm:inset-y-4 sm:right-4 sm:left-[108px]">
      <header className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-background px-4 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-lg border p-2 pi-contrato-acento"><IconeContrato /></span>
          <div className="min-w-0"><h2 className="truncate font-semibold">{contrato?.codigoPublico ? `Contrato ${contrato.codigoPublico}` : 'Detalhes do contrato'}</h2>
            <p className="max-w-[65vw] truncate text-xs text-foreground/65">{contrato?.objeto ?? 'Visão contextual do contrato'}</p></div></div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {acaoReabrir && podeReabrir ?
            <button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-teal-500/65 bg-teal-500/10 px-3 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 focus-visible:outline-2 focus-visible:outline-teal-400"
              onClick={() => enviarAcao(acaoReabrir)}>⟳ Reabrir</button>
            : !acaoReabrir && <MenuAcoesObjeto rotulo="Fechar" disabled={!contrato} pendenteConclusao={Boolean(contrato?.conclusaoSolicitadaEm)}>
            <BotaoAcaoModal intencao="suspender" disabled={!encerramentoElegivel || !permitido('suspenderContrato')} onClick={() => enviarAcao('suspender')}>⏸ Suspender contrato</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!encerramentoElegivel || !permitido('cancelarContrato')} onClick={() => enviarAcao('cancelar')}>✕ Cancelar contrato</BotaoAcaoModal>
            <BotaoAcaoModal intencao="encerrar" disabled={!encerramentoElegivel || !permitido('encerrarContrato')} onClick={() => enviarAcao('encerrar')}>⚑ Encerrar antecipadamente</BotaoAcaoModal>
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={!encerramentoElegivel || !!contrato?.conclusaoSolicitadaEm || !elegibilidade.dados?.apto || !(admin || acessoContrato.dados?.permissoes?.editarContrato)}
              title={elegibilidade.dados?.pendencias?.[0] ?? 'Solicitar avaliação de conclusão integral'}
              onClick={() => enviarAcao('solicitar-conclusao')}>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="inline-block h-4 w-4 align-middle"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="m7 11 2 2 3-4M14 10h4M7 17h11"/></svg> Solicitar conclusão
            </BotaoAcaoModal>
            {Boolean(contrato?.conclusaoSolicitadaEm) && permitido('concluirContrato') && <>
              <BotaoAcaoModal intencao="cancelar" onClick={() => enviarAcao('devolver-conclusao')}>✕ Devolver solicitação</BotaoAcaoModal>
              <BotaoAcaoModal intencao="concluir" onClick={() => enviarAcao('aprovar-conclusao')}>✓ Aprovar conclusão</BotaoAcaoModal>
            </>}
          </MenuAcoesObjeto>}
          <button ref={fecharRef} type="button" aria-label="Fechar detalhes do contrato" onClick={fechar} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xl pi-contrato-acento hover:bg-current/10">×</button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <iframe ref={iframeRef} title="Conteúdo do contrato" src={`/contratos/${encodeURIComponent(contratoId)}?painel=1`}
          loading="eager" className="min-h-[40dvh] min-w-0 flex-1 border-0 bg-background xl:min-h-0" />
        <aside aria-label="Resumo e execução física do contrato" className="w-full shrink-0 space-y-4 overflow-y-auto border-t bg-background p-4 xl:w-[350px] xl:border-l xl:border-t-0">
          <div className="flex items-center justify-between gap-2"><h3 className="text-base font-semibold pi-contrato-acento">Planejamento do contrato</h3>
            {(acessoContrato.dados?.permissoes?.editarContrato || acessoContrato.dados?.podeEditar) &&
              <button type="button" aria-label="Editar contrato" title="Editar contrato" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent pi-contrato-acento transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current"
                onClick={() => iframeRef.current?.contentWindow?.postMessage({tipo:'pi:editar-contrato',contratoId},window.location.origin)}>
                <IconeEngrenagem tamanho={20}/>
              </button>}
          </div>
          <ResumoPlanejamentoContrato contratoId={contratoId} variante="lateral"
            contratoArquivado={Boolean(contrato?.arquivadoEm)}
            contratoEmRevisao={estadoModalContrato === 'revisao'}
            contratoConcluido={estadoModalContrato === 'concluido'}
            contratoEncerrado={estadoModalContrato === 'encerrado'}
            contratoSuspenso={estadoModalContrato === 'suspenso'}
            contratoCancelado={estadoModalContrato === 'cancelado'} />
          <section aria-label="Execução física" className={`space-y-3 rounded-xl border p-3 ${corPainel}`}>
            <header className="space-y-1">
              <h3 className="text-sm font-semibold text-current">Execução física</h3>
              <p className="text-xs text-foreground/65">Acompanhe o avanço dos entregáveis. A comprovação documental é independente.</p>
            </header>
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/15 bg-background/35 px-3 py-2"><span className="text-xs text-foreground/65">Avanço do contrato</span>
              <strong className="text-xl tabular-nums text-current">{percentual(progresso.progresso?.avanco)}</strong></div>
            <p className="text-xs text-foreground/65">Modo: <strong>{progresso.progresso?.modoCalculo === 'PONDERADO' ? 'Ponderado' : 'Simples'}</strong> · {progresso.progresso?.entregaveis.length ?? 0} entregável(is)</p>
            <div className="space-y-2 border-t border-current/15 pt-2">
              {top.map(ent => <div key={ent.entregavelId} className="flex items-center justify-between gap-3 rounded-xl border border-current/18 bg-background/40 px-3 py-2.5 text-xs">
                <span className="min-w-0 truncate font-medium" title={ent.nome}>{ent.nome}</span><strong className="shrink-0 tabular-nums">{percentual(ent.percentualExecucao)}</strong>
              </div>)}
              {!top.length && <p className="text-xs text-foreground/60">Nenhum entregável com progresso disponível.</p>}
              {(progresso.progresso?.entregaveis.length ?? 0) > 3 && <p className="text-xs text-foreground/55">Exibindo os três primeiros entregáveis.</p>}
            </div>
          </section>
        </aside>
      </div>
    </section>
  </div>, document.body);
}
/** Ícone de caixa: vínculo com entregável, distinto do ícone de contrato. */
export function IconeEntregavel({ tamanho = 15 }: { tamanho?: number }) {
  return <svg data-tec08-icone-entregavel aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v10"/></svg>;
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
  const estadoModal = estadoDoObjeto({objeto:'atividade',status:estado});
  const coresModalAcao = coresDecisao(contextoDaDecisao(pendente ? `${ROTULO[pendente]} atividade` : '', estadoModal));

  const acaoDisponivel = (acao: Acao) => {
    if (acao === 'solicitar-conclusao') return estado === 'REGISTRADA' && Boolean(permissoes?.editarAtividades);
    if (acao === 'aprovar-conclusao') return estado === 'PENDENTE_CONCLUSAO' && Boolean(permissoes?.verificarAtividades);
    if (acao === 'cancelar-solicitacao') return estado === 'PENDENTE_CONCLUSAO' && Boolean(permissoes?.editarAtividades);
    if (acao === 'reabrir') return estado === 'VERIFICADA' && Boolean(permissoes?.reabrirAtividades);
    if (acao === 'arquivar') return estado === 'VERIFICADA' && Boolean(permissoes?.arquivarAtividades);
    if (acao === 'reativar') return estado === 'ARQUIVADA' && Boolean(permissoes?.reativarAtividades);
    return estado === 'ARQUIVADA' && Boolean(permissoes?.excluirAtividadesArquivadas);
  };
  async function confirmar(evento: FormEvent) {
    evento.preventDefault(); if (!pendente || ocupado) return;
    const motivoValidado = ['solicitar-conclusao', 'aprovar-conclusao'].includes(pendente) ? { success: true as const, data: '' } : justificativaAtividadeSchema.safeParse(motivo);
    if (!motivoValidado.success) { setErro(motivoValidado.error.issues[0]?.message ?? 'Informe a justificativa.'); return; }
    setOcupado(true); setErro('');
    try {
      await transicionarAtividadeApi(contratoId, atividade.id, pendente, motivoValidado.data);
      cache?.invalidar(['atividades', contratoId]);
      // Verificar a última atividade pode concluir entregável e etapa no backend.
      // Atualizar também os detalhes, cards e resumos documentais relacionados.
      if (pendente === 'aprovar-conclusao') {
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
  function solicitar(acao: Acao, elemento: HTMLButtonElement | null) { setGatilho(elemento); setPendente(acao); setMotivo(''); setErro(''); }
  return <article data-tec08-item-clicavel data-tec08-card-carregando={carregandoCard || undefined} data-atividade-id={atividade.id} data-atividade-estado={estado}
    onClick={e => {
    if (!(e.target instanceof Element) || e.target.closest('button,a,input,textarea,select,[role="dialog"]')) return;
    abrirDetalheCard();
  }} className={`group relative min-w-0 rounded-xl border ${cores.borda} ${cores.fundo} transition-colors duration-200 ${compacto ? 'p-3 sm:p-4' : 'p-4 sm:p-5'} cursor-pointer hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2`}>
    <button type="button" aria-label={`Abrir cartão da atividade ${atividade.titulo}`} aria-haspopup="dialog"
      onClick={e => { e.stopPropagation(); abrirDetalheCard(); }}
      onKeyDown={e => {
        // No navegador, Enter ativa um botão nativo; impedir o padrão evita abrir duas vezes.
        // No teste, fireEvent.keyDown não sintetiza esse clique, então tratamos Enter explicitamente.
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); abrirDetalheCard(); }
      }}
      className="absolute inset-0 z-[1] cursor-pointer rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2" />
    <div className="pointer-events-none relative z-[2]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1"><button type="button" aria-label={`Ver detalhes da atividade ${atividade.titulo}`} onClick={abrirDetalheCard} className={`pointer-events-auto inline-flex max-w-full break-words text-left font-semibold ${cores.texto} focus-visible:underline focus-visible:outline-2`}>{atividade.titulo}</button>
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

    </div>
    {detalheAberto && !listaEntregaveisAberta && createPortal(<ModalEtapa titulo={atividade.titulo} contexto="Detalhes da atividade" estadoContextual={estadoModal} camada={dentroEntregavel ? "evidencia" : "principal"} compacto
      ocupado={false} onFechar={() => setDetalheAberto(false)} rotuloFechar="Fechar detalhes da atividade"
      acoes={<>
        {estado === 'PENDENTE_CONCLUSAO' && (permissoes?.editarAtividades || permissoes?.verificarAtividades) &&
          <div className="flex items-center gap-2">
            {acaoDisponivel('cancelar-solicitacao') && <button type="button" className="rounded-lg border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs font-semibold hover:bg-amber-500/20"
              onClick={e => solicitar('cancelar-solicitacao', e.currentTarget)}>Cancelar</button>}
            {acaoDisponivel('aprovar-conclusao') && <button type="button" className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white hover:bg-violet-500"
              onClick={e => solicitar('aprovar-conclusao', e.currentTarget)}>Aprovar</button>}
          </div>}
        {estado === 'REGISTRADA' && permissoes?.editarAtividades && <BotaoEditarModal rotulo="Editar atividade" onClick={e => {
            setDetalheAberto(false);
            if (onEditar) onEditar(atividade, e.currentTarget);
            else { setGatilhoEdicao(e.currentTarget); setEdicaoAberta(true); }
          }} />}
        {(['solicitar-conclusao','reabrir','arquivar','reativar','excluir'] as const).some(acaoDisponivel) && <MenuAcoesObjeto rotulo={estado === 'VERIFICADA' || estado === 'ARQUIVADA' ? 'Reabrir' : 'Fechar'}
          pendenteConclusao={estado === 'PENDENTE_CONCLUSAO'}
          acaoDireta={estado === 'VERIFICADA' && acaoDisponivel('reabrir') ? () => solicitar('reabrir', null)
            : estado === 'ARQUIVADA' && acaoDisponivel('reativar') ? () => solicitar('reativar', null) : undefined}>
          {(['solicitar-conclusao','reabrir','arquivar','reativar','excluir'] as const).filter(acao => acao !== 'excluir' && acaoDisponivel(acao)).map(acao =>
            <BotaoAcaoModal key={acao} intencao={acao} aria-label={`${ROTULO[acao]} atividade`}
              onClick={e => solicitar(acao, e.currentTarget)}><Icone nome={acao}/>{ROTULO[acao]}</BotaoAcaoModal>)}
        </MenuAcoesObjeto>}
        {estado === 'VERIFICADA' && acaoDisponivel('arquivar') && acaoDisponivel('reabrir') && <button type="button" onClick={() => solicitar('arquivar', null)} title="Arquivar atividade verificada" aria-label="Arquivar atividade verificada" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"><Icone nome="arquivar" /></button>}
        {estado === 'ARQUIVADA' && acaoDisponivel('excluir') && <button type="button" onClick={() => solicitar('excluir', null)} title="Excluir atividade arquivada" aria-label="Excluir atividade arquivada" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20">×</button>}
      </>}>
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
        <ol className="flex max-h-[55dvh] flex-col gap-3 overflow-y-auto" aria-label="Lista de entregáveis vinculados">
          {atividade.entregaveis.map((ent, indice) => <li key={ent.id}
            data-entregavel-estado={estadosEntregaveis[ent.id] ?? 'normal'}
            className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 sm:p-4 ${COR_ENTREGAVEL[estadosEntregaveis[ent.id] ?? 'normal']}`} >
            <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold ${COR_ENTREGAVEL[estadosEntregaveis[ent.id] ?? 'normal']}`}>{indice + 1}</span>
            <div className="min-w-0 flex-1"><p title={ent.nome} className="break-words text-sm font-semibold leading-relaxed [overflow-wrap:anywhere]">{ent.nome}</p>
              <p className="mt-1 text-xs text-foreground/55">Entregável vinculado</p>
              <div className="mt-3 space-y-2 border-t border-current/15 pt-3" aria-label={`Ocorrências vinculadas a ${ent.nome}`}>
                {(atividade.ocorrencias ?? []).filter(o => o.entregavelId === ent.id).length ?
                  (atividade.ocorrencias ?? []).filter(o => o.entregavelId === ent.id).map(o =>
                    <div key={o.id} className="rounded-lg border border-current/25 bg-background/50 p-3">
                      <p className="text-xs font-semibold">{o.titulo}</p>
                      <p className="mt-1 text-xs text-foreground/65">{o.status.replaceAll('_', ' ').toLowerCase()}</p>
                    </div>) : <p className="text-xs text-foreground/60">Sem ocorrência vinculada neste entregável.</p>}
              </div></div>
          </li>)}
        </ol>
      </div>
    </ModalEtapa>, document.body)}
    {edicaoAberta && <ModalEdicaoAtividade atividade={atividade} contratoId={contratoId} origem={gatilhoEdicao}
      onFechar={() => setEdicaoAberta(false)} onSalvo={() => { cache?.invalidar(['atividades', contratoId]); onAtualizada?.(); }} />}
    {pendente && createPortal(<ModalEtapa titulo={`${ROTULO[pendente]} atividade`} contexto={atividade.titulo} estadoContextual={estadoModal} camada={dentroEntregavel ? "evidencia" : "principal"} compacto
      ocupado={ocupado} focoRetorno={gatilho} onFechar={() => { if (!ocupado) setPendente(null); }} rotuloFechar="Fechar confirmação">
      <form className="space-y-4" onSubmit={confirmar}>
        <p className="text-sm text-foreground/75">{pendente === 'solicitar-conclusao' ? 'A atividade ficará pendente de conclusão até a aprovação de alguém autorizado.' : pendente === 'aprovar-conclusao' ? 'Aprovar confirmará a execução desta atividade e registrará a verificação.' : pendente === 'excluir' ? 'Esta atividade arquivada será retirada das listas, mas seus vínculos e sua trilha de auditoria serão preservados.' : 'A operação ficará registrada na rastreabilidade do contrato.'}</p>
        {!['solicitar-conclusao', 'aprovar-conclusao'].includes(pendente) && <div className="space-y-1.5">
          <label htmlFor={`${justificativaAjudaId}-campo`} className="block text-sm font-semibold">Justificativa *</label>
          <p id={`${justificativaAjudaId}-orientacao`} className="text-xs text-foreground/65">Obrigatória: mínimo de 15 e máximo de 200 caracteres.</p>
          <textarea id={`${justificativaAjudaId}-campo`} aria-describedby={`${justificativaAjudaId}-orientacao ${justificativaAjudaId}-contador`}
            aria-invalid={motivo.length > 0 && motivo.trim().length < 15} value={motivo} onChange={e => setMotivo(e.target.value)}
            required minLength={15} maxLength={200} rows={3}
            className={`w-full rounded-lg border ${coresModalAcao.borda} bg-background p-3 text-sm text-foreground focus-visible:outline-2 ${coresModalAcao.foco}`} />
          <p id={`${justificativaAjudaId}-contador`} aria-live="polite" className="text-right text-xs tabular-nums text-foreground/60">{motivo.length}/200 caracteres</p>
        </div>}
        {erro && <p role="alert" className="rounded-lg border border-error-text/35 p-2 text-sm text-error-text">{erro}</p>}
        <div className={`flex justify-end gap-2 border-t ${coresModalAcao.borda} pt-3`}><button type="button" onClick={() => setPendente(null)} disabled={ocupado} className={`rounded-lg border ${coresModalAcao.borda} px-3 py-2 text-sm`}>Cancelar</button>
          <button type="submit" aria-busy={ocupado} disabled={ocupado} className={`rounded-lg px-4 py-2 text-sm font-semibold ${coresModalAcao.botao}`}>{ocupado ? 'Processando...' : `Confirmar ${ROTULO[pendente].toLowerCase()}`}</button></div>
      </form>
    </ModalEtapa>, document.body)}
  </article>;
}
