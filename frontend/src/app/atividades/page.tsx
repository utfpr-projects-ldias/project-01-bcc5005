'use client';

import { useEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useAtividades, consultarAtividade, type Atividade, type DadosAtividade, type FiltroEstadoAtividade } from '@/hooks/use-atividades';
import { atividadeSchema, TIPOS_ATIVIDADE, type FormularioAtividade } from '@/lib/validacao-atividade';
import { CartaoAtividade, PreviaContrato, IconeContrato, abrirContratoContextual, statusVisualEntregavel } from './components/cartao-atividade';
import { SeletorContrato } from './components/seletor-contrato';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { ModalCadastroAtividade } from './components/modal-cadastro-atividade';

const CAMPO = 'mt-1.5 w-full rounded-lg border border-brand-green/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/30 disabled:opacity-50';
const BOTAO = 'inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-brand-green/30 px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-40';
const PRIMARIO = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green transition-opacity hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50';
const vazio = (): FormularioAtividade => ({
  titulo: '', dataHora: '', descricao: '', tipo: 'Reunião', responsavel: '',
  participantes: '', local: '', duracao: '', observacoes: '', entregavelIds: [],
});
function dataLocal(iso: string): string {
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function IconeNova() { return <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>; }

export default function AtividadesPage() {
  const router = useRouter();
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [contratoEscolhido, setContratoEscolhido] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('contratoId') ?? '');
  const contratoId = contratos.some(c => c.id === contratoEscolhido) ? contratoEscolhido : '';
  const acesso = useAcessoContrato(contratoId);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm);
  const etapasConsulta = useEtapas(contratoId);
  const etapas = (etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm);
  const contratoAtual = contratos.find(c => c.id === contratoId);
  const contratoAberto = Boolean(contratoId && contratoAtual && !contratoAtual.arquivadoEm &&
    (contratoAtual.status === undefined || ['PLANEJAMENTO', 'EM_EXECUCAO'].includes(contratoAtual.status)));
  const etapasAbertas = new Set(etapas.filter(e => e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const entregaveisAbertos = entregaveis.filter(e => e.statusExecucao !== 'CONCLUIDO' && etapasAbertas.has(e.etapaId));
  const [etapaEscolhida, setEtapaEscolhida] = useState('');
  const entregaveisDaEtapa = entregaveis.filter(e => !etapaEscolhida || e.etapaId === etapaEscolhida);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [statusSelecionado, setStatusSelecionado] = useState<FiltroEstadoAtividade>('');
  const [pagina, setPagina] = useState(1);
  const [entregavelEscolhido, setEntregavelEscolhido] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('entregavelId') ?? '');

  const edicaoInicialAplicada = useRef(false);
  const intervaloInvalido = Boolean(inicio && fim && inicio > fim);
  const diario = useAtividades(contratoId, { dataInicio: intervaloInvalido ? undefined : inicio, dataFim: intervaloInvalido ? undefined : fim, etapaId: etapaEscolhida, entregavelId: entregavelEscolhido, status: statusSelecionado, page: pagina, limit: 20 });
  const [form, setForm] = useState<FormularioAtividade>(vazio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [detalheInicialId] = useState(() => typeof window === 'undefined' ? '' : new URLSearchParams(window.location.search).get('atividadeId') ?? '');
  const [aberto, setAberto] = useState(false);
  const [origemModal, setOrigemModal] = useState<HTMLElement | null>(null);
  const [focoPreviaContrato, setFocoPreviaContrato] = useState<HTMLElement | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const [mensagem, setMensagem] = useState<string | null>(null);
  const permissoes = acesso.dados?.permissoes;
  const pode = (chave: 'registrarAtividades' | 'editarAtividades') =>
    Boolean(permissoes?.[chave] && !acesso.erro);

  function selecionarContrato(id: string) {
    setContratoEscolhido(id); setForm(vazio()); setEditandoId(null); setAberto(false);
    setPagina(1); setEtapaEscolhida(''); setEntregavelEscolhido(''); setErroFormulario(null); setMensagem(null);
  }
  function selecionarEntregavel(id: string) {
    setForm(prev => ({ ...prev, entregavelIds: prev.entregavelIds.includes(id)
      ? prev.entregavelIds.filter(item => item !== id) : [...prev.entregavelIds, id] }));
  }
  function abrirCriacao(e: MouseEvent<HTMLButtonElement>) {
    setOrigemModal(e.currentTarget); setForm(vazio()); setEditandoId(null);
    setErroFormulario(null); setErrosCampos({}); setAberto(true); setMensagem(null);
  }
  function editar(at: Atividade, botao: HTMLButtonElement) {
    if ((at.status ?? 'REGISTRADA') !== 'REGISTRADA') return;
    setOrigemModal(botao); setEditandoId(at.id);
    setForm({ titulo: at.titulo, dataHora: dataLocal(at.dataHora), descricao: at.descricao,
      tipo: TIPOS_ATIVIDADE.find(t => t === at.tipo) ?? 'Outro', responsavel: at.responsavel ?? '',
      participantes: (at.participantes ?? []).join(', '), local: at.local ?? '', duracao: at.duracao ?? '',
      observacoes: at.observacoes ?? '', entregavelIds: at.entregaveis.map(ent => ent.id) });
    setErroFormulario(null); setErrosCampos({}); setAberto(true); setMensagem(null);
  }
  // Um cartão da etapa/entregável pode apontar para uma atividade fora da página 1.
  // Busca pontual autorizada evita falhas de edição com paginação e filtros ativos.
  useEffect(() => {
    if (edicaoInicialAplicada.current || !contratoId || diario.loading) return;
    const id = new URLSearchParams(window.location.search).get('editarId');
    if (!id) return;
    let cancelado = false;
    const encontrada = diario.atividades.find(at => at.id === id);
    void (encontrada ? Promise.resolve(encontrada) : consultarAtividade(contratoId, id))
      .then(at => {
        if (cancelado || edicaoInicialAplicada.current || at.contratoId !== contratoId) return;
        edicaoInicialAplicada.current = true;
        setEditandoId(at.id);
        setForm({ titulo: at.titulo, dataHora: dataLocal(at.dataHora), descricao: at.descricao,
          tipo: TIPOS_ATIVIDADE.find(t => t === at.tipo) ?? 'Outro', responsavel: at.responsavel ?? '',
          participantes: (at.participantes ?? []).join(', '), local: at.local ?? '', duracao: at.duracao ?? '',
          observacoes: at.observacoes ?? '', entregavelIds: at.entregaveis.map(ent => ent.id) });
        setAberto(true);
      })
      .catch(() => { if (!cancelado) setMensagem('Não foi possível abrir a edição. Verifique o acesso à atividade.'); });
    return () => { cancelado = true; };
  }, [contratoId, diario.loading, diario.atividades]);
  function fecharFormulario() { if (!salvando) { setAberto(false); setEditandoId(null); setErrosCampos({}); } }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErroFormulario(null); setErrosCampos({});
    const resultado = atividadeSchema.safeParse(form);
    if (!resultado.success) {
      const erros: Record<string, string> = {};
      for (const issue of resultado.error.issues) { const campo = String(issue.path[0] ?? 'formulario'); erros[campo] ??= issue.message; }
      setErrosCampos(erros); setErroFormulario('Confira os campos destacados antes de salvar.'); return;
    }
    if (!contratoId) { setErroFormulario('Selecione um contrato.'); return; }
    const dados: DadosAtividade = { ...resultado.data, contratoId, dataHora: new Date(resultado.data.dataHora).toISOString(),
      participantes: resultado.data.participantes.split(',').map(x => x.trim()).filter(Boolean) };
    setSalvando(true);
    try {
      if (editandoId) {
        const { contratoId: _contratoDaRota, ...alteracoes } = dados;
        void _contratoDaRota;
        await diario.editarAtividade(editandoId, alteracoes);
      } else await diario.criarAtividade(dados);
      setMensagem(editandoId ? 'Atividade atualizada e registrada na auditoria.' : 'Atividade registrada com sucesso.');
      setForm(vazio()); setEditandoId(null); setAberto(false);
    } catch (erro: unknown) { setErroFormulario(erro instanceof Error ? erro.message : 'Erro ao salvar atividade.'); }
    finally { setSalvando(false); }
  }
  const totalPaginas = Math.max(1, Math.ceil(diario.total / 20));
  return <main className="mx-auto max-w-6xl space-y-5 pb-12">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-widest text-brand-neon">Execução contratual</p>
        <h2 className="text-2xl font-bold text-foreground">Diário de execução</h2>
        <p className="text-sm text-foreground/65">Registre acontecimentos e acompanhe seus vínculos com os entregáveis.</p>
      </div>
      {pode('registrarAtividades') && contratoAberto && entregaveisAbertos.length > 0 && <button type="button" onClick={abrirCriacao} className={PRIMARIO}><IconeNova /> Nova atividade</button>}
    </header>
    <section aria-label="Consulta do diário" className="space-y-4 rounded-xl border border-brand-green/20 bg-card p-4 sm:p-5">
      <SeletorContrato contratos={contratos} valor={contratoId} onChange={selecionarContrato} carregando={lista.carregando} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,.85fr)_minmax(0,1.5fr)_minmax(0,.85fr)]">
        <div><label htmlFor="atividades-inicio" className="block text-xs font-medium">Data inicial</label>
          <input id="atividades-inicio" type="date" value={inicio} onChange={e => { setInicio(e.target.value); setPagina(1); }} className={CAMPO} /></div>
        <div><label htmlFor="atividades-fim" className="block text-xs font-medium">Data final</label>
          <input id="atividades-fim" type="date" value={fim} onChange={e => { setFim(e.target.value); setPagina(1); }} className={CAMPO} /></div>
        <div><label htmlFor="atividades-etapa" className="block text-xs font-medium">Etapa</label>
          <select id="atividades-etapa" className={CAMPO} value={etapaEscolhida} disabled={!contratoId}
            onChange={e => { setEtapaEscolhida(e.target.value); setEntregavelEscolhido(''); setPagina(1); }}>
            <option value="">Todas as etapas</option>{etapas.map(etapa => <option key={etapa.id} value={etapa.id}>{etapa.nome}</option>)}
          </select></div>
        <div><label htmlFor="atividades-entregavel" className="block text-xs font-medium">Entregável</label>
          <select title={entregaveis.find(e => e.id === entregavelEscolhido)?.nome ?? 'Todos os entregáveis'} id="atividades-entregavel" value={entregavelEscolhido}
            onChange={e => { setEntregavelEscolhido(e.target.value); setPagina(1); }} className={`${CAMPO} block min-w-0 truncate pr-8`} disabled={!contratoId}>
            <option value="">Todos os entregáveis</option>{entregaveisDaEtapa.map(ent => <option key={ent.id} value={ent.id}>{ent.nome}</option>)}
          </select></div>
        <div><label htmlFor="atividades-status" className="block text-xs font-medium">Situação</label>
          <select id="atividades-status" value={statusSelecionado} onChange={e => { setStatusSelecionado(e.target.value as FiltroEstadoAtividade); setPagina(1); }} className={CAMPO}>
            <option value="">Todas</option><option value="ATIVAS">Registradas</option><option value="VERIFICADA">Verificadas</option><option value="ARQUIVADA">Arquivadas</option>
          </select></div>
      </div>
      {intervaloInvalido && <p role="alert" className="text-xs text-error-text">A data inicial não pode ser posterior à data final.</p>}
      {Boolean(lista.erro) && <p role="alert" className="text-sm text-error-text">Não foi possível consultar seus contratos.</p>}
    </section>
    {mensagem && <p role="status" className="rounded-lg border border-brand-green/30 bg-brand-green/10 px-4 py-3 text-sm">{mensagem}</p>}
    <section aria-labelledby="lista-atividades" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h3 id="lista-atividades" className="text-lg font-semibold">Atividades registradas</h3>
          <p className="mt-1 text-sm text-foreground/65">{entregavelEscolhido ? 'Filtrado por entregável · ' : ''}{diario.total} {diario.total === 1 ? 'atividade encontrada' : 'atividades encontradas'} · registro não equivale a evidência obrigatória</p></div>
        {contratoId && <button type="button" onClick={e => abrirContratoContextual(contratoId, e.currentTarget, setFocoPreviaContrato, url => router.push(url))}
          className="rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-green/10"><span className="inline-flex items-center gap-2"><IconeContrato /> Ver contrato</span></button>}
      </div>
      {intervaloInvalido ? <div className="rounded-xl border border-dashed border-brand-green/20 p-8 text-center text-sm text-foreground/65">Corrija as datas para consultar o diário.</div>
      : !contratoId ? <div className="rounded-xl border border-dashed border-brand-green/20 p-8 text-center text-sm text-foreground/65">Selecione um contrato para consultar o diário.</div>
      : diario.loading ? <p role="status" className="rounded-xl border border-brand-green/20 p-6">Carregando atividades...</p>
      : diario.erro ? <p role="alert" className="rounded-xl border border-error-text/30 p-4 text-error-text">{diario.erro}</p>
      : diario.atividades.length === 0 ? <div className="rounded-xl border border-dashed border-brand-green/25 bg-card p-8 text-center">
        <p className="font-semibold">Nenhuma atividade encontrada para o contrato ou período.</p>
        <p className="mt-1 text-sm text-foreground/60">Altere os filtros ou registre uma nova atividade.</p>
      </div>
      : <ul className="grid grid-cols-1 gap-3">{diario.atividades.map(at => <li key={at.id} className="min-w-0">
        <CartaoAtividade contratoId={contratoId} atividade={at} permissoes={permissoes} abrirDetalhesInicialmente={detalheInicialId === at.id}
          estadosEntregaveis={Object.fromEntries((entregaveisConsulta.dados ?? []).map(e => [e.id, statusVisualEntregavel(e)]))}
          onEditar={pode('editarAtividades') ? editar : undefined} />
      </li>)}</ul>}
      {totalPaginas > 1 && <nav aria-label="Paginação do diário" className="flex items-center justify-end gap-3">
        <button type="button" disabled={pagina === 1} className={BOTAO} onClick={() => setPagina(p => p - 1)}>Anterior</button>
        <span className="text-xs text-foreground/70">Página {pagina} de {totalPaginas}</span>
        <button type="button" disabled={pagina >= totalPaginas} className={BOTAO} onClick={() => setPagina(p => p + 1)}>Próxima</button>
      </nav>}
    </section>
    {focoPreviaContrato && contratoId && <PreviaContrato contratoId={contratoId} foco={focoPreviaContrato} fechar={() => setFocoPreviaContrato(null)} />}
    {aberto && !editandoId && contratoId && <ModalCadastroAtividade contratoId={contratoId} origem={origemModal}
      onFechar={fecharFormulario} onSalvo={async () => { setMensagem('Atividade registrada com sucesso.'); await diario.atualizar(); }} />}
    {aberto && Boolean(editandoId) && createPortal(<ModalEtapa titulo={editandoId ? 'Editar atividade' : 'Nova atividade'} contexto="Diário de execução"
      ocupado={salvando} formularioLongo focoRetorno={origemModal} onFechar={fecharFormulario} rotuloFechar="Fechar formulário de atividade">
      <form onSubmit={salvar} noValidate className="space-y-4" aria-label="Formulário de atividade">
        <p className="text-xs text-foreground/65">Campos com * são obrigatórios. A atividade poderá ser vinculada a vários entregáveis do mesmo contrato.</p>
        {erroFormulario && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-sm text-error-text">{erroFormulario}</p>}
        <div><label htmlFor="atividade-titulo" className="block text-sm font-medium">Título *</label>
          <input id="atividade-titulo" required maxLength={255} value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))} className={CAMPO} aria-invalid={Boolean(errosCampos.titulo)} />
          {errosCampos.titulo && <p className="mt-1 text-xs text-error-text">{errosCampos.titulo}</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="atividade-data" className="block text-sm font-medium">Data e hora *</label>
            <input id="atividade-data" required type="datetime-local" value={form.dataHora} onChange={e => setForm(p => ({ ...p, dataHora: e.target.value }))} className={CAMPO} aria-invalid={Boolean(errosCampos.dataHora)} />
            {errosCampos.dataHora && <p className="mt-1 text-xs text-error-text">{errosCampos.dataHora}</p>}</div>
          <div><label htmlFor="atividade-tipo" className="block text-sm font-medium">Tipo *</label>
            <select id="atividade-tipo" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as FormularioAtividade['tipo'] }))} className={CAMPO}>
              {TIPOS_ATIVIDADE.map(t => <option key={t}>{t}</option>)}</select></div>
        </div>
        <div><label htmlFor="atividade-descricao" className="block text-sm font-medium">Descrição *</label>
          <textarea id="atividade-descricao" required rows={4} maxLength={5000} value={form.descricao} onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))} className={CAMPO} />
          {errosCampos.descricao && <p className="mt-1 text-xs text-error-text">{errosCampos.descricao}</p>}</div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label htmlFor="atividade-responsavel" className="block text-sm font-medium">Responsável</label>
            <input id="atividade-responsavel" maxLength={255} value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))} className={CAMPO} placeholder="Padrão: usuário conectado" /></div>
          <div><label htmlFor="atividade-duracao" className="block text-sm font-medium">Duração</label>
            <input id="atividade-duracao" maxLength={80} value={form.duracao} onChange={e => setForm(p => ({ ...p, duracao: e.target.value }))} className={CAMPO} placeholder="Ex.: 2 horas" /></div>
          <div><label htmlFor="atividade-participantes" className="block text-sm font-medium">Participantes</label>
            <input id="atividade-participantes" maxLength={2000} value={form.participantes} onChange={e => setForm(p => ({ ...p, participantes: e.target.value }))} className={CAMPO} placeholder="Separe por vírgulas" /></div>
          <div><label htmlFor="atividade-local" className="block text-sm font-medium">Local</label>
            <input id="atividade-local" maxLength={255} value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))} className={CAMPO} /></div>
        </div>
        <div><label htmlFor="atividade-observacoes" className="block text-sm font-medium">Observações</label>
          <textarea id="atividade-observacoes" rows={2} maxLength={5000} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))} className={CAMPO} /></div>
        <fieldset className="space-y-2 rounded-lg border border-brand-green/20 p-3">
          <legend className="px-1 text-sm font-semibold">Vincular ao(s) entregável(is) *</legend>
          {entregaveisConsulta.carregando ? <p className="text-sm">Carregando entregáveis...</p>
          : entregaveisConsulta.erro ? <p role="alert" className="text-error-text">Não foi possível consultar entregáveis.</p>
          : entregaveis.length === 0 ? <p className="text-sm text-foreground/70">Nenhum entregável ativo neste contrato.</p>
          : <div className="max-h-44 space-y-1 overflow-y-auto">{entregaveis.map(ent => <label key={ent.id} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-brand-green/10">
              <input type="checkbox" className="mt-1 accent-brand-green" checked={form.entregavelIds.includes(ent.id)} onChange={() => selecionarEntregavel(ent.id)} />
              <span>{ent.nome}</span></label>)}</div>}
          {errosCampos.entregavelIds && <p className="text-xs text-error-text">{errosCampos.entregavelIds}</p>}
        </fieldset>
        <footer className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4">
          <button type="button" onClick={fecharFormulario} disabled={salvando} className={BOTAO}>Cancelar</button>
          <button type="submit" aria-busy={salvando} disabled={salvando || !contratoId} className={PRIMARIO}>{salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar atividade'}</button>
        </footer>
      </form>
    </ModalEtapa>, document.body)}
  </main>;
}
