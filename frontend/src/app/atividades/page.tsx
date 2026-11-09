'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useListaContratos } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useAtividades, type Atividade, type DadosAtividade } from '@/hooks/use-atividades';

type Formulario = {
  titulo: string; dataHora: string; descricao: string; tipo: string; responsavel: string;
  participantes: string; local: string; duracao: string; observacoes: string; entregavelIds: string[];
};
const vazio = (): Formulario => ({
  titulo: '', dataHora: '', descricao: '', tipo: 'Reunião', responsavel: '',
  participantes: '', local: '', duracao: '', observacoes: '', entregavelIds: [],
});
function dataLocal(iso: string): string {
  const data = new Date(iso);
  return new Date(data.getTime() - data.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export default function AtividadesPage() {
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [contratoEscolhido, setContratoEscolhido] = useState('');
  const contratoId = contratos.some(c => c.id === contratoEscolhido) ? contratoEscolhido : contratos[0]?.id ?? '';
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm);
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');
  const [filtros, setFiltros] = useState({ dataInicio: '', dataFim: '' });
  const diario = useAtividades(contratoId, filtros);
  const [form, setForm] = useState<Formulario>(vazio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erroFormulario, setErroFormulario] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);

  function selecionarContrato(id: string) {
    setContratoEscolhido(id); setForm(vazio()); setEditandoId(null);
    setErroFormulario(null); setMensagem(null);
  }
  function selecionarEntregavel(id: string) {
    setForm(prev => ({ ...prev, entregavelIds: prev.entregavelIds.includes(id)
      ? prev.entregavelIds.filter(item => item !== id) : [...prev.entregavelIds, id] }));
  }
  function editar(at: Atividade) {
    setEditandoId(at.id);
    setForm({ titulo: at.titulo, dataHora: dataLocal(at.dataHora), descricao: at.descricao,
      tipo: at.tipo, responsavel: at.responsavel ?? '', participantes: (at.participantes ?? []).join(', '),
      local: at.local ?? '', duracao: at.duracao ?? '', observacoes: at.observacoes ?? '',
      entregavelIds: at.entregaveis.map(e => e.id) });
    setErroFormulario(null); setMensagem(null);
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErroFormulario(null); setMensagem(null);
    if (!contratoId || form.entregavelIds.length === 0) {
      setErroFormulario('Selecione um contrato e pelo menos um entregável.'); return;
    }
    if (!form.dataHora || !Number.isFinite(new Date(form.dataHora).getTime())) {
      setErroFormulario('Informe uma data e hora válidas.'); return;
    }
    const dados: DadosAtividade = { ...form, contratoId, dataHora: new Date(form.dataHora).toISOString(),
      participantes: form.participantes.split(',').map(x => x.trim()).filter(Boolean),
    };
    setSalvando(true);
    try {
      if (editandoId) {
        const { contratoId: _contratoDaRota, ...alteracoes } = dados;
        void _contratoDaRota;
        await diario.editarAtividade(editandoId, alteracoes);
      } else {
        await diario.criarAtividade(dados);
      }
      setMensagem(editandoId ? 'Atividade atualizada.' : 'Atividade registrada.');
      setForm(vazio()); setEditandoId(null);
    } catch (erro: unknown) {
      setErroFormulario(erro instanceof Error ? erro.message : 'Erro ao salvar atividade.');
    } finally { setSalvando(false); }
  }
  return <main className="space-y-6">
    <header>
      <h2 className="text-2xl font-bold text-foreground">Diário de execução</h2>
      <p className="text-sm text-foreground/70">Atividades realizadas, responsáveis e entregáveis vinculados ao contrato.</p>
    </header>
    <section className="rounded-xl border border-brand-green/20 bg-card p-4 space-y-4" aria-label="Consulta do diário">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="sm:col-span-3">
          <label htmlFor="contrato-atividades" className="block text-sm font-medium">Contrato autorizado</label>
          <select id="contrato-atividades" value={contratoId} onChange={e => selecionarContrato(e.target.value)}
            disabled={lista.carregando} className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2 text-foreground">
            {contratos.length === 0 && <option value="">Nenhum contrato disponível</option>}
            {contratos.map(c => <option key={c.id} value={c.id}>{c.codigoPublico} — {c.objeto}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="atividades-inicio" className="block text-sm font-medium">De</label>
          <input id="atividades-inicio" type="date" value={inicio} onChange={e => setInicio(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" />
        </div>
        <div>
          <label htmlFor="atividades-fim" className="block text-sm font-medium">Até</label>
          <input id="atividades-fim" type="date" value={fim} onChange={e => setFim(e.target.value)}
            className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" />
        </div>
        <button type="button" disabled={!contratoId} onClick={() => setFiltros({ dataInicio: inicio, dataFim: fim })}
          className="self-end rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-50">Filtrar</button>
      </div>
      {Boolean(lista.erro) && <p role="alert" className="text-error-text">Não foi possível consultar seus contratos.</p>}
    </section>
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <section className="rounded-xl border border-brand-green/20 bg-card p-5 space-y-4" aria-labelledby="nova-atividade">
        <h3 id="nova-atividade" className="font-semibold text-lg">{editandoId ? 'Editar atividade' : 'Registrar atividade'}</h3>
        {erroFormulario && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-error-text">{erroFormulario}</p>}
        {mensagem && <p role="status" className="rounded-lg bg-brand-green/10 p-3 text-foreground">{mensagem}</p>}
        <form onSubmit={salvar} className="space-y-3">
          <div><label htmlFor="atividade-titulo" className="block text-sm">Título *</label>
            <input id="atividade-titulo" required maxLength={255} value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label htmlFor="atividade-data" className="block text-sm">Data e hora *</label>
              <input id="atividade-data" required type="datetime-local" value={form.dataHora} onChange={e => setForm(p => ({ ...p, dataHora: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
            <div><label htmlFor="atividade-tipo" className="block text-sm">Tipo *</label>
              <select id="atividade-tipo" value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2">
                {['Reunião','Visita técnica','Entrega parcial','Vistoria','Outro'].map(t => <option key={t}>{t}</option>)}
              </select></div>
          </div>
          <div><label htmlFor="atividade-descricao" className="block text-sm">Descrição *</label>
            <textarea id="atividade-descricao" required rows={3} maxLength={5000} value={form.descricao}
              onChange={e => setForm(p => ({ ...p, descricao: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="atividade-responsavel" className="block text-sm">Responsável</label>
              <input id="atividade-responsavel" maxLength={255} value={form.responsavel} onChange={e => setForm(p => ({ ...p, responsavel: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" placeholder="Padrão: usuário conectado" /></div>
            <div><label htmlFor="atividade-duracao" className="block text-sm">Duração</label>
              <input id="atividade-duracao" maxLength={80} value={form.duracao} onChange={e => setForm(p => ({ ...p, duracao: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" placeholder="Ex.: 2 horas" /></div>
            <div><label htmlFor="atividade-participantes" className="block text-sm">Participantes</label>
              <input id="atividade-participantes" value={form.participantes} onChange={e => setForm(p => ({ ...p, participantes: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" placeholder="Separe por vírgulas" /></div>
            <div><label htmlFor="atividade-local" className="block text-sm">Local</label>
              <input id="atividade-local" maxLength={255} value={form.local} onChange={e => setForm(p => ({ ...p, local: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          </div>
          <div><label htmlFor="atividade-observacoes" className="block text-sm">Observações</label>
            <textarea id="atividade-observacoes" rows={2} maxLength={5000} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          <fieldset className="rounded-lg border border-brand-green/20 p-3 space-y-2">
            <legend className="text-sm font-semibold">Entregáveis vinculados *</legend>
            {entregaveisConsulta.carregando ? <p className="text-sm">Carregando entregáveis...</p>
            : entregaveisConsulta.erro ? <p role="alert" className="text-error-text">Não foi possível consultar entregáveis.</p>
            : entregaveis.length === 0 ? <p className="text-sm text-foreground/70">Nenhum entregável ativo neste contrato.</p>
            : entregaveis.map(ent => <label key={ent.id} className="flex items-start gap-2 text-sm">
                <input type="checkbox" checked={form.entregavelIds.includes(ent.id)} onChange={() => selecionarEntregavel(ent.id)} />
                <span>{ent.nome}</span>
              </label>)}
          </fieldset>
          <div className="flex gap-2">
            <button type="submit" disabled={salvando || !contratoId} className="rounded-lg bg-brand-green px-4 py-2 text-on-brand-green disabled:opacity-50">
              {salvando ? 'Salvando...' : editandoId ? 'Salvar alterações' : 'Registrar atividade'}
            </button>
            {editandoId && <button type="button" onClick={() => { setForm(vazio()); setEditandoId(null); }}
              className="rounded-lg border border-brand-green/30 px-4 py-2">Cancelar edição</button>}
          </div>
        </form>
      </section>
      <section className="rounded-xl border border-brand-green/20 bg-card p-5 space-y-4" aria-labelledby="lista-atividades">
        <h3 id="lista-atividades" className="font-semibold text-lg">Atividades registradas {diario.total > 0 && <span className="text-sm font-normal">({diario.total})</span>}</h3>
        {!contratoId ? <p className="text-foreground/70">Selecione um contrato para consultar o diário.</p>
        : diario.loading ? <p role="status">Carregando diário...</p>
        : diario.erro ? <p role="alert" className="text-error-text">{diario.erro}</p>
        : diario.atividades.length === 0 ? <p className="text-foreground/70">Nenhuma atividade encontrada para o contrato ou período.</p>
        : <ul className="space-y-3">{diario.atividades.map(at => <li key={at.id} className="rounded-lg border border-brand-green/20 p-3 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div><h4 className="font-semibold">{at.titulo}</h4>
                <p className="text-xs text-foreground/70">{new Date(at.dataHora).toLocaleString('pt-BR')} · {at.tipo}</p></div>
              <button type="button" onClick={() => editar(at)} className="rounded-lg border border-brand-green/30 px-3 py-1 text-sm">Editar</button>
            </div>
            <p className="text-sm whitespace-pre-wrap">{at.descricao}</p>
            {at.responsavel && <p className="text-sm">Responsável: {at.responsavel}</p>}
            {(at.participantes ?? []).length > 0 && <p className="text-xs">Participantes: {at.participantes?.join(', ')}</p>}
            {at.local && <p className="text-xs">Local: {at.local}</p>}
            {at.duracao && <p className="text-xs">Duração: {at.duracao}</p>}
            {at.observacoes && <p className="text-xs">Observações: {at.observacoes}</p>}
            <div className="flex flex-wrap gap-2">{at.entregaveis.map(ent => <Link key={ent.id}
              href={`/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(ent.id)}`}
              className="rounded bg-brand-green/10 px-2 py-1 text-xs text-foreground underline underline-offset-2">
              {ent.nome}</Link>)}</div>
          </li>)}</ul>}
      </section>
    </div>
  </main>;
}
