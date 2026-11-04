'use client';

import Link from 'next/link';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';
import { useAtualizacaoVisivel } from '@/hooks/use-atualizacao-visivel';
import { useMemo, useState } from 'react';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useListaContratos } from '@/hooks/use-contratos';
import { STATUS, MODOS, dataCivil, rotuloCodigoPublico, arquivarContrato, reativarContrato, type Contrato, type StatusContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from './components/area-contratos';
import { ResumoPlanejamentoContrato } from './components/resumo-planejamento-contrato';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';

const LISTA_VAZIA: Contrato[] = [];

export default function ContratosListPage() {
  const { dados: perfil, erro: erroPerfil } = useMeuPerfil();
  const lista = useListaContratos(!!perfil?.ativo);
  const contratos = !lista.erro && perfil?.ativo ? lista.dados ?? LISTA_VAZIA : LISTA_VAZIA;
  const carregando = !!perfil?.ativo && lista.carregando;
  const atualizando = lista.atualizando;
  const erro = erroPerfil ? 'Não foi possível validar sua conta.' : lista.erro ? (lista.erro instanceof Error ? lista.erro.message : 'Não foi possível carregar os contratos.') : '';
  const [avisoAtualizacao, setAvisoAtualizacao] = useState('');
  const atualizacaoVisivel = useAtualizacaoVisivel();
  const [busca, setBusca] = useState('');
  const [abaArquivados, setAbaArquivados] = useState(false);
  const [alterandoArquivo, setAlterandoArquivo] = useState('');
  const [confirmarContrato, setConfirmarContrato] = useState<Contrato | null>(null);
  const [erroArquivo, setErroArquivo] = useState('');
  const [filtro, setFiltro] = useState<StatusContrato | ''>('');
  async function carregar() {
    setAvisoAtualizacao('');
    try { await lista.atualizar(); setAvisoAtualizacao('Lista atualizada.'); }
    catch { /* mensagem vem do estado da consulta; dados protegidos nao sao exibidos em 403 */ }
  }
  const visiveis = useMemo(() => contratos.filter(c => {
    const termo = busca.toLocaleLowerCase('pt-BR').trim();
    const codigo = termo.startsWith('#') ? termo.slice(1) : termo;
    const texto = `${c.numeroContrato} ${c.orgaoContratante} ${c.objeto}`.toLocaleLowerCase('pt-BR');
    const corresponde = termo.startsWith('#')
      ? c.codigoPublico.includes(codigo)
      : texto.includes(termo) || c.codigoPublico.includes(termo);
    return Boolean(c.arquivadoEm) === abaArquivados && (!filtro || c.status === filtro) && corresponde;
  }), [contratos, busca, filtro, abaArquivados]);
  async function alterarArquivo(c: Contrato) {
    if (perfil?.perfil !== 'ADMINISTRADOR' || alterandoArquivo) return;
    setErroArquivo(''); setAlterandoArquivo(c.id);
    try {
      if (c.arquivadoEm) await reativarContrato(c.id);
      else await arquivarContrato(c.id);
      await lista.atualizar();
      setConfirmarContrato(null);
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível atualizar o arquivamento.'); }
    finally { setAlterandoArquivo(''); }
  }
  return <AreaContratos titulo="Gestão de Contratos">
    <section className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-brand-neon">Contratos cadastrados</h2>
        <p className="text-sm text-foreground/70">{perfil?.perfil === 'ADMINISTRADOR' ? 'Carteira completa autorizada' : 'Somente contratos vinculados à sua conta'}</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void atualizacaoVisivel.executar(carregar).catch(() => {})} disabled={atualizando || atualizacaoVisivel.ocupado || carregando || !perfil?.ativo} aria-busy={atualizando || atualizacaoVisivel.ocupado} className="inline-flex min-h-10 min-w-36 items-center justify-center rounded-lg border border-brand-green/40 px-3 py-2 text-sm transition-colors hover:bg-brand-green/10 disabled:opacity-60">{atualizando || atualizacaoVisivel.ocupado ? <IndicadorCarregamento compacto texto="Atualizando..." /> : 'Atualizar lista'}</button>
        {perfil?.perfil === 'ADMINISTRADOR' && <button type="button" aria-pressed={abaArquivados}
          onClick={() => { setAbaArquivados(a => !a); setErroArquivo(''); }}
          className="rounded-lg border border-amber-400/60 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10">
          {abaArquivados ? 'Contratos ativos' : 'Arquivados'}
        </button>}
        {perfil?.perfil === 'ADMINISTRADOR' && <Link href="/contratos/novo" className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green">Cadastrar contrato</Link>}
      </div>
    </section>
    <p role="status" className="min-h-4 text-xs text-foreground/65">{avisoAtualizacao}</p>
    {erroArquivo && <Aviso erro>{erroArquivo}</Aviso>}
    {erro && <div className="space-y-2"><Aviso erro>{erro}</Aviso><button type="button" onClick={() => void carregar()} disabled={atualizando} className="text-sm text-brand-neon underline disabled:opacity-50">Tentar novamente</button></div>}
    {!perfil ? <Aviso>{erro || "Verificando perfil..."}</Aviso> : carregando ? <Aviso>Carregando contratos...</Aviso> : erro ? null : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor="busca-contrato" className="mb-1 block text-sm">Buscar por código, número, órgão ou objeto</label>
          <input id="busca-contrato" className="w-full rounded-lg border border-brand-green/30 bg-background p-2" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <div><label htmlFor="filtro-status" className="mb-1 block text-sm">Filtrar por status</label>
          <select id="filtro-status" className="w-full rounded-lg border border-brand-green/30 bg-background p-2" value={filtro} onChange={e => setFiltro(e.target.value as StatusContrato | '')}>
            <option value="">Todos os status</option>{(Object.keys(STATUS) as StatusContrato[]).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}</select></div>
      </div>
      <p className="text-sm text-foreground/60">{visiveis.length} contrato(s) {abaArquivados ? 'arquivado(s)' : 'ativo(s)'}</p>
      {!contratos.length ? <Aviso>Nenhum contrato cadastrado ou atribuído à sua conta.</Aviso> : !visiveis.length ? <Aviso>Nenhum resultado para os filtros escolhidos.</Aviso> :
        <ul className="space-y-4">{visiveis.map(c => <li key={c.id} className="rounded-xl border border-brand-green/20 bg-brand-darkgreen/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-3"><div className="min-w-0 max-w-full"><p title={c.numeroContrato} className="max-w-full truncate font-bold text-brand-neon">{c.numeroContrato}</p><p className="text-xs text-foreground/60">Código {rotuloCodigoPublico(c.codigoPublico)}</p></div><span className="shrink-0 rounded-full border border-brand-green/30 px-2 py-1 text-xs">{STATUS[c.status]}</span></div>
              <p title={c.orgaoContratante} className="line-clamp-2 [overflow-wrap:anywhere] text-sm font-semibold">{c.orgaoContratante}</p><p title={c.objeto} className="line-clamp-2 [overflow-wrap:anywhere] text-sm text-foreground/75">{c.objeto}</p>
              <p className="text-xs text-foreground/60">Vigência: {dataCivil(c.inicioVigencia)} até {dataCivil(c.terminoVigencia)} · Modo: {MODOS[c.modoCalculo]}</p>
              <ResumoPlanejamentoContrato contratoId={c.id} />
            </div><div className="flex flex-col items-end gap-2">
              <Link href={`/contratos/${encodeURIComponent(c.id)}`} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm text-brand-neon">Detalhes</Link>
              {perfil?.perfil === 'ADMINISTRADOR' && <button type="button" disabled={!!alterandoArquivo}
                onClick={() => setConfirmarContrato(c)}
                className="rounded-lg border border-amber-400/40 px-3 py-2 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50">
                {alterandoArquivo === c.id ? 'Atualizando...' : c.arquivadoEm ? 'Reativar' : 'Arquivar'}
              </button>}
            </div>
          </div></li>)}</ul>}
    </>}
    {confirmarContrato && <ConfirmacaoSimples
      titulo={confirmarContrato.arquivadoEm ? 'Reativar contrato?' : 'Arquivar contrato?'}
      descricao={confirmarContrato.arquivadoEm
        ? 'O contrato voltará à carteira ativa e poderá ser editado conforme as permissões.'
        : 'O contrato ficará em Arquivados, sem permitir alterações operacionais. Documentos, etapas e histórico permanecem preservados.'}
      confirmar={confirmarContrato.arquivadoEm ? 'Reativar contrato' : 'Arquivar contrato'}
      ocupado={!!alterandoArquivo}
      onCancelar={() => { if (!alterandoArquivo) setConfirmarContrato(null); }}
      onConfirmar={() => void alterarArquivo(confirmarContrato)}
    />}
  </AreaContratos>;
}
