'use client';
import { BotaoExcluirModal, BotaoAcaoModal, BotaoEditarModal } from '@/app/components/botoes-modal';
import { modalidadeEncerramento } from '@/lib/modalidade-encerramento';
import { consultarCompartilhada } from '@/lib/atividades-compartilhadas';
import { ContadoresVinculos } from '@/app/components/contadores-vinculos';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';


import { IconeReabertura } from '@/app/components/icones-ciclo-vida';


import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRepositorioConsultasOpcional, useConsulta } from '@/app/components/provedor-consultas';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';

import { IconeEngrenagem } from '@/app/components/icone-engrenagem';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { estadoContextualContrato } from '@/lib/estado-visivel-contrato';
import { IndicadoresPlanejamento, useIndicadoresPlanejamentoContrato } from '@/app/contratos/components/resumo-planejamento-contrato';
import { PainelLateralContrato, NumeroComprovacoes, SetaPainelContrato, precisaPainelExpansivel } from '@/app/contratos/components/painel-lateral-contrato';
import { sincronizarEvidenciaCompartilhada } from '@/lib/sincronizar-evidencia-compartilhada';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { useProgresso } from '@/hooks/use-progresso';
import { ProgressoCircular } from '@/app/components/progresso-circular';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { justificativaAtividadeSchema } from '@/lib/validacao-atividade';
import { transicionarAtividadeApi, type Atividade, type EstadoAtividade } from '@/hooks/use-atividades';
import type { Entregavel } from '@/lib/entregaveis';
import { chaveTexto } from '@/lib/repositorio-consultas';
import { consultarElegibilidadeConclusao, type Contrato } from '@/lib/contratos';
import { contextoDaDecisao, coresDecisao } from '@/lib/cores-decisoes';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { ModalVinculosAtividade } from './modal-vinculos-atividade';
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
export type EstadoVisualEntregavel = 'normal' | 'nao-iniciado' | 'revisao' | 'concluido' | 'parcial' | 'pendente' | 'finalizado' | 'arquivado';
export function statusVisualEntregavel(ent: Pick<Entregavel, 'arquivadoEm' | 'reabertoEm' | 'statusExecucao'>): EstadoVisualEntregavel {
  if (ent.arquivadoEm) return 'arquivado';
  if (['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(ent.statusExecucao ?? '')) return 'pendente';
  if (ent.reabertoEm) return 'revisao';
  if (ent.statusExecucao === 'CONCLUIDO') return 'concluido';
  if (ent.statusExecucao === 'CONCLUIDO_PARCIALMENTE') return 'parcial';
  if (ent.statusExecucao === 'FINALIZADO') return 'finalizado';
  if (!ent.statusExecucao || ent.statusExecucao === 'NAO_INICIADO') return 'nao-iniciado';
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

/** Mesmo ícone de contrato utilizado na navegação lateral. */
export function IconeContrato({ tamanho = 18 }: { tamanho?: number }) {
  return <svg aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 5V3h8v2M7 10h10M7 14h7" /></svg>;
}
export function abrirContratoContextual(_contratoId: string, gatilho: HTMLElement, mostrarPainel: (gatilho: HTMLElement) => void, _navegar: (url: string) => void) {
  // Assinatura mantida para os chamadores legados; nunca navegar fora do painel.
  void _navegar;
  mostrarPainel(gatilho);
}

/** Modal compartilhado para abrir contratos pela carteira ou pelo diário.
 * A rota interna ainda alimenta o conteúdo do iframe, mas não é uma opção de navegação do usuário.
 */
export function PreviaContrato({ contratoId, fechar, foco, destinoInicial }: { contratoId: string; fechar: () => void; foco: HTMLElement | null; destinoInicial?: {etapaId:string;entregavelId?:string} }) {
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
  const encerramentoElegivel = Boolean(contrato && !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && !['SUSPENSO','CANCELADO','CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO'].includes(contrato.status));
  const podeSolicitar = Boolean(admin || acessoContrato.dados?.permissoes?.editarContrato);
  const regularizacaoElegivel = Boolean(contrato?.status === 'CONCLUIDO_PARCIALMENTE' && !contrato.arquivadoEm && !contrato.conclusaoSolicitadaEm && elegibilidade.dados?.apto && podeSolicitar);
  const arquivoPermitido = Boolean(admin && contrato && !contrato.arquivadoEm && !['SUSPENSO','CANCELADO'].includes(contrato.status) && !contrato.conclusaoSolicitadaEm && !contrato.encerramentoSolicitado);
  const enviarAcao = (acao: string) => iframeRef.current?.contentWindow?.postMessage({tipo:'pi:acao-contrato',contratoId,acao},window.location.origin);
  const acaoReabrir = contrato?.arquivadoEm ? 'reativar' : contrato?.conclusaoSolicitadaEm ? null : contrato?.status === 'CANCELADO' ? 'reverter-cancelamento'
    : contrato?.status === 'SUSPENSO' ? 'retomar'
    : contrato && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO'].includes(contrato.status) ? 'reabrir' : null;
  const podeReabrir = acaoReabrir === 'reativar' ? admin : acaoReabrir === 'reverter-cancelamento' ? permitido('reverterCancelamentoContrato')
    : acaoReabrir === 'retomar' ? permitido('retomarContrato')
    : acaoReabrir === 'reabrir' ? permitido('reabrirContrato') : false;
  const estadoModalContrato = estadoContextualContrato(contrato, Boolean(contrato?.conclusaoSolicitadaEm));
  const planejamento = useIndicadoresPlanejamentoContrato(contratoId);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const corpoRef = useRef<HTMLDivElement>(null);
  const [compacto, setCompacto] = useState(false);
  const [painelAberto, setPainelAberto] = useState(false);
  const [etapaSobreposta, setEtapaSobreposta] = useState(false);
  const modoPainelRef = useRef({compacto, aberto:painelAberto});
  useLayoutEffect(() => { modoPainelRef.current = {compacto, aberto:painelAberto}; },[compacto,painelAberto]);
  const devolverFocoPainel = useRef(false);
  const acaoAdiada = useRef<Record<string,unknown> | null>(null);
  const sincronizarPainel = (restaurarFoco = false) => {
    const {compacto,aberto} = modoPainelRef.current;
    iframeRef.current?.contentWindow?.postMessage({tipo:'pi:estado-painel-contrato',contratoId,compacto,aberto:compacto&&aberto,restaurarFoco},window.location.origin);
  };
  function fecharPainelLateral(restaurarFoco = true) {
    devolverFocoPainel.current = restaurarFoco;
    setPainelAberto(false);
  }
  function acaoNoConteudo(mensagem: Record<string,unknown>) {
    if (modoPainelRef.current.compacto && modoPainelRef.current.aberto) {
      acaoAdiada.current = mensagem; fecharPainelLateral(false); return;
    }
    iframeRef.current?.contentWindow?.postMessage({...mensagem,contratoId},window.location.origin);
  }
  useLayoutEffect(() => {
    const corpo = corpoRef.current;
    if (!corpo) return;
    const medir = () => {
      const estreito = precisaPainelExpansivel(corpo.clientWidth);
      setCompacto(estreito);
      if (!estreito) {
        if (modoPainelRef.current.compacto && modoPainelRef.current.aberto) devolverFocoPainel.current = true;
        setPainelAberto(false);
      }
    };
    medir();
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(medir);
    observador?.observe(corpo);
    window.addEventListener('resize',medir);
    return () => { observador?.disconnect(); window.removeEventListener('resize',medir); };
  }, []);
  useEffect(() => {
    const quadro = requestAnimationFrame(() => {
      const restaurar = !painelAberto && devolverFocoPainel.current;
      devolverFocoPainel.current = false;
      iframeRef.current?.contentWindow?.postMessage({tipo:'pi:estado-painel-contrato',contratoId,compacto,aberto:compacto&&painelAberto,restaurarFoco:restaurar},window.location.origin);
      if (!painelAberto && acaoAdiada.current) {
        const mensagem = acaoAdiada.current; acaoAdiada.current = null;
        iframeRef.current?.contentWindow?.postMessage({...mensagem,contratoId},window.location.origin);
      }
    });
    return () => cancelAnimationFrame(quadro);
  }, [contratoId,compacto,painelAberto]);
  useEffect(() => {
    const receber = (evento:MessageEvent) => {
      if (evento.origin !== window.location.origin || evento.source !== iframeRef.current?.contentWindow || evento.data?.contratoId !== contratoId) return;
      const modo = modoPainelRef.current;
      if (evento.data.tipo === 'pi:fechar-consulta-direta' && destinoInicial) { fecharAtual.current(); return; }
      if (evento.data.tipo === 'pi:painel-contrato-pronto') {
        iframeRef.current?.contentWindow?.postMessage({tipo:'pi:estado-painel-contrato',contratoId,compacto:modo.compacto,aberto:modo.compacto&&modo.aberto},window.location.origin);
      } else if (evento.data.tipo === 'pi:abrir-painel-contrato' && modo.compacto) setPainelAberto(true);
    };
    window.addEventListener('message',receber);
    return () => window.removeEventListener('message',receber);
  },[contratoId,destinoInicial]);
  const [conteudoPronto, setConteudoPronto] = useState(false);
  const fecharAtual = useRef(fechar);
  useEffect(() => { fecharAtual.current = fechar; }, [fechar]);
  const marcadorHistorico = useRef<string | null>(null);
  function fecharPainel() {
    if (marcadorHistorico.current && window.history.state?.__previaContrato === marcadorHistorico.current) {
      window.history.back();
    } else fecharAtual.current();
  }
  const limparEscutasIframe=useRef<(()=>void)|null>(null);
  useEffect(()=>()=>limparEscutasIframe.current?.(),[]);
  function iframeCarregado() {
    limparEscutasIframe.current?.();
    setConteudoPronto(true);
    sincronizarPainel();
    const janela = iframeRef.current?.contentWindow;
    if (!janela) return;
    // Escape e botões laterais ocorrem dentro do iframe, não propagam ao pai.
    try {
      const teclado=(evento:KeyboardEvent)=>{
        if (evento.key !== 'Escape' || evento.defaultPrevented || evento.repeat || evento.isComposing) return;
        if (janela.document.querySelector('[role="dialog"]:not([aria-hidden="true"]), [role="menu"], [data-pi-painel-temporario][data-aberto="true"], [aria-expanded="true"][aria-haspopup="listbox"]')) return;
        evento.preventDefault(); evento.stopImmediatePropagation();
        if (modoPainelRef.current.compacto && modoPainelRef.current.aberto) fecharPainelLateral(); else fecharPainel();
      };
      const mouse=(evento:MouseEvent)=>{
        if(evento.button!==3 || evento.defaultPrevented)return;
        evento.preventDefault(); evento.stopImmediatePropagation();
        if(janela.document.querySelector('[role="dialog"]:not([aria-hidden="true"]), [data-pi-detalhe-interno]')) {
          (janela.document.activeElement??janela.document.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;
        }
        fecharPainel();
      };
      const fecharMenusPai=()=>window.dispatchEvent(new Event('pi:fechar-menus'));
      janela.addEventListener('keydown',teclado);janela.addEventListener('auxclick',mouse);janela.addEventListener('pointerdown',fecharMenusPai,true);
      limparEscutasIframe.current=()=>{try{janela.removeEventListener('keydown',teclado);janela.removeEventListener('auxclick',mouse);janela.removeEventListener('pointerdown',fecharMenusPai,true);}catch{/* documento substituído */}};
    } catch { /* Um conteúdo externo não recebe escutas; o iframe do contrato é mesma origem. */ }
  }
  useEffect(() => {
    function receber(evento: MessageEvent) {
      if (evento.origin !== window.location.origin || evento.source !== iframeRef.current?.contentWindow) return;
      if (evento.data?.contratoId !== contratoId) return;
      if (evento.data?.tipo === 'pi:etapa-sobreposta' && typeof evento.data.aberta === 'boolean') {
        setEtapaSobreposta(evento.data.aberta);
        return;
      }
      if (evento.data?.tipo === 'pi:estrutura-operacional-atualizada') {
        cacheContrato?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
        cacheContrato?.invalidar(['execucao', contratoId]);
        cacheContrato?.invalidar(['contratos', 'pendentes']);
        cacheContrato?.invalidar(['etapas', 'contrato', contratoId]);
        cacheContrato?.invalidar(['entregaveis', 'contrato', contratoId]);
        return;
      }
      if (evento.data?.tipo === 'pi:contrato-excluido') {
        if (cacheContrato) sincronizarContrato(cacheContrato, contratoId);
        fecharAtual.current(); return;
      }
      if (evento.data?.tipo !== 'pi:contrato-atualizado') return;
      const atualizado = evento.data?.contrato as Contrato | undefined;
      if (!atualizado || atualizado.id !== contratoId) return;
      setContratoConfirmado(atualizado);
      cacheContrato?.gravar(chaveTexto(['contratos', 'detalhe', contratoId]), atualizado);
      if (cacheContrato) sincronizarContrato(cacheContrato, contratoId);
    }
    window.addEventListener('message', receber);
    return () => window.removeEventListener('message', receber);
  }, [contratoId, cacheContrato]);
  const fecharRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    fecharRef.current?.focus({ preventScroll: true });
    const teclado = (e: KeyboardEvent) => {
      if(e.key!=='Escape'||e.defaultPrevented||e.repeat)return;
      e.preventDefault();
      if(modoPainelRef.current.compacto&&modoPainelRef.current.aberto){fecharPainelLateral();return;}
      try {const doc=iframeRef.current?.contentDocument;
        if(doc?.querySelector('[role="dialog"]:not([aria-hidden="true"]), [role="menu"], [data-pi-painel-temporario][data-aberto="true"], [data-pi-detalhe-interno], [data-pi-aba-secundaria="true"]')){
          (doc.activeElement??doc.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;
        }
      } catch { /* iframe da mesma origem em operação normal */ }
      fecharPainel();
    };
    const auxilio = (e: MouseEvent) => {
      if (e.button !== 3 || e.defaultPrevented) return;
      e.preventDefault();
      try {const doc=iframeRef.current?.contentDocument;
        if(doc?.querySelector('[role="dialog"]:not([aria-hidden="true"]), [data-pi-detalhe-interno]')) {
          (doc.activeElement??doc.body).dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));return;
        }
      } catch { /* iframe indisponível */ }
      fecharPainel();
    };
    const marcador = `contrato-${contratoId}-${Date.now()}`;
    marcadorHistorico.current = marcador;
    window.history.pushState({ ...(window.history.state ?? {}), __previaContrato: marcador }, '', window.location.href);
    const voltar = () => {
      if (marcadorHistorico.current === marcador && window.history.state?.__previaContrato !== marcador) {
        marcadorHistorico.current = null;
        fecharAtual.current();
      }
    };
    window.addEventListener('keydown', teclado);
    window.addEventListener('auxclick', auxilio);
    window.addEventListener('popstate', voltar);
    return () => {
      document.body.style.overflow = anterior;
      window.removeEventListener('keydown', teclado);
      window.removeEventListener('auxclick', auxilio);
      window.removeEventListener('popstate', voltar);
      // O botão de fechar (não Back) deve retirar o marcador sem navegar para outra página.
      if (marcadorHistorico.current === marcador && window.history.state?.__previaContrato === marcador) {
        marcadorHistorico.current = null;
        window.history.back();
      }
      if (foco?.isConnected) foco.focus({ preventScroll: true });
    };
    // A instância do modal é a unidade de histórico; não adicionar outro marcador ao rerender.
  }, [contratoId, foco]);
  const percentual = (valor: number | null | undefined) => typeof valor !== 'number' || !Number.isFinite(valor) ? '—' : `${valor.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
  const [ordemDecrescente,setOrdemDecrescente] = useState(true);
  const top = [...(progresso.progresso?.entregaveis ?? [])].sort((a,b)=>{
    if (a.percentualExecucao == null || b.percentualExecucao == null) return a.percentualExecucao == null && b.percentualExecucao == null ? a.nome.localeCompare(b.nome,'pt-BR') : a.percentualExecucao == null ? 1 : -1;
    return (ordemDecrescente ? b.percentualExecucao-a.percentualExecucao : a.percentualExecucao-b.percentualExecucao) || a.nome.localeCompare(b.nome,'pt-BR');
  });
  const avanco = progresso.progresso?.avanco;
  const cobertura = planejamento.indicadores?.documentacaoDisponivel ? planejamento.indicadores.comprovacao : undefined;
  const drawerAtivo = compacto && painelAberto;
  return createPortal(<div data-pi-etapa-sobreposta={etapaSobreposta || undefined} className="fixed inset-0 z-[250] bg-black/65" role="presentation" onMouseDown={e => { if (!etapaSobreposta && e.target === e.currentTarget) fechar(); }}>
    <section data-pi-consulta-direta={Boolean(destinoInicial)||undefined} aria-label={destinoInicial?.entregavelId?"Detalhes do entregável":destinoInicial?"Detalhes da etapa":"Detalhes do contrato"} role="dialog" aria-modal="true" data-tec08-estado={estadoModalContrato}
      className="pi-modal-contrato-entrada pi-contrato-contextual absolute inset-y-2 right-2 left-2 flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-background shadow-[0_20px_90px_rgba(0,0,0,0.6)] sm:inset-y-4 sm:right-4 sm:left-4">
      <header inert={drawerAtivo || etapaSobreposta || undefined} className="sticky top-0 z-10 flex shrink-0 items-center justify-between gap-3 border-b bg-background px-3 py-3 sm:px-5">
        <div className="flex min-w-0 items-center gap-3"><span className="rounded-lg border p-2 pi-contrato-acento"><IconeContrato /></span>
          <div className="min-w-0"><h2 className="truncate font-semibold">{contrato?.codigoPublico ? `Contrato ${contrato.codigoPublico}` : 'Detalhes do contrato'}</h2>
            <p className="min-w-0 truncate text-xs text-foreground/65">{contrato?.objeto ?? 'Visão contextual do contrato'}</p></div></div>
        <div className="flex shrink-0 items-center justify-end gap-2">
          {acaoReabrir && podeReabrir ?
            <div className="flex flex-wrap items-center justify-end gap-1"><button type="button" className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-slate-400/40 bg-slate-500/10 px-3 text-xs font-semibold text-foreground hover:bg-slate-500/20 focus-visible:outline-2 focus-visible:outline-brand-neon"
              disabled={!conteudoPronto} onClick={() => enviarAcao(acaoReabrir)}><IconeReabertura className="h-4 w-4" /> {acaoReabrir === 'reativar' ? 'Reativar' : 'Reabrir'}</button>
              {acaoReabrir === 'reativar' && <BotaoExcluirModal rotulo="Excluir contrato arquivado" disabled={!conteudoPronto} onClick={() => enviarAcao('excluir')}/>}
              {regularizacaoElegivel && <BotaoAcaoModal intencao="solicitar-conclusao" onClick={()=>enviarAcao('solicitar-conclusao')}>Solicitar regularização documental</BotaoAcaoModal>}</div>
            : acaoReabrir === 'reabrir' && regularizacaoElegivel ? <BotaoAcaoModal intencao="solicitar-conclusao" onClick={()=>enviarAcao('solicitar-conclusao')}>Solicitar regularização documental</BotaoAcaoModal>
            : !acaoReabrir && contrato?.conclusaoSolicitadaEm ? <div className="flex items-center gap-2" data-pi-decisao-pendente aria-label={contrato.encerramentoSolicitado ? 'Encerramento do contrato pendente' : 'Conclusão do contrato pendente'}>
                <button type="button" className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300 disabled:opacity-35"
                  disabled={!permitido('concluirContrato')} onClick={()=>enviarAcao('devolver-conclusao')}>Cancelar</button>
                <button type="button" className="rounded-lg border border-green-600/60 bg-green-600/20 px-3 py-2 text-xs font-semibold text-green-800 hover:bg-green-600/30 dark:text-green-200 disabled:opacity-35"
                  disabled={!permitido('concluirContrato')} onClick={()=>enviarAcao('aprovar-conclusao')}>Aprovar</button>
              </div>
            : !acaoReabrir && <MenuAcoesObjeto rotulo="Fechar" disabled={!contrato} pendenteConclusao={Boolean(contrato?.conclusaoSolicitadaEm)}>
            <BotaoAcaoModal intencao="suspender" disabled={!encerramentoElegivel || !permitido('suspenderContrato')} onClick={() => enviarAcao('suspender')}>⏸ Suspender contrato</BotaoAcaoModal>
            <BotaoAcaoModal intencao="cancelar" disabled={!encerramentoElegivel || !permitido('cancelarContrato')} onClick={() => enviarAcao('cancelar')}>✕ Cancelar contrato</BotaoAcaoModal>
            <BotaoAcaoModal intencao="encerrar" disabled={!encerramentoElegivel || !modalidadeEncerramento(permitido('encerrarContrato'),Boolean(elegibilidade.dados?.podeFinalizar && permitido('concluirContrato')))} onClick={() => {const acao=modalidadeEncerramento(permitido('encerrarContrato'),Boolean(elegibilidade.dados?.podeFinalizar && permitido('concluirContrato')));if(acao)enviarAcao(acao);}}>Solicitar encerramento</BotaoAcaoModal>
            <BotaoAcaoModal intencao="solicitar-conclusao" disabled={!encerramentoElegivel || !!contrato?.conclusaoSolicitadaEm || !elegibilidade.dados?.apto || !(admin || acessoContrato.dados?.permissoes?.editarContrato)}
              title={elegibilidade.dados?.pendencias?.[0] ?? 'Solicitar avaliação de conclusão integral'}
              onClick={() => enviarAcao('solicitar-conclusao')}>
              Solicitar conclusão
            </BotaoAcaoModal>
            <BotaoAcaoModal conclusaoParcial intencao="solicitar-conclusao" disabled={!encerramentoElegivel || !podeSolicitar || !elegibilidade.dados?.aptoParcial} onClick={()=>enviarAcao('solicitar-conclusao-parcial')}>Solicitar conclusão parcial</BotaoAcaoModal>
            {Boolean(contrato?.conclusaoSolicitadaEm) && permitido('concluirContrato') && <>
              <BotaoAcaoModal intencao="cancelar" onClick={() => enviarAcao('devolver-conclusao')}>✕ Devolver solicitação</BotaoAcaoModal>
              <BotaoAcaoModal intencao="concluir" onClick={() => enviarAcao('aprovar-conclusao')}>{contrato?.encerramentoSolicitado ? 'Aprovar encerramento' : 'Aprovar conclusão'}</BotaoAcaoModal>
            </>}
            {admin && !contrato?.arquivadoEm && <BotaoAcaoModal intencao="arquivar" disabled={!arquivoPermitido} title={!arquivoPermitido ? 'Reabra ou regularize a situação do contrato antes de arquivar, conforme regras do backend.' : 'Arquivar contrato preservando o histórico'} onClick={() => enviarAcao('arquivar')}>
              Arquivar
            </BotaoAcaoModal>}
          </MenuAcoesObjeto>}
          <button ref={fecharRef} type="button" aria-label="Fechar detalhes do contrato" onClick={fechar} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-xl pi-contrato-acento hover:bg-current/10">×</button>
        </div>
      </header>
      <div ref={corpoRef} data-pi-corpo-contrato className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
        <div inert={drawerAtivo || undefined} className="relative flex min-h-0 min-w-0 flex-1 bg-background">
          {!conteudoPronto && <div role="status" className="sr-only">Consultando contrato.</div>}
          <iframe ref={iframeRef} title="Conteúdo do contrato" src={`/contratos/painel/${encodeURIComponent(contratoId)}?${new URLSearchParams({painel:"1",...(destinoInicial?{consultaDireta:"1",etapa:destinoInicial.etapaId,...(destinoInicial.entregavelId?{entregavel:destinoInicial.entregavelId}:{})}:{})}).toString()}`}
            onLoad={iframeCarregado} loading="eager" className={`absolute inset-0 h-full w-full border-0 bg-background transition-opacity duration-150 ${conteudoPronto ? 'opacity-100' : 'opacity-0'}`} />
        </div>
        <PainelLateralContrato bloqueado={etapaSobreposta} compacto={compacto} aberto={painelAberto} onFechar={()=>fecharPainelLateral()}>
          <section aria-label="Planejamento do contrato" data-pi-planejamento-lateral className="space-y-2 px-1 py-1"><div className="flex items-center justify-end gap-2">
            <div className="flex shrink-0 items-center gap-1">
            {(admin || acessoContrato.dados?.permissoes?.editarContrato || acessoContrato.dados?.permissoes?.configurarPesos) && <MenuAcoesObjeto rotulo="Configurações do contrato" somenteIcone icone={<IconeEngrenagem tamanho={20}/>}>
              {(admin || acessoContrato.dados?.permissoes?.editarContrato) && <button type="button" disabled={!conteudoPronto || !contrato || Boolean(contrato.arquivadoEm)} onClick={()=>acaoNoConteudo({tipo:'pi:editar-contrato'})}><IconeContrato/> Editar contrato</button>}
              {(admin || acessoContrato.dados?.permissoes?.configurarPesos) && <button type="button" disabled={!conteudoPronto || !progresso.progresso?.editavelPesos} onClick={()=>acaoNoConteudo({tipo:'pi:editar-execucao'})}><svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7"/></svg> Editar execução</button>}
            </MenuAcoesObjeto>}
            {compacto && <button type="button" data-pi-fechar-painel aria-label="Fechar painel do contrato" title="Fechar painel do contrato" className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-foreground/80 hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current" onClick={()=>fecharPainelLateral()}><SetaPainelContrato direcao="direita" /></button>}
            </div>
          </div>
          <IndicadoresPlanejamento indicadores={planejamento.indicadores} erro={Boolean(planejamento.erro)} variante="lateral" />
          </section>
          <hr className="border-0 border-t border-slate-500/25" data-pi-divisoria-painel />
          <section aria-label="Execução física" data-pi-execucao-lateral className="space-y-3 px-2 py-1 text-current">
            <h3 className="text-center text-sm font-semibold pi-contrato-acento">Execução física</h3>
            <div className="grid grid-cols-2 items-start gap-2">
              <div className="flex flex-col items-center gap-1 text-center">
                <ProgressoCircular valor={avanco} nome="contrato" tamanho="grande" />
                <span className="text-xs text-foreground/65">Execução</span>

              </div>
              <NumeroComprovacoes feitas={cobertura?.feitas} total={cobertura?.total} />
            </div>
            <div className="flex items-center gap-2 text-xs text-foreground/65">{progresso.progresso?.modoCalculo==='PONDERADO'&&progresso.progresso.configuracaoPendente&&<AvisoPesos incompleto={progresso.progresso.somaPesos}/>}<p>{progresso.progresso?.modoCalculo === 'PONDERADO' ? 'Média ponderada' : 'Média simples'} · {top.length} {top.length===1?'entregável':'entregáveis'}</p></div><hr className="border-0 border-t border-current/15"/><div className="flex justify-start"><button type="button" onClick={()=>setOrdemDecrescente(v=>!v)} aria-label={ordemDecrescente?'Maior progresso primeiro; inverter ordem':'Menor progresso primeiro; inverter ordem'} title={ordemDecrescente?'Maior progresso primeiro':'Menor progresso primeiro'} className="pi-ordenacao-avanco"><svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={ordemDecrescente?'M12 4v16m-5-5 5 5 5-5':'M12 20V4m-5 5 5-5 5 5'}/></svg><span>Avanço</span></button></div>
            <div className="space-y-1.5">
              {top.map(ent => <button type="button" key={ent.entregavelId} disabled={!conteudoPronto} onClick={()=>acaoNoConteudo({tipo:'pi:abrir-entregavel',entregavelId:ent.entregavelId})} data-pi-entregavel-lateral className="pi-entregavel-lateral-item block w-full min-w-0 rounded-md border border-slate-500/30 bg-transparent px-2.5 py-2 text-left text-xs text-foreground hover:bg-foreground/5 focus-visible:outline-2 focus-visible:outline-current disabled:opacity-50">
                <span className="pi-lateral-titulo-v24"><span className="min-w-0 flex-1 truncate font-medium" title={ent.nome}>{ent.nome}</span><EtiquetaAtraso atrasado={ent.atrasado} finalizadoComAtraso={ent.finalizadoComAtraso}/><strong className="shrink-0 tabular-nums">{percentual(ent.percentualExecucao)}</strong></span>
                <span aria-hidden="true" className="pi-entregavel-lateral-barra"><span style={{width:`${Math.max(0,Math.min(100,ent.percentualExecucao??0))}%`}}/></span>
              </button>)}
              {!top.length && <p className="text-xs text-foreground/60">Nenhum entregável com progresso disponível.</p>}
            </div>
          </section>
        </PainelLateralContrato>
      </div>
    </section>
  </div>, document.body);
}
/** Ícone de caixa: vínculo com entregável, distinto do ícone de contrato. */
export function IconeEntregavel({ tamanho = 15 }: { tamanho?: number }) {
  return <svg data-tec08-icone-entregavel aria-hidden="true" width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Z"/><path d="m3 7 9 4 9-4M12 11v10"/></svg>;
}

function ContadoresAtividade({grupoId,itens}:{grupoId?:string|null;itens:{rotulo:string;total:number|null}[]}) {
 const cache=useRepositorioConsultasOpcional();
 return grupoId&&cache?<ContadoresGrupoAtividade grupoId={grupoId} itens={itens}/>:<ContadoresVinculos itens={itens}/>;
}
function ContadoresGrupoAtividade({grupoId,itens}:{grupoId:string;itens:{rotulo:string;total:number|null}[]}) {
 const consulta=useConsulta(['atividades','compartilhada',grupoId],()=>consultarCompartilhada(grupoId),{validadeMs:30000});
 return <ContadoresVinculos itens={itens.map(i=>i.rotulo==='Contratos'?{...i,total:consulta.dados?.total??null}:i)}/>;
}

/** O MESMO cartão para diário, contrato, modal e entregável; ações autorizadas pela API. */
export function CartaoAtividade({ atividade, contratoId, permissoes, compacto = false, diario = false, onAbrirEntregavel,onAbrirOcorrencia,onEditar, onAtualizada, dentroEntregavel = false, abrirDetalhesInicialmente = false, aoFecharDetalhe }: {
  atividade: Atividade; contratoId: string; permissoes?: PermissoesAtividade; compacto?: boolean; diario?:boolean; onAbrirEntregavel?:(id:string,origem?:HTMLElement)=>void; onAbrirOcorrencia?:(id:string)=>void;
  onEditar?: (atividade: Atividade, gatilho: HTMLButtonElement) => void; onAtualizada?: () => void; dentroEntregavel?: boolean; abrirDetalhesInicialmente?: boolean; aoFecharDetalhe?:()=>void;
  estadosEntregaveis?: Record<string, EstadoVisualEntregavel>; etapasPorId?: Record<string,string>;
}) {
  const cache = useRepositorioConsultasOpcional();
  const [pendente, setPendente] = useState<Acao | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [gatilho, setGatilho] = useState<HTMLElement | null>(null);
  const [detalheAberto, setDetalheAberto] = useState(abrirDetalhesInicialmente);
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
      if(atividade.atividadeCompartilhadaId && ['aprovar-conclusao','solicitar-conclusao'].includes(pendente))sincronizarEvidenciaCompartilhada(cache,contratoId);
      cache?.invalidar(['atividades', contratoId]);
      // Verificar a última atividade pode concluir entregável e etapa no backend.
      // Atualizar também os detalhes, cards e resumos documentais relacionados.
      cache?.invalidar(['ocorrencias', contratoId]);
      cache?.invalidar(['execucao', contratoId]);
      cache?.invalidar(['entregaveis', 'contrato', contratoId]);
      cache?.invalidar(['etapas', 'contrato', contratoId]);
      cache?.invalidar(['contratos']);
      onAtualizada?.();
      window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', { detail: { contratoId } }));
      if (window.parent !== window) window.parent.postMessage({ tipo: 'pi:estrutura-operacional-atualizada', contratoId }, window.location.origin);
      setPendente(null); setMotivo('');
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível executar a operação.'); }
    finally { setOcupado(false); }
  }
  const contadores = [{rotulo:'Contratos',total:atividade.atividadeCompartilhadaId?null:1},{rotulo:atividade.atividadeCompartilhadaId?'Entregáveis neste contrato':'Entregáveis',total:new Set(atividade.entregaveis.map(e=>e.id)).size},{rotulo:atividade.atividadeCompartilhadaId?'Ocorrências neste contrato':'Ocorrências',total:new Set([...(atividade.ocorrencias??[]).map(o=>o.id),...(atividade.ocorrenciaIds??[]),...(atividade.ocorrenciaId?[atividade.ocorrenciaId]:[])]).size},{rotulo:'Evidências',total:atividade.comprovantesVinculados??null}];
  function abrirDetalheCard() {
    // Abre o diálogo real, sem camada intermediária de carregamento.
    setDetalheAberto(true);
  }
  function solicitar(acao: Acao, elemento: HTMLButtonElement | null) { setGatilho(elemento); setPendente(acao); setMotivo(''); setErro(''); }
  return <article data-tec08-item-clicavel data-pi-card-agenda={compacto && !diario || undefined} data-pi-card-compacto-v18 data-atividade-id={atividade.id} data-atividade-estado={estado}
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
    {diario ? <div className="pi-diario-card pointer-events-none relative z-[2]">
      <div className="flex min-w-0 items-center gap-3">
        <span className="pi-diario-icone" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span>
        <div className="min-w-0 flex-1">
          <button type="button" aria-label={`Ver detalhes da atividade ${atividade.titulo}`} onClick={abrirDetalheCard} className="pointer-events-auto block max-w-full truncate text-left text-sm font-semibold hover:underline" title={atividade.titulo}>{atividade.titulo}</button>
          <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-foreground/65">
            <ContadoresAtividade grupoId={atividade.atividadeCompartilhadaId} itens={contadores}/>
          </div>
          <p className="mt-1 truncate text-xs text-foreground/60" title={[atividade.tipo,atividade.responsavel,atividade.descricao].filter(Boolean).join(' · ')}><time dateTime={atividade.dataHora}>{new Date(atividade.dataHora).toLocaleTimeString('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'})}</time>{atividade.duracao?` · ${atividade.duracao}`:''}{atividade.responsavel?` · ${atividade.responsavel}`:''}</p>
        </div>
      </div>
      <div className="pi-diario-contribuicao min-w-0 text-xs">
        {atividade.contribuicoesDiario?.length===1&&(()=>{const c=atividade.contribuicoesDiario[0];return <p className="truncate font-semibold" data-reconhecida={c.reconhecida} data-situacao={c.situacao}>{c.reconhecida?'+':''}{c.valor.toLocaleString('pt-BR',{maximumFractionDigits:3})}{c.unidade==='%'?'%':` ${c.unidade}`}{!c.reconhecida&&<span className="block font-normal text-foreground/65">{c.situacao==='PENDENTE'?'Pendente':'Não reconhecida'}</span>}</p>;})()}
        {(atividade.contribuicoesDiario?.length??0)>1&&<span className="text-foreground/65">{atividade.contribuicoesDiario!.length} contribuições</span>}
      </div>
      <div className="pi-diario-situacao flex min-w-0 items-center justify-end gap-2 text-xs"><span data-situacao={estado} className="pi-diario-etiqueta">{situacao.titulo}</span><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="shrink-0 text-foreground/50"><path d="m9 6 6 6-6 6"/></svg></div>
    </div> : <>    <div className="pointer-events-none relative z-[2]">
    <div className="pi-card-atividade-cabecalho flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1"><button type="button" aria-label={`Ver detalhes da atividade ${atividade.titulo}`} onClick={abrirDetalheCard} className={`pi-card-atividade-titulo pointer-events-auto block max-w-full truncate text-left font-semibold ${cores.texto} focus-visible:underline focus-visible:outline-2`}>{atividade.titulo}</button>
        <p className="text-xs text-foreground/65"><time dateTime={atividade.dataHora}>{new Date(atividade.dataHora).toLocaleString('pt-BR')}</time> · {atividade.tipo}</p></div>
      <span className="pi-diario-etiqueta shrink-0" data-situacao={estado}>{situacao.titulo}</span>
    </div>
    <p className="mt-1 truncate text-xs text-foreground/65">{atividade.responsavel ? `Responsável: ${atividade.responsavel}` : 'Responsável não informado'}</p>
    <div className="mt-1"><ContadoresAtividade grupoId={atividade.atividadeCompartilhadaId} itens={contadores}/></div>

    </div>
</>}
    {detalheAberto && createPortal(<ModalEtapa bloqueadoPorSubmodal={listaEntregaveisAberta||!!pendente} titulo={atividade.titulo} contexto="Detalhes da atividade" estadoContextual={estadoModal} camada={dentroEntregavel ? "evidencia" : "principal"} compacto larguraFormulario="atividade"
      ocupado={false} onFechar={() => {setDetalheAberto(false);aoFecharDetalhe?.();}} rotuloFechar="Fechar detalhes da atividade"
      acoes={<>
        {estado === 'PENDENTE_CONCLUSAO' && (permissoes?.editarAtividades || permissoes?.verificarAtividades) &&
          <div className="flex items-center gap-2">
            {acaoDisponivel('cancelar-solicitacao') && <button type="button" className="rounded-lg border border-red-500/60 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300"
              onClick={e => solicitar('cancelar-solicitacao', e.currentTarget)}>Cancelar</button>}
            {acaoDisponivel('aprovar-conclusao') && <button type="button" className="rounded-lg border border-green-600/60 bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600"
              onClick={e => solicitar('aprovar-conclusao', e.currentTarget)}>Aprovar</button>}
          </div>}
        {estado === 'REGISTRADA' && permissoes?.editarAtividades && <BotaoEditarModal rotulo="Editar atividade" onClick={e => {
            setDetalheAberto(false);
            if (onEditar) onEditar(atividade, e.currentTarget);
            else { setGatilhoEdicao(e.currentTarget); setEdicaoAberta(true); }
          }} />}
        {(['solicitar-conclusao','reabrir','arquivar','reativar','excluir'] as const).some(acaoDisponivel) && <MenuAcoesObjeto rotulo={estado === 'ARQUIVADA' ? 'Reativar' : estado === 'VERIFICADA' ? 'Reabrir' : 'Fechar'}
          pendenteConclusao={estado === 'PENDENTE_CONCLUSAO'}
          acaoDireta={estado === 'VERIFICADA' && acaoDisponivel('reabrir') ? () => solicitar('reabrir', null)
            : estado === 'ARQUIVADA' && acaoDisponivel('reativar') ? () => solicitar('reativar', null) : undefined}>
          {(['solicitar-conclusao','reabrir','arquivar','reativar','excluir'] as const).filter(acao => acao !== 'excluir' && acaoDisponivel(acao)).map(acao =>
            <BotaoAcaoModal key={acao} intencao={acao} aria-label={`${ROTULO[acao]} atividade`}
              onClick={e => solicitar(acao, e.currentTarget)}>{acao !== 'solicitar-conclusao' && acao !== 'reabrir' ? <Icone nome={acao}/> : null}{ROTULO[acao]}</BotaoAcaoModal>)}
        </MenuAcoesObjeto>}
        {estado === 'VERIFICADA' && acaoDisponivel('arquivar') && acaoDisponivel('reabrir') && <button type="button" onClick={() => solicitar('arquivar', null)} title="Arquivar atividade verificada" aria-label="Arquivar atividade verificada" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-orange-500/45 bg-orange-500/10 text-orange-700 dark:text-orange-300 hover:bg-orange-500/20"><Icone nome="arquivar" /></button>}
        {estado === 'ARQUIVADA' && acaoDisponivel('excluir') && <BotaoExcluirModal rotulo="Excluir atividade arquivada" onClick={() => solicitar('excluir', null)}/>}
      </>}>
      <div className="space-y-4 text-sm" data-testid="detalhe-atividade-modal">
        {!!atividade.contribuicoesDiario?.length&&<details className="rounded-lg border border-current/15 p-3"><summary className="cursor-pointer font-medium">Contribuições físicas ({atividade.contribuicoesDiario.length})</summary><div className="mt-2 divide-y divide-current/10">{atividade.contribuicoesDiario.map((c,i)=><div key={`${c.entregavelId}:${c.ocorrenciaId}:${i}`} className="flex min-w-0 items-center justify-between gap-2 py-2"><span className="min-w-0 truncate" title={c.destino}>{c.destino}</span><strong className="shrink-0 tabular-nums">{c.valor.toLocaleString('pt-BR',{maximumFractionDigits:3})}{c.unidade==='%'?'%':` ${c.unidade}`} · {c.reconhecida?'Reconhecida':c.situacao==='PENDENTE'?'Pendente':'Não reconhecida'}</strong></div>)}</div></details>}
        <div className="flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full border px-3 py-1 text-xs ${situacao.estilo}`}>{situacao.titulo}</span>
          <time className="text-xs text-foreground/65" dateTime={atividade.dataHora}>{new Date(atividade.dataHora).toLocaleString('pt-BR')}</time></div>
        <div className="border-b border-slate-500/20 pb-3"><p className="text-xs text-foreground/60">Tipo · {atividade.tipo}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-foreground/90">{atividade.descricao}</p></div>
        <dl className="grid gap-x-6 gap-y-3 border-b border-slate-500/20 pb-3 sm:grid-cols-2 lg:grid-cols-3">
          {([['Responsável', atividade.responsavel], ['Duração', atividade.duracao], ['Local', atividade.local], ['Participantes', atividade.participantes?.join(', ')], ['Observações', atividade.observacoes]] as const).map(([nome, valor]) =>
            <div key={nome} className="min-w-0"><dt className="text-xs text-foreground/60">{nome}</dt><dd className="mt-1 whitespace-pre-wrap break-words">{valor || 'Não informado'}</dd></div>)}
        </dl>
        {atividade.contribuicoesDiario && <section aria-label="Contribuições físicas da atividade" className="space-y-2 border-b border-slate-500/20 pb-3">
          <h3 className="text-sm font-semibold">Execução física</h3>
          {atividade.contribuicoesDiario.length===0?<p className="text-xs text-foreground/65">Sem contribuição física adicional.</p>:<ul className="divide-y divide-slate-500/15">{atividade.contribuicoesDiario.map((c,i)=><li key={`${c.entregavelId}:${c.ocorrenciaId}:${i}`} className="flex flex-wrap items-center justify-between gap-2 py-2"><div className="min-w-0"><p className="break-words font-medium">{c.destino}</p><p className="text-xs text-foreground/65">{c.reconhecida?'Reconhecida':c.situacao==='PENDENTE'?'Aguardando reconhecimento':'Não reconhecida'}{c.ocorrenciaId&&` · ${atividade.ocorrencias?.find(o=>o.id===c.ocorrenciaId)?.titulo??'Ocorrência vinculada'}`}</p></div><strong className="tabular-nums">{c.reconhecida?'+':''}{c.valor.toLocaleString('pt-BR',{maximumFractionDigits:3})}{c.unidade==='%'?'%':` ${c.unidade}`}</strong></li>)}</ul>}
        </section>}
        <button type="button" className="pi-atividade-vinculos-resumo" onClick={()=>setListaEntregaveisAberta(true)}><span className="font-semibold">Vínculos</span><ContadoresAtividade grupoId={atividade.atividadeCompartilhadaId} itens={contadores}/><span aria-hidden="true">›</span></button>


      </div>
    </ModalEtapa>, document.body)}
    {listaEntregaveisAberta && <ModalVinculosAtividade atividade={atividade} permissoes={permissoes} fechar={()=>setListaEntregaveisAberta(false)} atualizar={onAtualizada} abrirEntregavel={onAbrirEntregavel?(id,origem)=>{setDetalheAberto(false);onAbrirEntregavel(id,origem);}:undefined} abrirOcorrencia={onAbrirOcorrencia?id=>{setDetalheAberto(false);onAbrirOcorrencia(id);}:undefined}/>}
    {edicaoAberta && <ModalEdicaoAtividade atividade={atividade} contratoId={contratoId} origem={gatilhoEdicao}
      onFechar={() => setEdicaoAberta(false)} onSalvo={() => { cache?.invalidar(['atividades', contratoId]); onAtualizada?.(); }} />}
    {pendente && createPortal(<ModalEtapa titulo={`${ROTULO[pendente]} atividade`} contexto={atividade.titulo} estadoContextual="normal" camada="edicao" compacto larguraFormulario="registro"
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
        <div className="flex justify-end gap-2 pt-3"><button type="button" onClick={() => setPendente(null)} disabled={ocupado} className="rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-400 dark:text-red-300 disabled:opacity-50">Cancelar</button>
          <button type="submit" aria-busy={ocupado} disabled={ocupado} className={`rounded-lg px-4 py-2 text-sm font-semibold ${coresModalAcao.botao}`}>{ocupado ? 'Processando...' : pendente==='aprovar-conclusao'?'Confirmar aprovação':`Confirmar ${ROTULO[pendente].toLowerCase()}`}</button></div>
      </form>
    </ModalEtapa>, document.body)}
  </article>;
}

