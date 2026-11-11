'use client';

import { Suspense, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
/** Compatibilidade dos links anteriores ao diário contextual. */
function RedirecionarDetalhe() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const contratoId = params.get('contratoId') ?? '';
  const editar = params.get('editar') === '1';
  const destino = `/atividades?contratoId=${encodeURIComponent(contratoId)}&${editar ? 'editarId' : 'atividadeId'}=${encodeURIComponent(id ?? '')}`;
  useEffect(() => { if (contratoId && id) router.replace(destino); }, [contratoId, id, destino, router]);
  return <main className="mx-auto max-w-3xl space-y-3 py-6"><h1 className="text-xl font-semibold">Abrindo atividade no diário…</h1>
    {!contratoId ? <p role="alert">O vínculo do contrato é necessário para consultar esta atividade.</p> : <Link href={destino} className="text-brand-neon underline">Abrir atividade no diário</Link>}
  </main>;
}
export default function PaginaDetalhesAtividade() { return <Suspense fallback={<p>Carregando atividade…</p>}><RedirecionarDetalhe /></Suspense>; }
