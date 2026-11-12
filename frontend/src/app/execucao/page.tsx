'use client';

import { useState, type FormEvent } from 'react';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useProgresso, type ProgressoEntregavel, type AtualizacaoExecucao } from '@/hooks/use-progresso';

const percentual = (valor: number | null) => valor === null ? 'Não calculável' : `${valor.toFixed(1)}%`;
export default function ExecucaoPage() {
  const lista = useListaContratos();
  const contratos = lista.dados ?? [];
  const [escolhido, setEscolhido] = useState('');
  const contratoId = contratos.some(c => c.id === escolhido) ? escolhido : contratos[0]?.id ?? '';
  const acesso = useAcessoContrato(contratoId);
  const perfil = useMeuPerfil();
  const podeEditar = perfil.dados?.perfil === 'ADMINISTRADOR' || Boolean(acesso.dados?.podeEditar);
  const progresso = useProgresso(contratoId);
  const [edicoes, setEdicoes] = useState<Record<string, string>>({});
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [erroLocal, setErroLocal] = useState<string | null>(null);

  async function salvar(evento: FormEvent<HTMLFormElement>, ent: ProgressoEntregavel) {
    evento.preventDefault(); setMensagem(null); setErroLocal(null);
    const valor = edicoes[ent.entregavelId];
    if (valor === undefined || valor.trim() === '') return;
    let dados: AtualizacaoExecucao;
    if (ent.tipo === 'QUANTITATIVO') {
      if (!/^\d+(?:\.\d{1,3})?$/.test(valor)) { setErroLocal('Quantidade inválida.'); return; }
      dados = { quantidadeRealizada: valor };
    } else if (ent.tipo === 'UNICO' || ent.tipo === 'CONTINUO') {
      if (!Number.isFinite(Number(valor)) || Number(valor) < 0 || Number(valor) > 100) {
        setErroLocal('Percentual deve estar entre 0 e 100.'); return;
      }
      dados = { percentualManual: Number(valor) };
    } else if (ent.tipo === 'MARCO') {
      dados = { dataEfetivaMarco: valor };
    } else return;
    setSalvandoId(ent.entregavelId);
    try {
      await progresso.atualizarExecucao(ent.entregavelId, dados);
      setMensagem('Execução atualizada.');
      setEdicoes(p => { const atual = { ...p }; delete atual[ent.entregavelId]; return atual; });
    } catch (falha: unknown) {
      setErroLocal(falha instanceof Error ? falha.message : 'Não foi possível salvar a execução.');
    } finally { setSalvandoId(null); }
  }

  return <main className="space-y-6">
    <header><h2 className="text-2xl font-bold">Execução e avanço físico</h2>
      <p className="text-sm text-foreground/70">O avanço físico é calculado pelo backend; a comprovação documental é independente.</p></header>
    <section className="rounded-xl border border-brand-green/20 bg-card p-4">
      <label htmlFor="execucao-contrato" className="block text-sm font-medium">Contrato autorizado</label>
      <select id="execucao-contrato" value={contratoId} onChange={e => { setEscolhido(e.target.value); setMensagem(null); setErroLocal(null); }}
        disabled={lista.carregando} className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background p-2">
        {contratos.length === 0 && <option value="">Nenhum contrato disponível</option>}
        {contratos.map(c => <option key={c.id} value={c.id}>{c.codigoPublico} — {c.objeto}</option>)}
      </select>
      {Boolean(lista.erro) && <p role="alert" className="text-error-text">Não foi possível consultar os contratos.</p>}
    </section>
    {erroLocal && <p role="alert" className="text-error-text">{erroLocal}</p>}
    {mensagem && <p role="status" className="text-foreground">{mensagem}</p>}
    {!contratoId ? <p>Selecione um contrato.</p>
    : progresso.loading ? <p role="status">Carregando progresso...</p>
    : progresso.erro ? <p role="alert" className="text-error-text">{progresso.erro}</p>
    : !progresso.progresso ? <p>O contrato ainda não possui resultados de execução.</p>
    : <>
      <section className="grid gap-4 sm:grid-cols-2" aria-label="Resumo do avanço">
        <div className="rounded-xl border border-brand-green/20 bg-card p-5">
          <p className="text-sm text-foreground/70">Média simples</p>
          <p className="text-3xl font-bold">{percentual(progresso.progresso.avancoSimples)}</p></div>
        <div className="rounded-xl border border-brand-green/20 bg-card p-5">
          <p className="text-sm text-foreground/70">Avanço ponderado</p>
          <p className="text-3xl font-bold">{progresso.progresso.pesosValidos
            ? percentual(progresso.progresso.avancoPonderado) : 'Configuração pendente'}</p>
          <p className="text-xs text-foreground/70">Soma dos pesos: {progresso.progresso.somaPesos ?? '—'}%</p></div>
      </section>
      <section className="rounded-xl border border-brand-green/20 bg-card p-5 space-y-4" aria-label="Execução por entregável">
        <h3 className="font-semibold">Entregáveis</h3>
        {progresso.progresso.entregaveis.length === 0 ? <p className="text-foreground/70">Nenhum entregável considerado no cálculo.</p>
        : progresso.progresso.entregaveis.map(ent => <article key={ent.entregavelId} className="border-b border-brand-green/20 pb-4 space-y-2">
          <div className="flex flex-wrap justify-between gap-2"><h4 className="font-semibold">{ent.nome}</h4><span>{ent.tipo}</span></div>
          <p className="text-sm">Execução: {percentual(ent.percentualExecucao)} · Peso: {ent.pesoOperacional ?? 'Não informado'}</p>
          <p className="text-sm text-foreground/70">Realizado: {ent.realizado ?? '—'} · Previsto: {ent.previsto ?? '—'}</p>
          <p className="text-xs text-foreground/70">Comprovação documental: avaliada separadamente; não inferida do avanço físico.</p>
          {podeEditar && ent.tipo !== 'RECORRENTE' && <form onSubmit={e => void salvar(e, ent)} className="flex flex-wrap gap-2 items-end">
            <div><label htmlFor={`valor-${ent.entregavelId}`} className="block text-sm">
              {ent.tipo === 'QUANTITATIVO' ? 'Quantidade realizada' : ent.tipo === 'MARCO' ? 'Data efetiva do marco' : 'Progresso manual (%)'}</label>
              <input id={`valor-${ent.entregavelId}`} type={ent.tipo === 'MARCO' ? 'date' : 'number'}
                min={ent.tipo === 'MARCO' ? undefined : '0'} max={ent.tipo === 'QUANTITATIVO' ? undefined : ent.tipo === 'MARCO' ? undefined : '100'}
                step={ent.tipo === 'QUANTITATIVO' ? '0.001' : '1'}
                value={edicoes[ent.entregavelId] ?? ''} onChange={e => setEdicoes(p => ({ ...p, [ent.entregavelId]: e.target.value }))}
                className="mt-1 w-48 rounded-lg border border-brand-green/30 bg-background p-2" /></div>
            <button type="submit" disabled={salvandoId === ent.entregavelId} className="rounded-lg bg-brand-green px-4 py-2 text-on-brand-green disabled:opacity-50">
              {salvandoId === ent.entregavelId ? 'Salvando...' : 'Atualizar'}</button>
          </form>}
        </article>)}
      </section>
    </>}
  </main>;
}
