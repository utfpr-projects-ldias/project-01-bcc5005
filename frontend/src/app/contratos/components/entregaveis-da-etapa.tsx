'use client';
import Link from 'next/link';
import { useState } from 'react';
import { FormularioEntregavel } from './formulario-entregavel';
import { criarEntregavel } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import { dataPlanejada, ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';

/** HU07-04: listagem real e cadastro sob autorização do backend; edição no detalhe. */
export function EntregaveisDaEtapa({ contratoId, etapaId, dados, carregando, erro, atualizar, podeCriar = false }: {
  contratoId: string; etapaId: string; dados?: Entregavel[];
  carregando: boolean; erro?: unknown; atualizar: () => Promise<unknown>; podeCriar?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  async function cadastrar(dados: DadosPlanejamentoEntregavel) {
    await criarEntregavel(contratoId, dados);
    setAberto(false); setAviso('Entregável cadastrado com sucesso.');
    // Se a leitura falhar depois do POST, o sucesso do cadastro não se perde.
    void atualizar().catch(() => {});
  }
  // Nunca exibir um item cujo contrato/etapa nao corresponda ao contexto visivel.
  const visiveis = dados?.filter((e) => e.contratoId === contratoId && e.etapaId === etapaId) ?? [];
  const protegido = erro && typeof erro === 'object' && 'status' in erro &&
    [401, 403, 404].includes((erro as { status?: number }).status ?? -1);
  return <section aria-label="Entregáveis da etapa" className="mt-4 min-w-0 rounded-xl border border-brand-green/20 bg-brand-darkgreen/10 p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h5 className="font-semibold text-brand-neon">Entregáveis planejados</h5>
      <div className="flex flex-wrap items-center gap-2">
      {podeCriar && !erro && <button type="button" disabled={salvando} aria-expanded={aberto}
        aria-controls={`cadastro-entregavel-${etapaId}`}
        onClick={() => { setAberto((anterior) => !anterior); setAviso(''); }}
        className="inline-flex items-center gap-2 rounded-lg border border-brand-green bg-brand-green/15 px-3 py-1.5 text-xs font-semibold text-brand-neon disabled:opacity-50">
        {aberto ? 'Cadastrando entregável' : 'Novo entregável'}
        <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
          className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
          <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>}
      <button type="button" disabled={carregando || salvando} onClick={() => void atualizar().catch(() => {})}
        className="rounded-lg border border-brand-green/40 px-3 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon disabled:opacity-50">
        Atualizar entregáveis
      </button>
      </div>
    </div>
    <p className="mt-1 text-xs text-foreground/65">Obrigações desta etapa. Evidências esperadas não são comprovação de execução.</p>
    {aviso && <p role="status" className="mt-2 text-sm text-brand-neon">{aviso}</p>}
    {podeCriar && !erro && aberto && <div id={`cadastro-entregavel-${etapaId}`} className="etapa-form-expandido mt-3">
      <FormularioEntregavel etapaId={etapaId} onSalvar={cadastrar} onCancelar={() => setAberto(false)}
        onSalvandoMudou={setSalvando} />
    </div>}
    {carregando && !dados && !erro && <p role="status" className="mt-3 text-sm">Carregando entregáveis...</p>}
    {Boolean(erro) && <p role="alert" className="mt-3 break-words text-sm text-red-400">
      {erro instanceof Error ? erro.message : 'Falha ao consultar entregáveis.'}
    </p>}
    {!carregando && !erro && !visiveis.length && <p className="mt-3 text-sm text-foreground/70">Nenhum entregável cadastrado nesta etapa.</p>}
    {!protegido && !erro && visiveis.length > 0 && <ul aria-label="Entregáveis planejados da etapa" className="mt-3 space-y-2">
      {visiveis.map((e) => <li key={e.id} className="min-w-0 rounded-lg border border-brand-green/20 bg-background/65 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <p className="break-words text-xs text-foreground/60">{e.codigo ? `Código ${e.codigo} · ` : ''}{ROTULOS_TIPO[e.tipo]}</p>
            <Link href={`/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(e.id)}`}
              className="mt-1 inline-block break-words font-semibold text-brand-neon underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-brand-neon">
              {e.nome}
            </Link>
          </div>
          <span className="rounded-full border border-brand-green/30 px-2.5 py-1 text-xs">Planejamento</span>
        </div>
        <dl className="mt-2 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
          <div><dt className="text-foreground/60">Término previsto</dt><dd>{dataPlanejada(e.terminoPrevisto)}</dd></div>
          <div className="min-w-0"><dt className="text-foreground/60">Responsável cadastral</dt><dd className="break-all">{e.responsavelId ?? 'Não definido'}</dd></div>
        </dl>
      </li>)}
    </ul>}
  </section>;
}
