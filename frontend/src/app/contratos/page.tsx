'use client';

import Link from 'next/link';
import { IndicadorCarregamento } from '@/app/components/indicador-carregamento';
import { useMemo, useState } from 'react';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useListaContratos } from '@/hooks/use-contratos';
import { STATUS, MODOS, dataCivil, type Contrato, type StatusContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from './components/area-contratos';

const LISTA_VAZIA: Contrato[] = [];

export default function ContratosListPage() {
  const { dados: perfil, erro: erroPerfil } = useMeuPerfil();
  const lista = useListaContratos(!!perfil?.ativo);
  const contratos = !lista.erro && perfil?.ativo ? lista.dados ?? LISTA_VAZIA : LISTA_VAZIA;
  const carregando = !!perfil?.ativo && lista.carregando;
  const atualizando = lista.atualizando;
  const erro = erroPerfil ? 'Não foi possível validar sua conta.' : lista.erro ? (lista.erro instanceof Error ? lista.erro.message : 'Não foi possível carregar os contratos.') : '';
  const [avisoAtualizacao, setAvisoAtualizacao] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<StatusContrato | ''>('');
  async function carregar() {
    setAvisoAtualizacao('');
    try { await lista.atualizar(); setAvisoAtualizacao('Lista atualizada.'); }
    catch { /* mensagem vem do estado da consulta; dados protegidos nao sao exibidos em 403 */ }
  }
  const visiveis = useMemo(() => contratos.filter(c => {
    const texto = `${c.numeroContrato} ${c.orgaoContratante} ${c.objeto}`.toLocaleLowerCase('pt-BR');
    return (!filtro || c.status === filtro) && texto.includes(busca.toLocaleLowerCase('pt-BR').trim());
  }), [contratos, busca, filtro]);
  return <AreaContratos titulo="Gestão de Contratos">
    <section className="flex flex-wrap items-center justify-between gap-4">
      <div><h2 className="text-lg font-semibold text-brand-neon">Contratos cadastrados</h2>
        <p className="text-sm text-foreground/70">{perfil?.perfil === 'ADMINISTRADOR' ? 'Carteira completa autorizada' : 'Somente contratos vinculados à sua conta'} · Dados do PostgreSQL</p></div>
      <div className="flex gap-2">
        <button type="button" onClick={() => void carregar()} disabled={atualizando || carregando || !perfil?.ativo} aria-busy={atualizando} className="inline-flex min-h-10 min-w-36 items-center justify-center rounded-lg border border-brand-green/40 px-3 py-2 text-sm transition-colors hover:bg-brand-green/10 disabled:opacity-60">{atualizando ? <IndicadorCarregamento compacto texto="Atualizando..." /> : 'Atualizar lista'}</button>
        {perfil?.perfil === 'ADMINISTRADOR' && <Link href="/contratos/novo" className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-background">Cadastrar contrato</Link>}
      </div>
    </section>
    <p role="status" className="min-h-4 text-xs text-foreground/65">{avisoAtualizacao}</p>
    {erro && <div className="space-y-2"><Aviso erro>{erro}</Aviso><button type="button" onClick={() => void carregar()} disabled={atualizando} className="text-sm text-brand-neon underline disabled:opacity-50">Tentar novamente</button></div>}
    {!perfil ? <Aviso>{erro || "Verificando perfil..."}</Aviso> : carregando ? <Aviso>Carregando contratos reais...</Aviso> : erro ? null : <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div><label htmlFor="busca-contrato" className="mb-1 block text-sm">Buscar por número, órgão ou objeto</label>
          <input id="busca-contrato" className="w-full rounded-lg border border-brand-green/30 bg-background p-2" value={busca} onChange={e => setBusca(e.target.value)} /></div>
        <div><label htmlFor="filtro-status" className="mb-1 block text-sm">Filtrar por status</label>
          <select id="filtro-status" className="w-full rounded-lg border border-brand-green/30 bg-background p-2" value={filtro} onChange={e => setFiltro(e.target.value as StatusContrato | '')}>
            <option value="">Todos os status</option>{(Object.keys(STATUS) as StatusContrato[]).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}</select></div>
      </div>
      <p className="text-sm text-foreground/60">{visiveis.length} de {contratos.length} contratos autorizados</p>
      {!contratos.length ? <Aviso>Nenhum contrato cadastrado ou atribuído à sua conta.</Aviso> : !visiveis.length ? <Aviso>Nenhum resultado para os filtros escolhidos.</Aviso> :
        <ul className="space-y-4">{visiveis.map(c => <li key={c.id} className="rounded-xl border border-brand-green/20 bg-brand-darkgreen/20 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2"><div className="flex flex-wrap items-center gap-3"><span className="min-w-0 [overflow-wrap:anywhere] font-bold text-brand-neon">{c.numeroContrato}</span><span className="rounded-full border border-brand-green/30 px-2 py-1 text-xs">{STATUS[c.status]}</span></div>
              <p className="[overflow-wrap:anywhere] text-sm font-semibold">{c.orgaoContratante}</p><p className="[overflow-wrap:anywhere] text-sm text-foreground/75">{c.objeto}</p>
              <p className="text-xs text-foreground/60">Vigência: {dataCivil(c.inicioVigencia)} até {dataCivil(c.terminoVigencia)} · Modo: {MODOS[c.modoCalculo]}</p>
            </div><Link href={`/contratos/${encodeURIComponent(c.id)}`} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm text-brand-neon">Detalhes</Link>
          </div></li>)}</ul>}
    </>}
  </AreaContratos>;
}
