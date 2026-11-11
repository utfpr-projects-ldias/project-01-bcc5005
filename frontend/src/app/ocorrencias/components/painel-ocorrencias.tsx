'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias, type Ocorrencia, type StatusOcorrencia } from '@/hooks/use-ocorrencias';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { IconeOcorrencias } from '@/app/components/icones-operacionais';

const CAMPO = 'mt-1.5 w-full min-w-0 rounded-lg border border-brand-green/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25 disabled:opacity-50';
const BOTAO = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-40';
const PRINCIPAL = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50';
const ESTADOS: Record<StatusOcorrencia, { titulo: string; borda: string; fundo: string; texto: string; badge: string; modal: 'nao-iniciado' | 'andamento' | 'concluido' }> = {
  NAO_INICIADO: { titulo: 'Não iniciada', borda: 'border-neutral-400/50', fundo: 'bg-neutral-400/[0.035]', texto: 'text-neutral-700 dark:text-neutral-100', badge: 'border-neutral-400/50 bg-neutral-400/10', modal: 'nao-iniciado' },
  EM_ANDAMENTO: { titulo: 'Em andamento', borda: 'border-[#65813b]/65', fundo: 'bg-[#556b2f]/[0.075]', texto: 'text-[#486129] dark:text-[#b8d28a]', badge: 'border-[#65813b]/65 bg-[#556b2f]/15', modal: 'andamento' },
  CONCLUIDO: { titulo: 'Concluída', borda: 'border-violet-400/45', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-400/40 bg-violet-500/10', modal: 'concluido' },
};
type Formulario = { entregavelId: string; titulo: string; periodoInicio: string; periodoFim: string; dataPrevista: string; quantidadeRealizada: string; observacoes: string };
const vazio = (): Formulario => ({ entregavelId: '', titulo: '', periodoInicio: '', periodoFim: '', dataPrevista: '', quantidadeRealizada: '', observacoes: '' });
const dataBR = (data: string | null) => data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : 'Não informada';

/** Painel compartilhado: mesma agenda por contrato na rota global e na aba do contrato. */
export function PainelOcorrencias({ contratoId, somenteLeitura = false, embutido = false, estadoContextual = 'normal' }: { contratoId: string; somenteLeitura?: boolean; embutido?: boolean; estadoContextual?: EstadoContextual }) {
  const [entregavelFiltro, setEntregavelFiltro] = useState('');
  const [situacaoFiltro, setSituacaoFiltro] = useState<'TODAS' | StatusOcorrencia>('TODAS');
  const [busca, setBusca] = useState('');
  const [modalCadastro, setModalCadastro] = useState(false);
  const [entregavelRecorrente, setEntregavelRecorrente] = useState('');
  const [form, setForm] = useState<Formulario>(vazio);
  const [detalhe, setDetalhe] = useState<Ocorrencia | null>(null);
  const [editando, setEditando] = useState(false);
  const [formEdicao, setFormEdicao] = useState({ status: 'NAO_INICIADO' as StatusOcorrencia, dataRealizada: '', quantidadeRealizada: '', observacoes: '' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [focoRetorno, setFocoRetorno] = useState<HTMLElement | null>(null);
  const { dados: perfil } = useMeuPerfil();
  const acesso = useAcessoContrato(contratoId);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = useMemo(() => (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm), [entregaveisConsulta.dados]);
  const etapasConsulta = useEtapas(contratoId);
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm && e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const planejamentoDisponivel = !entregaveisConsulta.atualizando && !etapasConsulta.atualizando && !entregaveisConsulta.erro && !etapasConsulta.erro && !entregaveisConsulta.carregando && !etapasConsulta.carregando;
  const abertos = planejamentoDisponivel ? entregaveis.filter(e => e.statusExecucao !== 'CONCLUIDO' && etapasAbertas.has(e.etapaId)) : [];
  const entregaveisQuantitativos = abertos.filter(e => e.tipo === 'QUANTITATIVO');
  const entregaveisRecorrentes = abertos.filter(e => e.tipo === 'RECORRENTE');
  const nomes = Object.fromEntries(entregaveis.map(e => [e.id, e.nome]));
  const agenda = useOcorrencias(contratoId);
  // A API atual exige Gestor editor (ou ADMIN) e as permissões de entregável.
  const podeGerenciar = !somenteLeitura && !acesso.erro && Boolean(perfil?.ativo) && (perfil?.perfil === 'ADMINISTRADOR' || (perfil?.perfil === 'GESTOR' && Boolean(acesso.dados?.podeEditar)));
  const podeCriarBase = podeGerenciar && (perfil?.perfil === 'ADMINISTRADOR' || Boolean(acesso.dados?.permissoes?.criarEntregaveis ?? acesso.dados?.podeEditar));
  const podeEditar = podeGerenciar && (perfil?.perfil === 'ADMINISTRADOR' || Boolean(acesso.dados?.permissoes?.editarEntregaveis ?? acesso.dados?.podeEditar));
  const podeEditarDetalhe = podeEditar && Boolean(detalhe && abertos.some(e => e.id === detalhe.entregavelId));
  const podeCriar = podeCriarBase && entregaveisQuantitativos.length > 0;
  const podeGerar = podeCriarBase && entregaveisRecorrentes.length > 0;
  const registros = useMemo(() => agenda.ocorrencias.filter(o =>
    (!entregavelFiltro || o.entregavelId === entregavelFiltro) &&
    (situacaoFiltro === 'TODAS' || o.status === situacaoFiltro) &&
    (!busca.trim() || `${o.titulo} ${o.observacoes ?? ''}`.toLocaleLowerCase('pt-BR').includes(busca.trim().toLocaleLowerCase('pt-BR')))
  ).slice().sort((a,b) => (a.dataPrevista ?? a.periodoInicio ?? '9999').localeCompare(b.dataPrevista ?? b.periodoInicio ?? '9999')),
  [agenda.ocorrencias, entregavelFiltro, situacaoFiltro, busca]);
  const concluidas = agenda.ocorrencias.filter(o => o.status === 'CONCLUIDO').length;
  const andamento = agenda.ocorrencias.filter(o => o.status === 'EM_ANDAMENTO').length;

  function abrirCadastro(gatilho: HTMLElement) {
    setFocoRetorno(gatilho); setForm(vazio()); setErro(''); setSucesso(''); setModalCadastro(true);
  }
  function abrirDetalhe(o: Ocorrencia, gatilho: HTMLElement) {
    setFocoRetorno(gatilho); setDetalhe(o); setEditando(false); setErro(''); setSucesso('');
    setFormEdicao({ status: o.status, dataRealizada: o.dataRealizada ?? '', quantidadeRealizada: o.quantidadeRealizada ?? '', observacoes: o.observacoes ?? '' });
  }
  async function gerarRecorrencias() {
    const selecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
    if (!podeGerar || !selecionado || ocupado) return;
    // Geração é aditiva/idempotente. Regeneração futura continua indisponível.
    if (!window.confirm(`Gerar períodos previstos para ${selecionado.nome}? Os períodos existentes serão preservados.`)) return;
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const geradas = await agenda.gerarOcorrenciasRecorrentes(selecionado.id);
      setSucesso(`${geradas} ocorrência(s) recorrente(s) gerada(s). Períodos existentes preservados.`);
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Falha na geração de recorrências.'); }
    finally { setOcupado(false); }
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    if (!podeCriar || !entregaveisQuantitativos.some(e => e.id === form.entregavelId)) { setErro('Selecione um entregável quantitativo autorizado.'); return; }
    if (form.periodoInicio && form.periodoFim && form.periodoInicio > form.periodoFim) { setErro('A data final deve ser igual ou posterior à inicial.'); return; }
    setOcupado(true);
    try {
      await agenda.criarOcorrenciaManual({
        entregavelId: form.entregavelId, titulo: form.titulo.trim(),
        ...(form.periodoInicio ? { periodoInicio: form.periodoInicio } : {}),
        ...(form.periodoFim ? { periodoFim: form.periodoFim } : {}),
        ...(form.dataPrevista ? { dataPrevista: form.dataPrevista } : {}),
        ...(form.quantidadeRealizada ? { quantidadeRealizada: form.quantidadeRealizada } : {}),
        ...(form.observacoes.trim() ? { observacoes: form.observacoes.trim() } : {}),
      });
      setModalCadastro(false); setSucesso('Ocorrência registrada com sucesso.'); setForm(vazio());
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    if (!detalhe || !podeEditarDetalhe) return;
    setOcupado(true);
    try {
      await agenda.editarOcorrencia(detalhe.id, {
        status: formEdicao.status, dataRealizada: formEdicao.dataRealizada || null,
        quantidadeRealizada: formEdicao.quantidadeRealizada || null,
        observacoes: formEdicao.observacoes.trim() || null,
      });
      setDetalhe(null); setEditando(false); setSucesso('Ocorrência atualizada com sucesso.');
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  return <section aria-label="Ocorrências do contrato" data-tec09-painel-ocorrencias data-pi-painel-contextual data-tec08-contexto-operacional data-tec08-estado={estadoContextual} className={`min-w-0 space-y-5 rounded-2xl border p-4 ${embutido ? 'sm:p-6' : 'sm:p-5'}`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 data-pi-titulo className="flex items-center gap-2 text-xl font-bold text-foreground"><IconeOcorrencias tamanho={21} /> Ocorrências do contrato</h3>
        <p className="text-sm text-foreground/65">Registre execuções quantitativas ou gere períodos recorrentes.</p>
      </div>
      {podeCriar && <button type="button" onClick={e => abrirCadastro(e.currentTarget)} data-pi-acao="primaria" className={PRINCIPAL}>＋ Nova ocorrência</button>}
    </header>
    {podeGerar && <div data-pi-superficie className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border p-3">
      <label className="min-w-0 flex-1 text-sm font-medium">Entregável recorrente
        <select className={CAMPO} value={entregavelRecorrente} onChange={e => setEntregavelRecorrente(e.target.value)} aria-label="Entregável para geração de recorrências">
          <option value="">Selecione um entregável recorrente</option>
          {entregaveisRecorrentes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      <button type="button" disabled={!entregavelRecorrente || ocupado} onClick={() => void gerarRecorrencias()} data-pi-acao="primaria" className={BOTAO}>Gerar ocorrências recorrentes</button>
      <p className="w-full text-xs text-foreground/65">Cria apenas os períodos faltantes; não regenera nem altera ocorrências concluídas.</p>
    </div>}
    {podeCriarBase && planejamentoDisponivel && !podeCriar && !podeGerar && <p data-pi-superficie role="status" className="rounded-lg border p-3 text-sm text-foreground/70">Para registrar ocorrências, crie ou reabra um entregável quantitativo ou recorrente em Etapas.</p>}
    {somenteLeitura && <p className="text-xs text-foreground/65">Contrato somente para consulta.</p>}
    {!somenteLeitura && !podeCriarBase && <p className="text-xs text-foreground/65">Você não possui permissão para adicionar ou gerar ocorrências.</p>}
    {podeCriarBase && !planejamentoDisponivel && <p role="status" className="text-xs text-foreground/65">{entregaveisConsulta.erro || etapasConsulta.erro ? "Não foi possível consultar o planejamento." : "Consultando entregáveis disponíveis..."}</p>}
    {erro && !modalCadastro && !detalhe && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
    <div className="grid gap-3 sm:grid-cols-3">
      <div data-pi-superficie className="rounded-xl border p-3"><p className="text-xs text-foreground/65">Total</p><p className="mt-1 text-2xl font-semibold text-foreground">{agenda.ocorrencias.length}</p></div>
      <div className="rounded-xl border border-[#65813b]/50 bg-[#556b2f]/[0.065] p-3"><p className="text-xs text-foreground/65">Em andamento</p><p className="mt-1 text-2xl font-semibold text-[#486129] dark:text-[#b8d28a]">{andamento}</p></div>
      <div className="rounded-xl border border-violet-400/35 bg-violet-500/[0.035] p-3"><p className="text-xs text-foreground/65">Concluídas</p><p className="mt-1 text-2xl font-semibold text-violet-700 dark:text-violet-300">{concluidas}</p></div>
    </div>
    <div data-pi-superficie className="grid min-w-0 gap-3 rounded-xl border border-brand-green/20 bg-background/40 p-3 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
      <label className="min-w-0 text-xs font-medium text-foreground/80">Situação
        <select aria-label="Filtrar situação das ocorrências" className={CAMPO} value={situacaoFiltro} onChange={e => setSituacaoFiltro(e.target.value as typeof situacaoFiltro)}>
          <option value="TODAS">Todas</option><option value="NAO_INICIADO">Não iniciadas</option><option value="EM_ANDAMENTO">Em andamento</option><option value="CONCLUIDO">Concluídas</option>
        </select>
      </label>
      <label className="min-w-0 text-xs font-medium text-foreground/80">Entregável
        <select aria-label="Filtrar entregável das ocorrências" className={`${CAMPO} truncate`} value={entregavelFiltro} onChange={e => setEntregavelFiltro(e.target.value)}>
          <option value="">Todos os entregáveis</option>{entregaveis.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-xs font-medium text-foreground/80">Pesquisar
        <input aria-label="Pesquisar ocorrências" className={CAMPO} placeholder="Título ou observações" type="search" value={busca} onChange={e => setBusca(e.target.value)} />
      </label>
    </div>
    {sucesso && <p role="status" className="rounded-lg border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-foreground">{sucesso}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 data-pi-titulo className="text-base font-semibold">Registros</h4><p className="text-xs text-foreground/65">{registros.length} {registros.length === 1 ? 'ocorrência encontrada' : 'ocorrências encontradas'}</p></div>
    {!contratoId ? <p className="rounded-xl border border-dashed border-brand-green/20 p-6 text-sm text-foreground/65">Selecione um contrato para consultar as ocorrências.</p>
      : agenda.loading ? <p role="status" className="rounded-xl border border-brand-green/20 p-5 text-sm">Carregando ocorrências...</p>
      : agenda.erro ? <p role="alert" className="rounded-xl border border-red-500/30 p-5 text-sm text-error-text">{agenda.erro}</p>
      : registros.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed border-brand-green/25 p-6 text-sm text-foreground/65">Nenhuma ocorrência corresponde aos filtros selecionados.</p>
      : <ul className="grid gap-3">{registros.map(o => {
        const cor = ESTADOS[o.status] ?? ESTADOS.NAO_INICIADO;
        return <li key={o.id} data-ocorrencia-estado={o.status} className="min-w-0"><button type="button" aria-label={`Ver detalhes da ocorrência ${o.titulo}`} onClick={e => abrirDetalhe(o, e.currentTarget)}
          className={`group w-full min-w-0 space-y-3 rounded-xl border p-4 text-left transition-all duration-200 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-neon sm:p-5 ${cor.borda} ${cor.fundo}`}>
          <span className="flex flex-wrap items-start justify-between gap-3"><span className={`min-w-0 flex-1 break-words font-semibold ${cor.texto}`}>{o.titulo}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cor.borda} ${cor.badge} ${cor.texto}`}>{cor.titulo}</span></span>
          <span className="block text-xs text-foreground/65">{o.origem === 'RECORRENTE' ? 'Recorrente' : 'Registro quantitativo'} · {nomes[o.entregavelId] ?? 'Entregável vinculado'}</span>
          <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-foreground/75"><span>Prazo: {dataBR(o.dataPrevista)}</span><span>Período: {dataBR(o.periodoInicio)} — {dataBR(o.periodoFim)}</span></span>
          <span className={`block border-t pt-3 text-xs font-semibold underline underline-offset-4 ${cor.borda} ${cor.texto}`}>Ver detalhes</span>
        </button></li>;
      })}</ul>}
    {modalCadastro && <ModalEtapa titulo="Nova ocorrência" estadoContextual={estadoContextual} contexto="Ocorrências do contrato" rotuloFechar="Fechar cadastro de ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setModalCadastro(false); setErro(''); }} formularioLongo>
      <form data-pi-formulario onSubmit={salvar} className="space-y-4 p-1">
        {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
        <label className="block text-sm font-medium">Entregável quantitativo *<select className={CAMPO} required value={form.entregavelId} onChange={e => setForm(v => ({ ...v, entregavelId: e.target.value }))}>
          <option value="">Selecione...</option>{entregaveisQuantitativos.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select></label>
        <label className="block text-sm font-medium">Título *<input className={CAMPO} required maxLength={255} value={form.titulo} onChange={e => setForm(v => ({ ...v, titulo: e.target.value }))}/></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Início do período<input type="date" className={CAMPO} value={form.periodoInicio} onChange={e => setForm(v => ({ ...v, periodoInicio: e.target.value }))}/></label>
          <label className="block text-sm">Fim do período<input type="date" className={CAMPO} value={form.periodoFim} onChange={e => setForm(v => ({ ...v, periodoFim: e.target.value }))}/></label>
          <label className="block text-sm">Data prevista<input type="date" className={CAMPO} value={form.dataPrevista} onChange={e => setForm(v => ({ ...v, dataPrevista: e.target.value }))}/></label>
          <label className="block text-sm">Quantidade realizada<input type="number" min="0" step="0.001" className={CAMPO} value={form.quantidadeRealizada} onChange={e => setForm(v => ({ ...v, quantidadeRealizada: e.target.value }))}/></label>
        </div>
        <label className="block text-sm">Observações<textarea rows={3} maxLength={3000} className={CAMPO} value={form.observacoes} onChange={e => setForm(v => ({ ...v, observacoes: e.target.value }))}/></label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4"><button data-pi-acao="secundaria" type="button" className={BOTAO} disabled={ocupado} onClick={() => { setModalCadastro(false); setErro(''); }}>Cancelar</button>
          <button data-pi-acao="primaria" type="submit" className={PRINCIPAL} disabled={!podeCriar || ocupado || !form.titulo.trim() || !form.entregavelId}>{ocupado ? 'Salvando...' : 'Registrar ocorrência'}</button></div>
      </form>
    </ModalEtapa>}
    {detalhe && <ModalEtapa titulo={detalhe.titulo} contexto="Detalhes da ocorrência" rotuloFechar="Fechar detalhes da ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setDetalhe(null); setEditando(false); setErro(''); }} estadoContextual={(ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).modal}>
      {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
      {!editando ? <div data-pi-superficie className="space-y-3 rounded-xl border p-3 text-sm">
        <p><strong>Situação:</strong> {(ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).titulo}</p>
        <p><strong>Origem:</strong> {detalhe.origem === 'RECORRENTE' ? 'Recorrente' : 'Manual quantitativa'}</p>
        <p><strong>Entregável:</strong> {nomes[detalhe.entregavelId] ?? 'Vinculado ao contrato'}</p>
        <p><strong>Período:</strong> {dataBR(detalhe.periodoInicio)} — {dataBR(detalhe.periodoFim)}</p>
        <p><strong>Data prevista:</strong> {dataBR(detalhe.dataPrevista)} · <strong>Realizada:</strong> {dataBR(detalhe.dataRealizada)}</p>
        <p><strong>Quantidade realizada:</strong> {detalhe.quantidadeRealizada ?? 'Não informada'}</p>
        <p className="whitespace-pre-wrap break-words"><strong>Observações:</strong> {detalhe.observacoes || 'Não informadas'}</p>
        {podeEditarDetalhe && <button data-pi-acao="secundaria" type="button" className={BOTAO} onClick={() => setEditando(true)}>Editar ocorrência</button>}
      </div> : <form data-pi-formulario className="space-y-3" onSubmit={salvarEdicao}>
        <label className="block text-sm">Situação<select className={CAMPO} value={formEdicao.status} onChange={e => setFormEdicao(v => ({ ...v, status: e.target.value as StatusOcorrencia }))}>
          {Object.entries(ESTADOS).map(([chave, est]) => <option key={chave} value={chave}>{est.titulo}</option>)}
        </select></label>
        <label className="block text-sm">Data realizada<input type="date" className={CAMPO} value={formEdicao.dataRealizada} onChange={e => setFormEdicao(v => ({ ...v, dataRealizada: e.target.value }))}/></label>
        <label className="block text-sm">Quantidade realizada<input type="number" min="0" step="0.001" className={CAMPO} value={formEdicao.quantidadeRealizada} onChange={e => setFormEdicao(v => ({ ...v, quantidadeRealizada: e.target.value }))}/></label>
        <label className="block text-sm">Observações<textarea maxLength={3000} rows={3} className={CAMPO} value={formEdicao.observacoes} onChange={e => setFormEdicao(v => ({ ...v, observacoes: e.target.value }))}/></label>
        <div className="flex flex-wrap justify-end gap-2"><button data-pi-acao="secundaria" className={BOTAO} type="button" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar edição</button><button data-pi-acao="primaria" className={PRINCIPAL} type="submit" disabled={ocupado || !podeEditarDetalhe}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>}
    </ModalEtapa>}
  </section>;
}
