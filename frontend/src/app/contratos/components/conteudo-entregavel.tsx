'use client';
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { dataPlanejada, ROTULOS_PERIODICIDADE, ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';
import { resumoComprovacao } from '@/lib/indicadores-planejamento';

type Campo = [nome: string, valor: string | null | undefined];
function Quadro({ titulo, campos }: { titulo: string; campos: Campo[] }) {
  return <section className="min-w-0 space-y-3 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <h2 className="text-lg font-semibold text-brand-neon">{titulo}</h2>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {campos.map(([nome, valor]) => <div key={nome} className="min-w-0"><dt className="text-xs text-foreground/60">{nome}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words">{valor?.trim() || 'Não informado'}</dd></div>)}
    </dl>
  </section>;
}
export function ConteudoEntregavel({ item, onEditarChecklist }: {
  item: Entregavel; onEditarChecklist?: () => void;
}) {
  const [evidenciaId, setEvidenciaId] = useState<string | null>(null);
  const selecionada = item.evidenciasEsperadas.find(e => e.id === evidenciaId);
  // O painel de detalhe tem rolagem própria. Substituir sua árvore por um detalhe
  // pequeno reduz o scrollHeight e faz o navegador voltar o scrollTop para zero.
  // Capturamos a posição ANTES dessa troca e restauramos no commit do React,
  // antes da pintura, sem scrollIntoView e sem alterar a rolagem do contrato.
  const origem = useRef<{ area: HTMLElement | null; topo: number; esquerda: number;
    paginaY: number; paginaX: number; botao: HTMLButtonElement; evidenciaId: string } | null>(null);
  const restaurarAoVoltar = useRef(false);
  const historicoEvidencia = useRef<string | null>(null);
  const sequenciaEvidencia = useRef(0);
  // Cada nivel de detalhe usa uma entrada própria no histórico; o botão voltar
  // do navegador retorna uma evidência ao entregável, sem fechar o modal-pai.
  useEffect(() => {
    const voltarHistorico = () => {
      const marcador = historicoEvidencia.current;
      if (!marcador || window.history.state?.__modalEvidencia === marcador) return;
      historicoEvidencia.current = null;
      restaurarAoVoltar.current = true;
      setEvidenciaId(null);
    };
    window.addEventListener('popstate', voltarHistorico);
    return () => window.removeEventListener('popstate', voltarHistorico);
  }, []);
  function abrirEvidencia(evento: MouseEvent<HTMLButtonElement>, id: string) {
    const area = evento.currentTarget.closest<HTMLElement>('.overflow-y-auto');
    origem.current = { area, topo: area?.scrollTop ?? 0, esquerda: area?.scrollLeft ?? 0,
      paginaY: window.scrollY, paginaX: window.scrollX, botao: evento.currentTarget, evidenciaId: id };
    restaurarAoVoltar.current = false;
    const marcador = `evidencia:${item.id}:${id}:${++sequenciaEvidencia.current}`;
    const estado = window.history.state;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __modalEvidencia: marcador }, '', window.location.href);
    historicoEvidencia.current = marcador;
    setEvidenciaId(id);
  }
  function voltarAoEntregavel() {
    restaurarAoVoltar.current = true;
    setEvidenciaId(null);
    const marcador = historicoEvidencia.current;
    historicoEvidencia.current = null;
    if (marcador && window.history.state?.__modalEvidencia === marcador) window.history.back();
  }
  useLayoutEffect(() => {
    if (evidenciaId !== null || !restaurarAoVoltar.current) return;
    restaurarAoVoltar.current = false;
    const anterior = origem.current;
    origem.current = null;
    if (!anterior) return;
    if (anterior.area?.isConnected) {
      anterior.area.scrollTop = anterior.topo;
      anterior.area.scrollLeft = anterior.esquerda;
    } else if (window.scrollY !== anterior.paginaY || window.scrollX !== anterior.paginaX) {
      // Compatibilidade com a página completa (sem painel modal externo).
      window.scrollTo({ left: anterior.paginaX, top: anterior.paginaY, behavior: 'instant' });
    }
    // O botão original foi desmontado enquanto o detalhe curto aparecia.
    // Na volta o React cria um NOVO elemento: localizar pelo identificador estável,
    // dentro do mesmo painel, antes de restaurar o foco sem deslocar a rolagem.
    const raiz = anterior.area?.isConnected ? anterior.area : document;
    const botaoAtual = Array.from(raiz.querySelectorAll<HTMLButtonElement>('[data-evidencia-esperada-id]'))
      .find((botao) => botao.dataset.evidenciaEsperadaId === anterior.evidenciaId);
    if (botaoAtual?.isConnected) botaoAtual.focus({ preventScroll: true });
    else if (anterior.botao.isConnected) anterior.botao.focus({ preventScroll: true });
  }, [evidenciaId]);
  const campos: Campo[] = [
    ['Código', item.codigo], ['Tipo', ROTULOS_TIPO[item.tipo]],
    ['Início previsto', dataPlanejada(item.inicioPrevisto)], ['Término previsto', dataPlanejada(item.terminoPrevisto)],
    ['Responsável cadastral', item.responsavel ? `${item.responsavel.nome || 'Nome não informado'} — ${item.responsavel.email}` : item.responsavelId ? 'Responsável atribuído' : null],
    ...(item.tipo === 'QUANTITATIVO' ? [
      ['Quantidade prevista', item.quantidadePrevista], ['Unidade de medida', item.unidadeMedida],
    ] as Campo[] : []),
    ...(item.tipo === 'RECORRENTE' ? [
      ['Periodicidade', item.periodicidade ? ROTULOS_PERIODICIDADE[item.periodicidade] : null],
      ['Configuração de recorrência', item.configuracaoPeriodicidade ? `Versão ${item.configuracaoPeriodicidade.versao}` : null],
    ] as Campo[] : []),
    ['Peso operacional', item.peso === null ? null : `${item.peso}%`],
    ['Observações', item.observacoes],
  ];
  if (selecionada) return <section aria-label="Detalhe da evidência esperada" className="space-y-4"
    onKeyDown={(evento) => { if (evento.key === 'Escape') { evento.preventDefault(); evento.stopPropagation(); voltarAoEntregavel(); } }}>
    <button type="button" onClick={voltarAoEntregavel}
      className="rounded-lg border border-brand-green/45 px-3 py-2 text-sm hover:bg-brand-green/15 focus-visible:outline-2 focus-visible:outline-brand-neon">
      ← Voltar ao entregável
    </button>
    <h2 className="break-words text-xl font-semibold text-brand-neon">{selecionada.tipoEvidencia}</h2>
    <p className="text-sm text-foreground/70">{selecionada.obrigatoria ? 'Evidência obrigatória' : 'Evidência opcional'} no planejamento deste entregável.</p>
    {selecionada.descricao && <p className="whitespace-pre-wrap break-words text-sm">{selecionada.descricao}</p>}
    <div className="rounded-lg border border-amber-500/35 p-3 text-sm" role="note">
      Este item é uma exigência planejada. O envio de comprovantes e a confirmação de entrega ainda não estão disponíveis neste módulo. Nenhum arquivo foi marcado como recebido.
    </div>
  </section>;
  return <div className="min-w-0 space-y-5">
    <header className="min-w-0 space-y-2">
      <p className="text-xs uppercase tracking-wide text-foreground/65">Entregável planejado · {ROTULOS_TIPO[item.tipo]}</p>
      <h1 className="break-words text-2xl font-bold text-brand-neon">{item.nome}</h1>
      {item.descricao && <p className="whitespace-pre-wrap break-words text-sm text-foreground/75">{item.descricao}</p>}
    </header>
    <Quadro titulo="Identificação e planejamento" campos={campos} />
    <section className="space-y-2 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <h2 className="text-lg font-semibold text-brand-neon">Critério de conclusão</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{item.criterioConclusao?.trim() || 'Critério não informado no planejamento.'}</p>
      <p className="text-xs text-foreground/65">O acompanhamento da execução ainda não está disponível. Nenhum progresso é calculado automaticamente nesta tela.</p>
    </section>
    <section className="space-y-3 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-brand-neon">Evidências esperadas</h2>
        {onEditarChecklist && <button type="button" onClick={onEditarChecklist}
          className="rounded-lg border border-brand-green/40 px-3 py-2 text-xs font-semibold hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon">
          Editar checklist
        </button>}
      </div>
      <p className="text-sm text-foreground/70">{item.evidenciasEsperadas.length} prevista(s) · {item.evidenciasEsperadas.filter(e => e.obrigatoria).length} obrigatória(s). O recebimento ainda não é acompanhado.</p>
      {item.evidenciasEsperadas.length === 0 ? <p className="text-sm">Nenhuma evidência esperada configurada.</p> :
        <div className="space-y-4">{([true, false] as const).map(obrigatoria => {
          const grupo = item.evidenciasEsperadas.filter(e => e.obrigatoria === obrigatoria);
          if (!grupo.length) return null;
          return <div key={String(obrigatoria)} className="space-y-2">
            <h3 className={`text-sm font-semibold ${obrigatoria ? 'text-amber-300' : 'text-foreground/70'}`}>
              {obrigatoria ? `Obrigatórias (${grupo.length})` : `Opcionais (${grupo.length})`}
            </h3>
            <ul aria-label={obrigatoria ? 'Evidências obrigatórias' : 'Evidências opcionais'} className="space-y-2">
              {grupo.map(e => <li key={e.id} className={`flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-lg border p-3 ${obrigatoria ? 'border-amber-500/40' : 'border-brand-green/20'}`}>
                <div className="min-w-0"><p className="break-words font-medium text-brand-neon">{e.tipoEvidencia}</p>
                  <span className="text-xs text-foreground/60">{obrigatoria ? 'Obrigatória' : 'Opcional'}</span></div>
                <button type="button" onClick={(evento) => abrirEvidencia(evento, e.id)}
                  data-evidencia-esperada-id={e.id}
                  aria-label={`Ver detalhes da evidência esperada ${e.tipoEvidencia}`}
                  className="shrink-0 rounded-lg border border-brand-green/35 px-3 py-1.5 text-xs font-semibold hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon">
                  Ver detalhes
                </button>
              </li>)}</ul>
          </div>;
        })}</div>}
    </section>
    <section aria-label="Situação da comprovação" className="space-y-2 rounded-2xl border border-brand-green/25 p-4 md:p-6">
      <h2 className="text-base font-semibold text-brand-neon">Situação da comprovação</h2>
      <p className="text-sm">{resumoComprovacao(item)}</p>
      <p className="text-xs text-foreground/65">Arquivos comprovantes recebidos: quantidade indisponível. Não confundir o checklist esperado com documentos enviados.</p>
    </section>
    <section className="space-y-2 rounded-2xl border border-dashed border-brand-green/25 p-4 md:p-6">
      <h2 className="text-base font-semibold">Próximas integrações</h2>
      <p className="text-sm text-foreground/70">O registro de ocorrências, atividades e evidências ainda não está disponível nesta tela.</p>
    </section>
  </div>;
}