function AvisoPesos({incompleto}:{incompleto:number|null}){const [aberto,setAberto]=useState(false);const ref=useRef<HTMLDivElement>(null);useEffect(()=>{if(!aberto)return;const fora=(e:PointerEvent)=>{if(e.target instanceof Node&&!ref.current?.contains(e.target))setAberto(false);};const tecla=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setAberto(false);ref.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',fora,true);document.addEventListener('keydown',tecla,true);return()=>{document.removeEventListener('pointerdown',fora,true);document.removeEventListener('keydown',tecla,true);};},[aberto]);return <div ref={ref} className="relative shrink-0"><button type="button" className="pi-aviso-pesos" aria-label="Pesos incompletos" aria-expanded={aberto} onClick={()=>setAberto(v=>!v)}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3 2 21h20L12 3Zm0 6v5m0 3v1"/></svg></button>{aberto&&<div role="status" className="pi-popover-pesos">{incompleto==null?'Distribuição dos pesos indisponível.':incompleto>100?`Pesos excedentes: ${(incompleto-100).toLocaleString('pt-BR')}% acima do total.`:`Pesos incompletos: ${Math.max(0,100-incompleto).toLocaleString('pt-BR',{maximumFractionDigits:4})}% do contrato está desvinculado.`}</div>}</div>;}
