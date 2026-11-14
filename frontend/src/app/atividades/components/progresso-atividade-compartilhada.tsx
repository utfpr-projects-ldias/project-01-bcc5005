'use client';
import { useCallback, useEffect, useState } from 'react';
import { aprovarCompartilhada, solicitarCompartilhada, consultarCompartilhada, type ResumoCompartilhada } from '@/lib/atividades-compartilhadas';

/** Os vínculos sem acesso não são enumerados: apenas o contador agregado é visível. */
export function ProgressoAtividadeCompartilhada({ grupoId, onAtualizada }: { grupoId: string; onAtualizada?: () => void }) {
  const [resumo, setResumo] = useState<ResumoCompartilhada | null>(null);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const carregar = useCallback(async () => {
    try { setResumo(await consultarCompartilhada(grupoId)); setErro(''); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Consulta indisponível'); }
  }, [grupoId]);
  useEffect(() => { void carregar(); }, [carregar]);
  const disponiveis = resumo?.atividades.filter(a => a.podeAprovar).length ?? 0;
  const solicitaveis = resumo?.atividades.filter(a => a.podeSolicitar).length ?? 0;
  async function solicitar() {
    setSalvando(true); setErro('');
    try { await solicitarCompartilhada(grupoId); await carregar(); onAtualizada?.(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível solicitar'); }
    finally { setSalvando(false); }
  }
  async function aprovar() {
    setSalvando(true); setErro('');
    try { await aprovarCompartilhada(grupoId); await carregar(); onAtualizada?.(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível aprovar'); }
    finally { setSalvando(false); }
  }
  return <section aria-label="Aprovação por contrato" className="my-2 rounded-lg border border-current/20 bg-background/35 p-3 text-xs">
    {resumo ? <div className="flex flex-wrap items-center justify-between gap-2">
      <div><strong>Verificadas: {resumo.aprovadas}/{resumo.total}</strong>
        <p className="mt-1 text-foreground/60">{resumo.pendentes} pendente(s) no grupo · {disponiveis} disponíveis para você</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void carregar()} className="rounded border border-current/25 px-3 py-2">Atualizar</button>
        {solicitaveis > 0 && <button type="button" disabled={salvando} onClick={() => void solicitar()}
          className="rounded border border-violet-400/60 bg-violet-500/15 px-3 py-2 font-semibold text-violet-300 disabled:opacity-40">Solicitar {solicitaveis}/{resumo.total}</button>}
        {disponiveis > 0 && <button type="button" disabled={salvando} onClick={() => void aprovar()}
          className="rounded bg-green-600 px-3 py-2 font-semibold text-white disabled:opacity-40">Verificar {disponiveis}/{resumo.total}</button>}
      </div>
    </div> : <span className="text-foreground/60">Carregando decisões por contrato...</span>}
    {erro && <p role="alert" className="mt-2 text-error-text">{erro}</p>}
  </section>;
}
