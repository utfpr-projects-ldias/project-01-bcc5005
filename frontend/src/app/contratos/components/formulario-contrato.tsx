'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { UsuarioPublico } from '@/lib/admin-usuarios';
import { LIMITES_CONTRATO, duracaoMesesSchema, validarContrato, type ErrosContrato } from '@/lib/validacao-contrato';
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
const input = 'w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-green aria-invalid:border-red-500/70';
const label = 'mb-1.5 block text-sm font-medium text-foreground';

function Campo({ titulo, id, obrigatorio = false, ajuda, erro, contador, children }: {
  titulo: string; id: string; obrigatorio?: boolean; ajuda?: string; erro?: string;
  contador?: { valor: number; max: number }; children: ReactNode;
}) {
  return <div className="min-w-0 space-y-1">
    <label htmlFor={id} className={label}>{titulo}{obrigatorio ? ' *' : ''}</label>
    {children}
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>{ajuda && <p id={`${id}-ajuda`} className="text-xs text-foreground/60">{ajuda}</p>}
        {erro && <p id={`${id}-erro`} role="alert" className="text-xs text-red-400">{erro}</p>}</div>
      {contador && <span className="text-xs tabular-nums text-foreground/55">{contador.valor}/{contador.max}</span>}
    </div>
  </div>;
}

