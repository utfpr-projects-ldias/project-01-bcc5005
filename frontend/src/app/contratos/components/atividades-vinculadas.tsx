'use client';

import { useState } from 'react';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useAtividades, type FiltroEstadoAtividade } from '@/hooks/use-atividades';
import type { Entregavel } from '@/lib/entregaveis';
import { CartaoAtividade, statusVisualEntregavel, type EstadoVisualEntregavel } from '@/app/atividades/components/cartao-atividade';
import { ModalCadastroAtividade } from '@/app/atividades/components/modal-cadastro-atividade';

type Filtro = { dataInicio: string; dataFim: string; etapaId: string; entregavelId: string; status: FiltroEstadoAtividade };
const vazio = (): Filtro => ({ dataInicio: '', dataFim: '', etapaId: '', entregavelId: '', status: 'ATIVAS' });
const campo = 'min-w-0 w-full rounded-lg border border-brand-green/25 bg-background px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30';

/** Diário de um contrato ou de um entregável: consulta com filtros imediatos e paginação no backend. */
function ListaAtividadesVinculadas({ contratoId, entregavelId, somenteLeitura = false, estadoContextual }: { contratoId: string; entregavelId?: string; somenteLeitura?: boolean; estadoContextual?: EstadoVisualEntregavel }) {
  const [filtros, setFiltros] = useState<Filtro>(vazio);
  const [pagina, setPagina] = useState(1);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [gatilhoCadastro, setGatilhoCadastro] = useState<HTMLElement | null>(null);
  const fixo = Boolean(entregavelId);
  const etapasConsulta = useEtapas(contratoId);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const etapas = (etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm);
  const estadoPorEntregavel: Record<string, EstadoVisualEntregavel> = Object.fromEntries(
    (entregaveisConsulta.dados ?? []).map((item: Entregavel) => [item.id, statusVisualEntregavel(item)]));
  const estadoPai = estadoContextual ?? (entregavelId ? estadoPorEntregavel[entregavelId] ?? 'normal' : 'normal');
  const corContexto = { normal: 'border-brand-green/20 bg-card', revisao: 'border-teal-600/45 bg-teal-700/[0.035]',
    concluido: 'border-violet-500/40 bg-violet-500/[0.03]', arquivado: 'border-amber-500/40 bg-amber-500/[0.03]' }[estadoPai];
  const entregaveis = (entregaveisConsulta.dados ?? [])
    .filter(e => !e.arquivadoEm && (!filtros.etapaId || e.etapaId === filtros.etapaId));
  const intervaloInvalido = Boolean(filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim);
  const { atividades, total, loading, erro, atualizar } = useAtividades(contratoId, {
    dataInicio: !fixo && !intervaloInvalido ? filtros.dataInicio : undefined,
    dataFim: !fixo && !intervaloInvalido ? filtros.dataFim : undefined,
    etapaId: !fixo && !intervaloInvalido ? filtros.etapaId : undefined,
    entregavelId: entregavelId || (!intervaloInvalido ? filtros.entregavelId : ''),
    status: intervaloInvalido ? undefined : filtros.status,
    page: pagina, limit: 20,
  });
  const totalPaginas = Math.max(1, Math.ceil(total / 20));
  const acesso = useAcessoContrato(contratoId);
  const permissoes = acesso.erro ? undefined : acesso.dados?.permissoes;
  const podeRegistrar = Boolean(permissoes?.registrarAtividades && !acesso.erro && !somenteLeitura);
  const alvoCadastro = entregavelId || filtros.entregavelId;
  const entregavelAlvo = (entregaveisConsulta.dados ?? []).find(e => e.id === alvoCadastro);
  const etapaAlvo = (etapasConsulta.dados ?? []).find(e => e.id === entregavelAlvo?.etapaId);
  const selecionadoAberto = Boolean(entregavelAlvo && !entregavelAlvo.arquivadoEm && entregavelAlvo.statusExecucao !== 'CONCLUIDO' &&
    (!etapaAlvo || (!etapaAlvo.arquivadoEm && etapaAlvo.status !== 'CONCLUIDA' && etapaAlvo.status !== 'ENCERRADA')));
  const podeAbrirCadastro = (fixo || Boolean(filtros.etapaId && filtros.entregavelId)) && selecionadoAberto;
  const permissoesDaLista = somenteLeitura ? { ...permissoes, editarAtividades: false,
    verificarAtividades: false, reabrirAtividades: false, arquivarAtividades: false,
    reativarAtividades: false, excluirAtividadesArquivadas: false } : permissoes;
  const filtroStatus = <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Situação
    <select className={campo} value={filtros.status} onChange={e => { setPagina(1); setFiltros(v => ({ ...v, status: e.target.value as FiltroEstadoAtividade })); }}>
      <option value="ATIVAS">Registradas</option><option value="VERIFICADA">Verificadas</option>
      <option value="ARQUIVADA">Arquivadas</option><option value="">Todas</option>
    </select>
  </label>;
  const abasSituacaoEntregavel = <div role="tablist" aria-label="Situação das atividades" className="inline-flex max-w-full items-center gap-1 rounded-lg border border-current/20 bg-background/50 p-1">
    {([['ATIVAS', 'Registradas'], ['VERIFICADA', 'Verificadas'], ['ARQUIVADA', 'Arquivadas']] as const).map(([chave, rotulo]) =>
      <button key={chave} type="button" role="tab" aria-selected={filtros.status === chave}
        onClick={() => { setPagina(1); setFiltros(v => ({ ...v, status: chave })); }}
        className={`min-w-0 rounded-md px-3 py-2 text-xs font-semibold transition-colors duration-200 ${filtros.status === chave
          ? 'bg-current/10 underline underline-offset-4' : 'text-foreground/65 hover:bg-foreground/5'}`}>{rotulo}</button>)}
  </div>;
  return <section aria-label={fixo ? 'Atividades vinculadas ao entregável' : 'Atividades do contrato'}
    data-tec08-atividades-contrato data-tec08-contexto-operacional data-tec08-estado={estadoPai} className={`space-y-4 rounded-xl border p-4 sm:p-5 ${corContexto}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 data-tec08-titulo-secao-atividades className="text-lg font-semibold">{fixo ? 'Atividades vinculadas' : 'Linha do tempo de atividades'}</h3>
        <p className="mt-1 text-xs text-foreground/65">Diário operacional — {intervaloInvalido ? 'intervalo inválido' : `${total} ${total === 1 ? 'registro' : 'registros'}`}</p></div>
      {podeRegistrar && podeAbrirCadastro && <button type="button" onClick={e => { setGatilhoCadastro(e.currentTarget); setCadastroAberto(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green hover:brightness-105" aria-label="Nova atividade neste contexto">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v14H4zM7 9h10M7 13h6"/><path d="M17 14v6M14 17h6"/></svg> Nova atividade
      </button>}
    </div>
    {!fixo ? <div aria-label="Filtrar atividades do contrato" className="grid min-w-0 gap-3 rounded-xl border border-brand-green/20 bg-background/30 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.85fr)_minmax(0,1.4fr)_minmax(0,.85fr)] xl:items-end">
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Data inicial
        <input type="date" className={campo} value={filtros.dataInicio} onChange={e => { setPagina(1); setFiltros(v => ({ ...v, dataInicio: e.target.value })); }} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Data final
        <input type="date" className={campo} value={filtros.dataFim} onChange={e => { setPagina(1); setFiltros(v => ({ ...v, dataFim: e.target.value })); }} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Etapa
        <select className={campo} value={filtros.etapaId} onChange={e => { setPagina(1); setFiltros(v => ({ ...v, etapaId: e.target.value, entregavelId: '' })); }}>
          <option value="">Selecione uma etapa...</option>{etapas.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Entregável
        <select className={`${campo} truncate`} title={entregaveis.find(e => e.id === filtros.entregavelId)?.nome ?? 'Filtrar entregável'} value={filtros.entregavelId} onChange={e => { setPagina(1); setFiltros(v => ({ ...v, entregavelId: e.target.value })); }}>
          <option value="">Selecione um entregável...</option>{entregaveis.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      {filtroStatus}
      {intervaloInvalido && <p role="alert" className="text-xs text-error-text sm:col-span-2 xl:col-span-5">A data inicial não pode ser posterior à data final.</p>}
    </div> : <div className="min-w-0 max-w-full">{abasSituacaoEntregavel}</div>}
    {intervaloInvalido ? <p role="status" className="rounded-lg border border-dashed border-brand-green/20 p-5 text-sm text-foreground/65">Corrija o intervalo para consultar as atividades.</p>
      : loading ? <p role="status" className="text-sm text-foreground/70">Carregando atividades...</p>
      : erro ? <p role="alert" className="text-sm text-error-text">Não foi possível consultar as atividades deste contrato.</p>
      : atividades.length === 0 ? <p className="rounded-lg border border-dashed border-brand-green/20 p-6 text-sm text-foreground/65">Nenhuma atividade corresponde aos filtros selecionados.</p>
      : <><ol className="relative space-y-4 border-l border-brand-green/35 pl-5 before:absolute before:left-[-4px] before:top-2 before:h-2 before:w-2 before:rounded-full before:bg-brand-green">
        {[...atividades].sort((a, b) => new Date(b.dataHora).getTime() - new Date(a.dataHora).getTime()).map(atividade => <li key={atividade.id} className="relative min-w-0 before:absolute before:-left-[25px] before:top-5 before:h-2 before:w-2 before:rounded-full before:border before:border-brand-green before:bg-background">
          <CartaoAtividade contratoId={contratoId} atividade={atividade} permissoes={permissoesDaLista} compacto dentroEntregavel={fixo} estadosEntregaveis={estadoPorEntregavel} onAtualizada={() => { void atualizar(); }} />
        </li>)}</ol>
        </>}
    {totalPaginas > 1 && !loading && !erro && !intervaloInvalido &&
      <nav aria-label="Paginação das atividades" className="flex flex-wrap items-center justify-end gap-3 text-xs">
        <button type="button" disabled={pagina === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}
          className="rounded-lg border border-brand-green/30 px-3 py-2 disabled:opacity-40">Anterior</button>
        <span className="text-foreground/65">Página {pagina} de {totalPaginas}</span>
        <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          className="rounded-lg border border-brand-green/30 px-3 py-2 disabled:opacity-40">Próxima</button>
      </nav>}
    {cadastroAberto && <ModalCadastroAtividade contratoId={contratoId} entregavelId={entregavelId || filtros.entregavelId} origem={gatilhoCadastro}
      onFechar={() => setCadastroAberto(false)} onSalvo={async () => { setPagina(1); await atualizar(); }} />}
  </section>;
}

/** Preserva testes isolados sem provider, sem ativar consultas privadas no contexto inexistente. */
export function AtividadesVinculadas({ contratoId, entregavelId, somenteLeitura = false, ocultarAcessoDiario: _ocultarAcessoDiario = false, estadoContextual }: { contratoId: string; entregavelId?: string; somenteLeitura?: boolean; ocultarAcessoDiario?: boolean; estadoContextual?: EstadoVisualEntregavel }) {
  void _ocultarAcessoDiario;
  const repositorio = useRepositorioConsultasOpcional();
  if (!repositorio) return null;
  return <ListaAtividadesVinculadas key={`${contratoId}:${entregavelId ?? ''}`} contratoId={contratoId} entregavelId={entregavelId} somenteLeitura={somenteLeitura} estadoContextual={estadoContextual} />;
}
