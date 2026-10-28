'use client';

import { useState, type FormEvent, type ReactNode } from 'react';
import type { UsuarioPublico } from '@/lib/admin-usuarios';
import {
  dataCivil, MODOS, STATUS, terminoPorMeses,
  type Contrato, type DadosContrato, type ModoCalculo, type StatusContrato,
} from '@/lib/contratos';

export const dadosIniciais: DadosContrato = {
  numeroContrato: '', processoAdministrativo: null, orgaoContratante: '', unidadeResponsavel: null,
  objeto: '', descricao: null, dataAssinatura: null, inicioVigencia: '', terminoVigencia: '',
  status: 'PLANEJAMENTO', responsavelInternoId: null, fiscalGestor: null,
  modoCalculo: 'SIMPLES', observacoes: null,
};
const input = 'w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-green';
const label = 'mb-1 block text-sm font-medium text-foreground/75';

function Campo({ titulo, id, obrigatorio = false, children }: { titulo: string; id: string; obrigatorio?: boolean; children: ReactNode }) {
  return <div><label htmlFor={id} className={label}>{titulo}{obrigatorio ? ' *' : ''}</label>{children}</div>;
}

export function FormularioContrato({ inicial, responsaveis, onSalvar, salvando = false, podeDefinirResponsavel = true }:
  { inicial?: Contrato; responsaveis: UsuarioPublico[]; onSalvar: (dados: DadosContrato) => Promise<void>; salvando?: boolean; podeDefinirResponsavel?: boolean }) {
  const [form, setForm] = useState<DadosContrato>(() => {
    if (!inicial) return { ...dadosIniciais };
    // Nunca reenviar `id` como campo do DTO PATCH (forbidNonWhitelisted=true).
    const { id, ...dados } = inicial;
    void id;
    return { ...dados, dataAssinatura: dataCivil(inicial.dataAssinatura) || null,
      inicioVigencia: dataCivil(inicial.inicioVigencia), terminoVigencia: dataCivil(inicial.terminoVigencia) };
  });
  const [modo, setModo] = useState<'data' | 'meses'>('data');
  const [meses, setMeses] = useState('12');
  const [erro, setErro] = useState('');
  const calculado = modo === 'meses' ? terminoPorMeses(form.inicioVigencia, Number(meses)) : null;
  const fimAmbiguo = modo === 'meses' && Boolean(form.inicioVigencia) && calculado === null;
  const terminar = modo === 'meses' && calculado ? calculado : form.terminoVigencia;
  function atualizar<K extends keyof DadosContrato>(campo: K, valor: DadosContrato[K]) {
    setForm(atual => ({ ...atual, [campo]: valor }));
    setErro('');
  }
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvando) return;
    const inicio = form.inicioVigencia;
    if (!inicio || !terminar || terminar < inicio) { setErro('Informe vigência válida: término igual ou posterior ao início.'); return; }
    if (modo === 'meses' && (!Number.isInteger(Number(meses)) || Number(meses) < 1)) { setErro('Informe um número inteiro positivo de meses.'); return; }
    if (!form.numeroContrato.trim() || !form.orgaoContratante.trim() || !form.objeto.trim()) { setErro('Preencha número, órgão e objeto.'); return; }
    const dados: DadosContrato = {
      ...form, numeroContrato: form.numeroContrato.trim(), orgaoContratante: form.orgaoContratante.trim(), objeto: form.objeto.trim(),
      terminoVigencia: terminar,
    };
    setErro('');
    await onSalvar(dados);
  }
  function Campo({ titulo, id, obrigatorio = false, children }: { titulo: string; id: string; obrigatorio?: boolean; children: ReactNode }) {
    return <div><label htmlFor={id} className={label}>{titulo}{obrigatorio ? ' *' : ''}</label>{children}</div>;
  }
  return <form onSubmit={e => void enviar(e)} className="space-y-6 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <p className="text-sm text-foreground/65">Os campos marcados com * são obrigatórios. Nenhum dado financeiro será solicitado.</p>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Campo titulo="Número do contrato" id="numero" obrigatorio><input id="numero" required maxLength={100} className={input} value={form.numeroContrato} onChange={e => atualizar('numeroContrato', e.target.value)} /></Campo>
      <Campo titulo="Órgão contratante" id="orgao" obrigatorio><input id="orgao" required maxLength={255} className={input} value={form.orgaoContratante} onChange={e => atualizar('orgaoContratante', e.target.value)} /></Campo>
    </div>
    <Campo titulo="Objeto" id="objeto" obrigatorio><textarea id="objeto" rows={3} required maxLength={500} className={input} value={form.objeto} onChange={e => atualizar('objeto', e.target.value)} /></Campo>
    <fieldset className="space-y-4 rounded-xl border border-brand-green/20 p-4">
      <legend className="px-2 text-sm font-semibold text-brand-neon">Vigência operacional</legend>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Modo da vigência">
        <button type="button" aria-pressed={modo === 'data'} onClick={() => setModo('data')} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm">Informar término</button>
        <button type="button" aria-pressed={modo === 'meses'} onClick={() => setModo('meses')} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm">Duração em meses</button>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo titulo="Início da vigência" id="inicio" obrigatorio><input id="inicio" type="date" required className={input} value={form.inicioVigencia} onChange={e => atualizar('inicioVigencia', e.target.value)} /></Campo>
        {modo === 'data' ? <Campo titulo="Término da vigência" id="fim" obrigatorio><input id="fim" type="date" required className={input} value={form.terminoVigencia} min={form.inicioVigencia || undefined} onChange={e => atualizar('terminoVigencia', e.target.value)} /></Campo>
        : <Campo titulo="Duração em meses" id="meses" obrigatorio><input id="meses" type="number" min={1} max={1200} step={1} required className={input} value={meses} onChange={e => setMeses(e.target.value)} /></Campo>}
      </div>
      {modo === 'meses' && (calculado ? <p className="text-sm text-foreground/70">Término calculado (vigência inclusiva): <strong>{calculado}</strong></p> :
        <p className="text-sm text-amber-600 dark:text-amber-300">A regra para fim de mês curto/bissexto ainda depende do cliente. Informe a data final explicitamente, sem cálculo automático.</p>)}
      {fimAmbiguo && <Campo titulo="Data de término explícita" id="fim-manual" obrigatorio><input id="fim-manual" type="date" required className={input} min={form.inicioVigencia || undefined} value={form.terminoVigencia} onChange={e => atualizar('terminoVigencia', e.target.value)} /></Campo>}
    </fieldset>
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Campo titulo="Status operacional" id="status" obrigatorio><select id="status" className={input} value={form.status} onChange={e => atualizar('status', e.target.value as StatusContrato)}>{(Object.keys(STATUS) as StatusContrato[]).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}</select></Campo>
      <Campo titulo="Modo de cálculo físico" id="modo-calculo" obrigatorio><select id="modo-calculo" className={input} value={form.modoCalculo} onChange={e => atualizar('modoCalculo', e.target.value as ModoCalculo)}>{(Object.keys(MODOS) as ModoCalculo[]).map(k => <option key={k} value={k}>{MODOS[k]}</option>)}</select></Campo>
    </div>
    <div className="space-y-4 border-t border-brand-green/20 pt-4">
      <h3 className="text-sm font-semibold text-brand-neon">Dados opcionais do contrato</h3>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Campo titulo="Processo administrativo" id="processo"><input id="processo" className={input} maxLength={100} value={form.processoAdministrativo ?? ''} onChange={e => atualizar('processoAdministrativo', e.target.value || null)} /></Campo>
        <Campo titulo="Unidade responsável" id="unidade"><input id="unidade" className={input} maxLength={255} value={form.unidadeResponsavel ?? ''} onChange={e => atualizar('unidadeResponsavel', e.target.value || null)} /></Campo>
        <Campo titulo="Data de assinatura" id="assinatura"><input id="assinatura" type="date" className={input} value={form.dataAssinatura ?? ''} onChange={e => atualizar('dataAssinatura', e.target.value || null)} /></Campo>
        <Campo titulo="Fiscal/gestor público (informativo, sem login)" id="fiscal"><input id="fiscal" className={input} maxLength={255} value={form.fiscalGestor ?? ''} onChange={e => atualizar('fiscalGestor', e.target.value || null)} /></Campo>
        <Campo titulo="Responsável interno (usuário ativo)" id="responsavel"><select id="responsavel" className={input} disabled={!podeDefinirResponsavel} value={form.responsavelInternoId ?? ''} onChange={e => atualizar('responsavelInternoId', e.target.value || null)}><option value="">Não atribuído</option>{responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome?.trim() || 'Nome não informado'} — {u.email}</option>)}</select></Campo>
      </div>
      <Campo titulo="Descrição" id="descricao"><textarea id="descricao" rows={3} className={input} value={form.descricao ?? ''} onChange={e => atualizar('descricao', e.target.value || null)} /></Campo>
      <Campo titulo="Observações" id="observacoes"><textarea id="observacoes" rows={3} className={input} value={form.observacoes ?? ''} onChange={e => atualizar('observacoes', e.target.value || null)} /></Campo>
    </div>
    <div role="note" className="rounded-xl border border-brand-green/20 p-3 text-sm text-foreground/70">Documentos PDF e anexos: upload protegido será implementado na TEC08. Nenhum arquivo é enviado neste formulário.</div>
    {erro && <p role="alert" className="text-sm text-red-400">{erro}</p>}
    <div className="flex justify-end"><button type="submit" disabled={salvando} className="rounded-lg bg-brand-green px-6 py-2 font-semibold text-background disabled:opacity-50">{salvando ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Cadastrar contrato'}</button></div>
  </form>;
}
