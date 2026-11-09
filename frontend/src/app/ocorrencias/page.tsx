'use client';

import { useState, type FormEvent } from 'react';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useOcorrencias } from '@/hooks/use-ocorrencias';

export default function OcorrenciasPage() {
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [escolhido, setEscolhido] = useState('');
  const contratoId = contratos.some(c => c.id === escolhido) ? escolhido : contratos[0]?.id ?? '';
  const acesso = useAcessoContrato(contratoId);
  const perfil = useMeuPerfil();
  const podeCriar = perfil.dados?.perfil === 'ADMINISTRADOR' || Boolean(acesso.dados?.podeEditar);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = (entregaveisConsulta.dados ?? []).filter(e => e.tipo === 'QUANTITATIVO' && !e.arquivadoEm);
  const agenda = useOcorrencias(contratoId);
  const [form, setForm] = useState({ entregavelId: '', titulo: '', periodoInicio: '', periodoFim: '',
    dataPrevista: '', quantidadeRealizada: '', observacoes: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [sucesso, setSucesso] = useState<string | null>(null);

  async function criar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro(null); setSucesso(null);
    if (!podeCriar || !entregaveis.some(e => e.id === form.entregavelId)) {
      setErro('Selecione um entregável quantitativo autorizado.'); return;
    }
    if (form.periodoInicio > form.periodoFim) {
      setErro('O período final deve ser posterior ou igual ao inicial.'); return;
    }
    setSalvando(true);
    try {
      await agenda.criarOcorrenciaManual({ ...form, quantidadeRealizada: form.quantidadeRealizada || undefined });
      setSucesso('Ocorrência registrada.');
      setForm({ entregavelId: '', titulo: '', periodoInicio: '', periodoFim: '', dataPrevista: '', quantidadeRealizada: '', observacoes: '' });
    } catch (falha: unknown) {
      setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a ocorrência.');
    } finally { setSalvando(false); }
  }
  return <main className="space-y-6">
    <header><h2 className="text-2xl font-bold">Agenda de ocorrências</h2>
      <p className="text-sm text-foreground/70">Acompanhe ocorrências recorrentes e registre ocorrências quantitativas sob demanda.</p></header>
    <section className="rounded-xl border border-brand-green/20 bg-card p-4">
      <label htmlFor="ocorrencias-contrato" className="block text-sm font-medium">Contrato autorizado</label>
      <select id="ocorrencias-contrato" value={contratoId} onChange={e => { setEscolhido(e.target.value); setErro(null); setSucesso(null); }}
        disabled={lista.carregando} className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2">
        {contratos.length === 0 && <option value="">Nenhum contrato disponível</option>}
        {contratos.map(c => <option key={c.id} value={c.id}>{c.codigoPublico} — {c.objeto}</option>)}
      </select>
      {Boolean(lista.erro) && <p role="alert" className="text-error-text">Não foi possível consultar os contratos.</p>}
    </section>
    <div className="grid gap-6 lg:grid-cols-2 items-start">
      <section className="rounded-xl border border-brand-green/20 bg-card p-5 space-y-3" aria-labelledby="nova-ocorrencia">
        <h3 id="nova-ocorrencia" className="font-semibold">Ocorrência quantitativa manual</h3>
        {!podeCriar && <p className="text-sm text-foreground/70">Cadastro disponível somente para usuários autorizados a editar o contrato.</p>}
        {erro && <p role="alert" className="text-error-text">{erro}</p>}
        {sucesso && <p role="status" className="text-foreground">{sucesso}</p>}
        <form onSubmit={criar} className="space-y-3">
          <div><label htmlFor="ocorrencia-entregavel" className="block text-sm">Entregável quantitativo *</label>
            <select id="ocorrencia-entregavel" required value={form.entregavelId} onChange={e => setForm(p => ({ ...p, entregavelId: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2">
              <option value="">Selecione...</option>
              {entregaveis.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select></div>
          <div><label htmlFor="ocorrencia-titulo" className="block text-sm">Título *</label>
            <input id="ocorrencia-titulo" required value={form.titulo} onChange={e => setForm(p => ({ ...p, titulo: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label htmlFor="ocorrencia-inicio" className="block text-sm">Início *</label>
              <input id="ocorrencia-inicio" type="date" required value={form.periodoInicio} onChange={e => setForm(p => ({ ...p, periodoInicio: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
            <div><label htmlFor="ocorrencia-fim" className="block text-sm">Fim *</label>
              <input id="ocorrencia-fim" type="date" required value={form.periodoFim} onChange={e => setForm(p => ({ ...p, periodoFim: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
            <div><label htmlFor="ocorrencia-prazo" className="block text-sm">Prazo *</label>
              <input id="ocorrencia-prazo" type="date" required value={form.dataPrevista} onChange={e => setForm(p => ({ ...p, dataPrevista: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
            <div><label htmlFor="ocorrencia-quantidade" className="block text-sm">Quantidade realizada (opcional)</label>
              <input id="ocorrencia-quantidade" type="number" min="0" step="0.001" value={form.quantidadeRealizada}
                onChange={e => setForm(p => ({ ...p, quantidadeRealizada: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          </div>
          <div><label htmlFor="ocorrencia-observacoes" className="block text-sm">Observações</label>
            <textarea id="ocorrencia-observacoes" rows={2} value={form.observacoes} onChange={e => setForm(p => ({ ...p, observacoes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2" /></div>
          <button type="submit" disabled={!contratoId || !podeCriar || salvando || !entregaveis.length}
            className="rounded-lg bg-brand-green px-4 py-2 text-on-brand-green disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Adicionar ocorrência'}
          </button>
        </form>
      </section>
      <section className="rounded-xl border border-brand-green/20 bg-card p-5 space-y-3" aria-labelledby="agenda-lista">
        <h3 id="agenda-lista" className="font-semibold">Agenda do contrato</h3>
        {!contratoId ? <p>Selecione um contrato.</p>
        : agenda.loading ? <p role="status">Carregando agenda...</p>
        : agenda.erro ? <p role="alert" className="text-error-text">{agenda.erro}</p>
        : agenda.ocorrencias.length === 0 ? <p className="text-foreground/70">Sem ocorrências para este contrato.</p>
        : <ul className="space-y-3">{[...agenda.ocorrencias].sort((a,b) => (a.dataPrevista ?? '').localeCompare(b.dataPrevista ?? '')).map(o =>
          <li key={o.id} className="rounded-lg border border-brand-green/20 p-3 space-y-1">
            <div className="flex justify-between gap-2"><strong>{o.titulo}</strong><span className="text-xs">{o.status}</span></div>
            <p className="text-sm">Período: {o.periodoInicio ?? '—'} a {o.periodoFim ?? '—'}</p>
            <p className="text-sm">Prevista: {o.dataPrevista ?? '—'} · Realizada: {o.dataRealizada ?? '—'}</p>
            <p className="text-sm">Quantidade: {o.quantidadeRealizada ?? 'Não registrada'}</p>
            {o.observacoes && <p className="text-sm">{o.observacoes}</p>}
          </li>)}</ul>}
      </section>
    </div>
  </main>;
}
