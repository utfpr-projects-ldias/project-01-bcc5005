'use client';
import { useEffect, useRef, useState, type Ref } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import { calcularIndicadoresContrato } from '@/lib/indicadores-contrato';
import { apresentarFracao, CORES_COMPROVACAO, tomComprovacao } from '@/lib/apresentacao-indicadores';

export function useIndicadoresPlanejamentoContrato(contratoId: string, habilitado = true) {
  const etapas = useEtapas(contratoId, habilitado);
  const entregaveis = useEntregaveis(contratoId, habilitado);
  const documental = useResumoDocumentalContrato(contratoId, habilitado);
  const erro = etapas.erro || entregaveis.erro || documental.erro;
  const pronto = habilitado && !erro && Array.isArray(etapas.dados) && Array.isArray(entregaveis.dados) && Boolean(documental.dados);
  const indicadores = pronto ? calcularIndicadoresContrato(contratoId, etapas.dados!, entregaveis.dados!, documental.dados!) : null;
  return { indicadores, erro };
}

export function ResumoPlanejamentoContrato({ contratoId, variante = 'carteira', compactoNaLista = false }: {
  contratoId: string; variante?: 'carteira' | 'detalhe' | 'lateral'; compactoNaLista?: boolean; contratoArquivado?: boolean; contratoSuspenso?: boolean; contratoEmRevisao?: boolean; contratoEncerrado?: boolean; contratoConcluido?: boolean; contratoCancelado?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visivel, setVisivel] = useState(false);
  useEffect(() => {
    const alvo = ref.current;
    if (!alvo || typeof IntersectionObserver === 'undefined') return;
    const observar = new IntersectionObserver(entradas => {
      if (entradas.some(entrada => entrada.isIntersecting)) setVisivel(true);
    }, { rootMargin: '200px' });
    observar.observe(alvo);
    return () => observar.disconnect();
  }, []);
  const habilitado = visivel || typeof IntersectionObserver === 'undefined';
  const { indicadores, erro } = useIndicadoresPlanejamentoContrato(contratoId, habilitado);
  return <IndicadoresPlanejamento observadorRef={ref} indicadores={indicadores} erro={Boolean(erro)} variante={variante} compactoNaLista={compactoNaLista} />;
}

/** Mesma apresentação no painel e na carteira; a comprovação lateral passa para a execução. */
export function IndicadoresPlanejamento({ indicadores, erro = false, variante = 'carteira', compactoNaLista = false, observadorRef }: { observadorRef?: Ref<HTMLDivElement>; indicadores: ReturnType<typeof calcularIndicadoresContrato> | null; erro?: boolean; variante?: 'carteira' | 'detalhe' | 'lateral'; compactoNaLista?: boolean }) {
  const progresso = indicadores ? [
    { nome: 'Etapas', valor: indicadores.etapas.concluidas, total: indicadores.etapas.total, descricao: 'etapas finalizadas' },
    { nome: 'Entregáveis', valor: indicadores.entregaveis.concluidos, total: indicadores.entregaveis.total, descricao: 'entregáveis finalizados' },
    { nome: 'Evidências', valor: indicadores.evidencias.feitas, total: indicadores.evidencias.total, descricao: 'evidências verificadas' },
    { nome: 'Comprovação', valor: indicadores.comprovacao.feitas, total: indicadores.comprovacao.total, descricao: 'exigências obrigatórias atendidas' },
  ].filter(item => variante !== 'lateral' || item.nome !== 'Comprovação') : [];
  return <div ref={observadorRef} data-testid="resumo-planejamento-contrato"
    data-documental-completo={indicadores?.documentacaoCompleta ? 'true' : 'false'}
    className={`grid min-w-0 items-start gap-2 text-center ${variante === 'lateral' ? 'pi-planejamento-lateral grid-cols-3' : variante === 'carteira' ? `grid-cols-4 w-full ${compactoNaLista ? 'max-w-[22rem]' : 'max-w-[24rem]'}` : 'grid-cols-4 py-1'}`}>
    {erro ? <p role="status" className="col-span-full text-foreground/65">Indicadores indisponíveis.</p> :
    !indicadores ? <p role="status" className="col-span-full text-foreground/60">Consultando planejamento...</p> : progresso.map(item => {
      const documental = item.nome === 'Evidências' || item.nome === 'Comprovação';
      const fracao = documental && !indicadores.documentacaoDisponivel ? apresentarFracao() : apresentarFracao(item.valor,item.total);
      const taxa = fracao.percentual ?? 0;
      const semDestaque = fracao.estado !== 'aplicavel';
      const corComprovacao = CORES_COMPROVACAO[tomComprovacao(item.valor,item.total)];
      return <section key={item.nome} aria-label={`Resumo de ${item.nome.toLowerCase()}`} data-pi-contagem={fracao.estado} className="flex min-w-0 flex-col items-center gap-1">
        <h4 className={`max-w-full text-[clamp(.6rem,.72vw,.75rem)] font-semibold leading-tight [overflow-wrap:normal] ${semDestaque ? 'text-foreground/60' : 'text-foreground'}`}>{item.nome}</h4>
        <div role="img" aria-label={fracao.estado === 'indisponivel' ? `${item.nome}: indisponível` : `${item.valor} de ${item.total} ${item.descricao}`} className="aspect-square w-full max-w-[60px]" data-percentual={fracao.percentual ?? undefined}>
          <svg aria-hidden="true" viewBox="0 0 64 64" className="h-full w-full">
            <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeOpacity=".15" strokeWidth="6" className="text-foreground" />
            {taxa > 0 && <circle cx="32" cy="32" r="27" fill="none" stroke="currentColor" strokeWidth="6" pathLength="100" strokeDasharray={`${taxa} 100`} transform="rotate(-90 32 32)" strokeLinecap="round" className={item.nome === 'Etapas' || item.nome === 'Entregáveis' ? 'text-violet-600 dark:text-violet-400' : item.nome === 'Evidências' ? 'text-teal-600 dark:text-teal-400' : corComprovacao} />}
            <text x="32" y="32" dominantBaseline="central" textAnchor="middle" fontSize={item.total >= 100 ? 11 : 14} fontWeight="600" fill="currentColor" className={`tabular-nums ${semDestaque ? 'text-foreground/60' : item.nome === 'Comprovação' ? corComprovacao : 'text-foreground'}`}>{fracao.texto}</text>
          </svg>
        </div>
      </section>;
    })}
  </div>;
}