export function FormularioContrato({ inicial, responsaveis, onSalvar, salvando = false, podeDefinirResponsavel = true }:
  { inicial?: Contrato; responsaveis: UsuarioPublico[]; onSalvar: (dados: DadosContrato) => Promise<void>; salvando?: boolean; podeDefinirResponsavel?: boolean }) {
  const [form, setForm] = useState<DadosContrato>(() => {
    if (!inicial) return { ...dadosIniciais };
    const { id, ...dados } = inicial;
    void id;
    return { ...dados, dataAssinatura: dataCivil(inicial.dataAssinatura) || null,
      inicioVigencia: dataCivil(inicial.inicioVigencia), terminoVigencia: dataCivil(inicial.terminoVigencia) };
  });
  const [modo, setModo] = useState<'data' | 'meses'>('data');
  const [meses, setMeses] = useState('12');
  const [erros, setErros] = useState<ErrosContrato>({});
  const [erroGeral, setErroGeral] = useState('');
  const calculado = modo === 'meses' ? terminoPorMeses(form.inicioVigencia, Number(meses)) : null;
  const fimAmbiguo = modo === 'meses' && Boolean(form.inicioVigencia) && duracaoMesesSchema.safeParse(meses).success && calculado === null;
  const termino = modo === 'meses' && calculado ? calculado : form.terminoVigencia;
  const erroDo = (campo: keyof DadosContrato) => erros[campo];
  const acessibilidade = (id: string, campo: keyof DadosContrato, ajuda = false) => ({
    'aria-invalid': Boolean(erroDo(campo)),
    'aria-describedby': [ajuda ? `${id}-ajuda` : '', erroDo(campo) ? `${id}-erro` : ''].filter(Boolean).join(' ') || undefined,
  });
  function atualizar<K extends keyof DadosContrato>(campo: K, valor: DadosContrato[K]) {
    setForm(atual => ({ ...atual, [campo]: valor }));
    setErros(atuais => ({ ...atuais, [campo]: undefined }));
    setErroGeral('');
  }
  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvando) return;
    const errosExtras: ErrosContrato = {};
    if (modo === 'meses') {
      const duracao = duracaoMesesSchema.safeParse(meses);
      if (!duracao.success) errosExtras.meses = 'Informe um número inteiro de 1 a 1200 meses.';
    }
    if (modo === 'meses' && fimAmbiguo && !form.terminoVigencia) {
      errosExtras.terminoVigencia = 'Informe explicitamente o término para esse caso de calendário.';
    }
    const validacao = validarContrato({ ...form, terminoVigencia: termino });
    if (!validacao.sucesso || Object.keys(errosExtras).length) {
      setErros({ ...(!validacao.sucesso ? validacao.erros : {}), ...errosExtras });
      setErroGeral('Confira os campos destacados antes de continuar.');
      return;
    }
    setErros({}); setErroGeral('');
    await onSalvar(validacao.dados);
  }
  return <form noValidate onSubmit={e => void enviar(e)} className="space-y-5" aria-label={inicial ? 'Editar dados do contrato' : 'Cadastrar contrato'}>
    <div className="rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6 space-y-5">
      <div><h2 className="text-lg font-semibold text-brand-neon">Identificação do contrato</h2>
        <p className="mt-1 text-sm text-foreground/65">Dados administrativos. Campos com * são obrigatórios.</p></div>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo titulo="Número do contrato" id="numero" obrigatorio erro={erroDo('numeroContrato')} ajuda="Identificador administrativo conforme o instrumento contratual." contador={{ valor: form.numeroContrato.length, max: LIMITES_CONTRATO.numeroContrato }}>
          <input id="numero" className={input} maxLength={LIMITES_CONTRATO.numeroContrato} value={form.numeroContrato} onChange={e => atualizar('numeroContrato', e.target.value)} {...acessibilidade('numero', 'numeroContrato', true)} /></Campo>
        <Campo titulo="Órgão contratante" id="orgao" obrigatorio erro={erroDo('orgaoContratante')} contador={{ valor: form.orgaoContratante.length, max: LIMITES_CONTRATO.orgaoContratante }}>
          <input id="orgao" className={input} maxLength={LIMITES_CONTRATO.orgaoContratante} value={form.orgaoContratante} onChange={e => atualizar('orgaoContratante', e.target.value)} {...acessibilidade('orgao', 'orgaoContratante')} /></Campo>
      </div>
      <Campo titulo="Objeto" id="objeto" obrigatorio ajuda="Resumo do serviço ou obrigação principal contratada." erro={erroDo('objeto')} contador={{ valor: form.objeto.length, max: LIMITES_CONTRATO.objeto }}>
        <textarea id="objeto" rows={3} className={input} maxLength={LIMITES_CONTRATO.objeto} value={form.objeto} onChange={e => atualizar('objeto', e.target.value)} {...acessibilidade('objeto', 'objeto', true)} /></Campo>
    </div>

    <fieldset className="space-y-4 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <legend className="px-2 text-lg font-semibold text-brand-neon">Vigência</legend>
      <p className="text-sm text-foreground/65">Informe início e término. Como alternativa, calcule a data de término pela duração em meses.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Modo da vigência">
        <button type="button" aria-pressed={modo === 'data'} onClick={() => { setModo('data'); setErros({}); }} className={`rounded-lg border px-3 py-2 text-sm ${modo === 'data' ? 'border-brand-green bg-brand-green/10 font-semibold' : 'border-brand-green/30'}`}>Informar término</button>
        <button type="button" aria-pressed={modo === 'meses'} onClick={() => { setModo('meses'); setErros({}); }} className={`rounded-lg border px-3 py-2 text-sm ${modo === 'meses' ? 'border-brand-green bg-brand-green/10 font-semibold' : 'border-brand-green/30'}`}>Duração em meses</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo titulo="Início da vigência" id="inicio" obrigatorio erro={erroDo('inicioVigencia')}>
          <input id="inicio" type="date" className={input} value={form.inicioVigencia} onChange={e => atualizar('inicioVigencia', e.target.value)} {...acessibilidade('inicio', 'inicioVigencia')} /></Campo>
        {modo === 'data' ? <Campo titulo="Término da vigência" id="fim" obrigatorio erro={erroDo('terminoVigencia')}>
          <input id="fim" type="date" className={input} min={form.inicioVigencia || undefined} value={form.terminoVigencia} onChange={e => atualizar('terminoVigencia', e.target.value)} {...acessibilidade('fim', 'terminoVigencia')} /></Campo> :
          <Campo titulo="Duração em meses" id="meses" obrigatorio erro={erros.meses} ajuda="O término é calculado considerando vigência inclusiva.">
            <input id="meses" type="number" min={1} max={1200} step={1} className={input} value={meses} onChange={e => { setMeses(e.target.value); setErros(v => ({ ...v, meses: undefined })); }} aria-invalid={!!erros.meses} aria-describedby={erros.meses ? 'meses-erro' : 'meses-ajuda'} /></Campo>}
      </div>
      {modo === 'meses' && (calculado ? <p role="status" className="text-sm text-foreground/75">Término calculado: <strong>{calculado.split('-').reverse().join('/')}</strong> (vigência inclusiva).</p> :
        <p className="text-sm text-amber-600 dark:text-amber-300">Para mês curto, fim de mês ou data ainda inválida, informe a data final quando disponível. A convenção para casos ambíguos depende de decisão do cliente.</p>)}
      {fimAmbiguo && <Campo titulo="Data de término explícita" id="fim-manual" obrigatorio erro={erroDo('terminoVigencia')}>
        <input id="fim-manual" type="date" className={input} min={form.inicioVigencia || undefined} value={form.terminoVigencia} onChange={e => atualizar('terminoVigencia', e.target.value)} {...acessibilidade('fim-manual', 'terminoVigencia')} /></Campo>}
    </fieldset>

    <div className="rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-semibold text-brand-neon">Situação e acompanhamento físico</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo titulo="Status operacional" id="status" obrigatorio ajuda="Planejamento, execução, encerramento, conclusão, suspensão ou cancelamento." erro={erroDo('status')}>
          <select id="status" className={input} value={form.status} onChange={e => atualizar('status', e.target.value as StatusContrato)} {...acessibilidade('status', 'status', true)}>{(Object.keys(STATUS) as StatusContrato[]).map(k => <option key={k} value={k}>{STATUS[k]}</option>)}</select></Campo>
        <Campo titulo="Modo de cálculo físico" id="modo-calculo" obrigatorio erro={erroDo('modoCalculo')} ajuda="Define como o avanço físico será calculado com os entregáveis, não um valor financeiro.">
          <select id="modo-calculo" className={input} value={form.modoCalculo} onChange={e => atualizar('modoCalculo', e.target.value as ModoCalculo)} {...acessibilidade('modo-calculo', 'modoCalculo', true)}>{(Object.keys(MODOS) as ModoCalculo[]).map(k => <option key={k} value={k}>{MODOS[k]}</option>)}</select></Campo>
      </div>
      <p className="rounded-lg border border-brand-green/20 p-3 text-xs text-foreground/70">
        {form.modoCalculo === 'SIMPLES'
          ? 'Simples: o avanço do contrato será a média dos percentuais de execução dos entregáveis considerados.'
          : 'Ponderado: o avanço será a soma dos percentuais de execução multiplicados pelos pesos operacionais dos entregáveis. Os pesos válidos deverão somar 100%.'}
        {' '}O avanço físico será calculado a partir dos entregáveis quando essa funcionalidade estiver disponível.
      </p>
    </div>

    <details className="group rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <summary className="cursor-pointer text-lg font-semibold text-brand-neon focus-visible:outline-2 focus-visible:outline-brand-green">Informações complementares <span className="text-xs font-normal text-foreground/60">(opcionais)</span></summary>
      <div className="mt-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Campo titulo="Processo administrativo" id="processo" erro={erroDo('processoAdministrativo')} contador={{ valor: (form.processoAdministrativo ?? '').length, max: LIMITES_CONTRATO.processoAdministrativo }}>
            <input id="processo" className={input} maxLength={LIMITES_CONTRATO.processoAdministrativo} value={form.processoAdministrativo ?? ''} onChange={e => atualizar('processoAdministrativo', e.target.value || null)} {...acessibilidade('processo', 'processoAdministrativo')} /></Campo>
          <Campo titulo="Unidade responsável" id="unidade" erro={erroDo('unidadeResponsavel')} ajuda="Setor ou unidade interna responsável pela gestão do contrato." contador={{ valor: (form.unidadeResponsavel ?? '').length, max: LIMITES_CONTRATO.unidadeResponsavel }}>
            <input id="unidade" className={input} maxLength={LIMITES_CONTRATO.unidadeResponsavel} value={form.unidadeResponsavel ?? ''} onChange={e => atualizar('unidadeResponsavel', e.target.value || null)} {...acessibilidade('unidade', 'unidadeResponsavel', true)} /></Campo>
          <Campo titulo="Data de assinatura" id="assinatura" erro={erroDo('dataAssinatura')} ajuda="Data de formalização do contrato. Preenchimento opcional.">
            <input id="assinatura" type="date" className={input} value={form.dataAssinatura ?? ''} onChange={e => atualizar('dataAssinatura', e.target.value || null)} {...acessibilidade('assinatura', 'dataAssinatura', true)} /></Campo>
          <Campo titulo="Fiscal/gestor público" id="fiscal" erro={erroDo('fiscalGestor')} ajuda="Identificação informativa do representante público; não cria usuário nem acesso externo." contador={{ valor: (form.fiscalGestor ?? '').length, max: LIMITES_CONTRATO.fiscalGestor }}>
            <input id="fiscal" className={input} maxLength={LIMITES_CONTRATO.fiscalGestor} value={form.fiscalGestor ?? ''} onChange={e => atualizar('fiscalGestor', e.target.value || null)} {...acessibilidade('fiscal', 'fiscalGestor', true)} /></Campo>
          <Campo titulo="Responsável interno (usuário ativo)" id="responsavel" erro={erroDo('responsavelInternoId')} ajuda="Pessoa de referência. Não substitui os vínculos de acesso definidos na Administração de funcionários.">
            <select id="responsavel" className={input} disabled={!podeDefinirResponsavel} value={form.responsavelInternoId ?? ''} onChange={e => atualizar('responsavelInternoId', e.target.value || null)} {...acessibilidade('responsavel', 'responsavelInternoId', true)}>
              <option value="">Não atribuído</option>
              {form.responsavelInternoId && !responsaveis.some(u => u.id === form.responsavelInternoId) && <option value={form.responsavelInternoId}>Responsável atribuído (identificador reservado)</option>}
              {responsaveis.map(u => <option key={u.id} value={u.id}>{u.nome?.trim() || 'Nome não informado'} — {u.email}</option>)}</select></Campo>
        </div>
        <Campo titulo="Descrição" id="descricao" erro={erroDo('descricao')} ajuda="Detalhamento adicional do objeto e do contexto do contrato." contador={{ valor: (form.descricao ?? '').length, max: LIMITES_CONTRATO.descricao }}>
          <textarea id="descricao" rows={4} className={input} maxLength={LIMITES_CONTRATO.descricao} value={form.descricao ?? ''} onChange={e => atualizar('descricao', e.target.value || null)} {...acessibilidade('descricao', 'descricao', true)} /></Campo>
        <Campo titulo="Observações" id="observacoes" erro={erroDo('observacoes')} ajuda="Anotações administrativas complementares, sem dados financeiros estruturados." contador={{ valor: (form.observacoes ?? '').length, max: LIMITES_CONTRATO.observacoes }}>
          <textarea id="observacoes" rows={4} className={input} maxLength={LIMITES_CONTRATO.observacoes} value={form.observacoes ?? ''} onChange={e => atualizar('observacoes', e.target.value || null)} {...acessibilidade('observacoes', 'observacoes', true)} /></Campo>
      </div>
    </details>
    <p role="note" className="rounded-xl border border-brand-green/20 p-3 text-sm text-foreground/70">Anexos ainda não podem ser enviados por este formulário. O contrato será salvo sem arquivos.</p>
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{erroGeral}</p>}
    <div className="flex flex-wrap items-center justify-end gap-3">
      <Link href={inicial ? `/contratos/${encodeURIComponent(inicial.id)}` : '/contratos'} className="rounded-lg border border-brand-green/40 px-4 py-2.5 text-sm">Cancelar</Link>
      <button type="submit" disabled={salvando} className="rounded-lg bg-brand-green px-5 py-2.5 font-semibold text-background disabled:opacity-50">{salvando ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Cadastrar contrato'}</button>
    </div>
  </form>;
}
