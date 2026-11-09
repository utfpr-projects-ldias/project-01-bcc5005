'use client';

import Link from 'next/link';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { useAtividades } from '@/hooks/use-atividades';

/** A leitura reutiliza a autorização do diário; nenhuma atividade é duplicada. */
function ListaAtividadesVinculadas({ contratoId, entregavelId }: { contratoId: string; entregavelId: string }) {
  const { atividades, total, loading, erro } = useAtividades(contratoId, { entregavelId, limit: 100 });
  return <section aria-label="Atividades vinculadas ao entregável" className="space-y-3 rounded-xl border border-brand-green/20 bg-card p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="text-lg font-semibold">Atividades vinculadas</h3>
      <Link className="text-sm underline underline-offset-2" href="/atividades">Abrir diário</Link>
    </div>
    {loading ? <p role="status" className="text-sm text-foreground/70">Carregando atividades...</p>
      : erro ? <p role="alert" className="text-sm text-error-text">Não foi possível consultar as atividades.</p>
      : atividades.length === 0 ? <p className="text-sm text-foreground/70">Nenhuma atividade vinculada a este entregável.</p>
      : <><p className="text-xs text-foreground/70">{total} atividade(s) no contexto deste entregável.</p>
        <ul className="space-y-2">{atividades.map(atividade => <li key={atividade.id}
          data-atividade-id={atividade.id} className="rounded-lg border border-brand-green/15 p-3">
          <p className="font-medium">{atividade.titulo}</p>
          <p className="text-xs text-foreground/70">{new Date(atividade.dataHora).toLocaleString('pt-BR')} · {atividade.tipo}</p>
          <p className="text-xs text-foreground/70">Atividade {atividade.id.slice(0, 8)} · {atividade.entregaveis.length} entregável(is) vinculado(s)</p>
        </li>)}</ul>
      </>}
  </section>;
}

/** Testes de páginas antigas montam componentes sem provider; no produto o provider está no layout. */
export function AtividadesVinculadas({ contratoId, entregavelId }: { contratoId: string; entregavelId: string }) {
  const repositorio = useRepositorioConsultasOpcional();
  if (!repositorio) return null;
  return <ListaAtividadesVinculadas contratoId={contratoId} entregavelId={entregavelId} />;
}
