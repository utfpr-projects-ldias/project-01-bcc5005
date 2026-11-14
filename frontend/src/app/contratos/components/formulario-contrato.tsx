'use client';

import Link from 'next/link';
import { useState, type FormEvent, type ReactNode } from 'react';
import type { UsuarioPublico } from '@/lib/admin-usuarios';
import { LIMITES_CONTRATO, duracaoMesesSchema, validarContrato, type ErrosContrato } from '@/lib/validacao-contrato';
import {
  dataCivil, STATUS, terminoPorMeses,
  type Contrato, type DadosContrato, type StatusContrato,
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
        {erro && <p id={`${id}-erro`} role="alert" className="text-xs text-error-text">{erro}</p>}</div>
      {contador && <span className="text-xs tabular-nums text-foreground/55">{contador.valor}/{contador.max}</span>}
    </div>
  </div>;
}

export function FormularioContrato({ inicial, responsaveis, onSalvar, salvando = false, podeDefinirResponsavel = true, podeSuspender = false, podeCancelar = false, podeReverter = false, podeEncerrar = false, somenteSituacao = false, onCancelar }:
  { inicial?: Contrato; responsaveis: UsuarioPublico[]; onSalvar: (dados: DadosContrato) => Promise<void>; salvando?: boolean; podeDefinirResponsavel?: boolean; podeSuspender?: boolean; podeCancelar?: boolean; podeReverter?: boolean; podeEncerrar?: boolean; somenteSituacao?: boolean; onCancelar?: () => void }) {
  const [form, setForm] = useState<DadosContrato>(() => {
    if (!inicial) return { ...dadosIniciais };
    // O identificador público é somente leitura: jamais compõe um PATCH.
    const { id, codigoPublico, ...dados } = inicial;
    void id;
    void codigoPublico;
    return { ...dados, dataAssinatura: dataCivil(inicial.dataAssinatura) || null,
      inicioVigencia: dataCivil(inicial.inicioVigencia), terminoVigencia: dataCivil(inicial.terminoVigencia) };
  });
  const emRevisao = Boolean(inicial?.reabertoEm && ['PLANEJAMENTO', 'EM_EXECUCAO'].includes(inicial.status));
  // A fase operacional é independente da revisão. O seletor mostra a fase
  // persistida e nunca encerra a revisão; Fechar novamente é ação própria.
  const valorSelectStatus = form.status;
  const selecionarStatus = (valor: StatusContrato) => atualizar('status', valor);
  const [modo, setModo] = useState<'data' | 'meses'>('data');
  const [meses, setMeses] = useState('12');
  const [terminoManualConfirmado, setTerminoManualConfirmado] = useState(false);
  const [erros, setErros] = useState<ErrosContrato>({});
  const [erroGeral, setErroGeral] = useState('');
  // Uma atribuição existente pode não constar na lista de usuários selecionáveis
  // (conta inativa, lista parcial ou gestor sem permissão de administração).
  // A interface usa o estado neutro, mas preserva o ID original até que o
  // usuário altere explicitamente o campo: editar outros dados não apaga vínculos.
  const responsavelSelecionavel = !form.responsavelInternoId ||
    responsaveis.some(usuario => usuario.id === form.responsavelInternoId);
  const responsavelExibido = responsavelSelecionavel ? (form.responsavelInternoId ?? '') : '';
  // Uma única coleção com chaves estáveis evita misturar arrays e opções avulsas no select.
  const statusDisponiveis: StatusContrato[] = !inicial ? ['PLANEJAMENTO', 'EM_EXECUCAO']
    : inicial.status === 'CANCELADO'
      ? (podeReverter ? ['CANCELADO', 'PLANEJAMENTO'] : ['CANCELADO'])
      : [
          ...(somenteSituacao ? [inicial.status] : [...(['PLANEJAMENTO', 'EM_EXECUCAO'] as StatusContrato[]), ...(inicial.status === 'EM_ENCERRAMENTO' ? ['EM_ENCERRAMENTO' as const] : [])]),
          ...(podeSuspender ? ['SUSPENSO' as const] : []),
          ...(podeEncerrar ? ['ENCERRADO' as const] : []),
          ...(podeCancelar ? ['CANCELADO' as const] : []),
        ].filter((status, indice, todos) => todos.indexOf(status) === indice);
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
    if (campo === 'inicioVigencia') setTerminoManualConfirmado(false);
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
    if (modo === 'meses' && fimAmbiguo && (!form.terminoVigencia || !terminoManualConfirmado)) {
      errosExtras.terminoVigencia = 'Confirme explicitamente o término neste caso de calendário, mesmo ao editar um contrato existente.';
    }
    // Encerrar antecipadamente é decisão administrativa independente: o serviço
    // solicita justificativa e audita. Não enviar ENCERRADO pelo PATCH comum.
    if (inicial && form.status === 'ENCERRADO' && inicial.status !== 'ENCERRADO' && podeEncerrar) {
      setErros({}); setErroGeral('');
      await onSalvar({ ...form, terminoVigencia: termino });
      return;
    }
    // Uma decisão isolada usa endpoint próprio; não reprovar dados legados
    // que não estão disponíveis para edição neste formulário restrito.
    if (somenteSituacao && inicial) {
      if (form.status === inicial.status || !statusDisponiveis.includes(form.status)) {
        setErroGeral('Selecione uma situação diferente da atual.');
        return;
      }
      setErros({}); setErroGeral('');
      await onSalvar({ ...form, terminoVigencia: termino });
      return;
    }
    const validacao = validarContrato({ ...form, terminoVigencia: termino }, inicial);
    if (!validacao.sucesso || Object.keys(errosExtras).length) {
      setErros({ ...(!validacao.sucesso ? validacao.erros : {}), ...errosExtras });
      setErroGeral('Confira os campos destacados antes de continuar.');
      return;
    }
    setErros({}); setErroGeral('');
    await onSalvar(validacao.dados);
  }
  if (somenteSituacao && inicial) return <form noValidate onSubmit={e => void enviar(e)} className="space-y-4" aria-label="Alterar situação do contrato">
    <p className="text-sm text-foreground/75">Você tem autorização para uma mudança de situação, mas não para editar os demais dados contratuais.</p>
    <Campo titulo="Status operacional" id="status" obrigatorio ajuda="Suspensão, cancelamento e encerramento antecipado exigem autorização e confirmação independentes." erro={erroDo('status')}>
      <select id="status" value={valorSelectStatus} onChange={e => selecionarStatus(e.target.value as StatusContrato)} className={input}>
        {statusDisponiveis.map(k => <option key={`situacao-${k}`} value={k}>{k === 'ENCERRADO' ? 'Encerrar' : STATUS[k]}</option>)}
      </select>
    </Campo>
    {erroGeral && <p role="alert" className="text-red-300 text-sm">{erroGeral}</p>}
    <div className="flex justify-end gap-2">
      {onCancelar && <button type="button" onClick={onCancelar} className="rounded-lg border border-foreground/30 px-4 py-2">Voltar</button>}
      <button type="submit" disabled={salvando || form.status === inicial.status}
        className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-on-brand-green disabled:opacity-40">Continuar</button>
    </div>
  </form>;
  return <form data-tec08-formulario-contextual data-tec08-edicao={inicial ? "true" : undefined} data-tec08-criacao={inicial ? undefined : "true"} noValidate onSubmit={e => void enviar(e)} className="space-y-3" aria-label={inicial ? 'Editar dados do contrato' : 'Cadastrar contrato'}>
    <div className="rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-3 sm:p-4 space-y-3">
      <div><h2 className="text-lg font-semibold text-brand-neon">Identificação do contrato</h2>
        <p className="mt-1 text-sm text-foreground/65">Dados administrativos. Campos com * são obrigatórios.</p></div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo titulo="Número do contrato" id="numero" obrigatorio erro={erroDo('numeroContrato')} ajuda="Identificador administrativo conforme o instrumento contratual." contador={{ valor: form.numeroContrato.length, max: LIMITES_CONTRATO.numeroContrato }}>
          <input id="numero" className={input} inputMode="numeric" pattern="[0-9]*" maxLength={LIMITES_CONTRATO.numeroContrato} value={form.numeroContrato} onChange={e => atualizar('numeroContrato', e.target.value.replace(/\D/g, ''))} {...acessibilidade('numero', 'numeroContrato', true)} /></Campo>
        <Campo titulo="Órgão contratante" id="orgao" obrigatorio erro={erroDo('orgaoContratante')} contador={{ valor: form.orgaoContratante.length, max: LIMITES_CONTRATO.orgaoContratante }}>
          <input id="orgao" className={input} maxLength={LIMITES_CONTRATO.orgaoContratante} value={form.orgaoContratante} onChange={e => atualizar('orgaoContratante', e.target.value)} {...acessibilidade('orgao', 'orgaoContratante')} /></Campo>
        <Campo titulo="Objeto" id="objeto" obrigatorio erro={erroDo('objeto')} contador={{ valor: form.objeto.length, max: LIMITES_CONTRATO.objeto }}>
          <input id="objeto" className={input} maxLength={LIMITES_CONTRATO.objeto} value={form.objeto} onChange={e => atualizar('objeto', e.target.value)} {...acessibilidade('objeto', 'objeto')} /></Campo>
      </div>
    </div>

    <fieldset className="space-y-3 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-3 sm:p-4">
      <legend className="px-2 text-lg font-semibold text-brand-neon">Vigência</legend>
      <p className="text-sm text-foreground/65">Informe início e término. Como alternativa, calcule a data de término pela duração em meses.</p>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Modo da vigência">
        <button type="button" aria-pressed={modo === 'data'} onClick={() => { setModo('data'); setErros({}); }} className={`rounded-lg border px-3 py-2 text-sm ${modo === 'data' ? 'border-brand-green bg-brand-green/10 font-semibold' : 'border-brand-green/30'}`}>Informar término</button>
        <button type="button" aria-pressed={modo === 'meses'} onClick={() => { setModo('meses'); setTerminoManualConfirmado(false); setErros({}); }} className={`rounded-lg border px-3 py-2 text-sm ${modo === 'meses' ? 'border-brand-green bg-brand-green/10 font-semibold' : 'border-brand-green/30'}`}>Duração em meses</button>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo titulo="Início da vigência" id="inicio" obrigatorio erro={erroDo('inicioVigencia')}>
          <input id="inicio" type="date" className={input} value={form.inicioVigencia} onChange={e => atualizar('inicioVigencia', e.target.value)} {...acessibilidade('inicio', 'inicioVigencia')} /></Campo>
        {modo === 'data' ? <Campo titulo="Término da vigência" id="fim" obrigatorio erro={erroDo('terminoVigencia')}>
          <input id="fim" type="date" className={input} min={form.inicioVigencia || undefined} value={form.terminoVigencia} onChange={e => atualizar('terminoVigencia', e.target.value)} {...acessibilidade('fim', 'terminoVigencia')} /></Campo> :
          <Campo titulo="Duração em meses" id="meses" obrigatorio erro={erros.meses} ajuda="O término é calculado considerando vigência inclusiva.">
            <input id="meses" type="number" min={1} max={1200} step={1} className={input} value={meses} onChange={e => { setMeses(e.target.value); setTerminoManualConfirmado(false); setErros(v => ({ ...v, meses: undefined })); }} aria-invalid={!!erros.meses} aria-describedby={erros.meses ? 'meses-erro' : 'meses-ajuda'} /></Campo>}
      </div>
      {modo === 'meses' && (calculado ? <p role="status" className="text-sm text-foreground/75">Término calculado: <strong>{calculado.split('-').reverse().join('/')}</strong> (vigência inclusiva).</p> :
        <p className="text-sm text-amber-600 dark:text-amber-300">Para mês curto, fim de mês ou data ainda inválida, informe a data final quando disponível. A convenção para casos ambíguos depende de decisão do cliente.</p>)}
      {fimAmbiguo && <Campo titulo="Data de término explícita" id="fim-manual" obrigatorio erro={erroDo('terminoVigencia')}>
        <input id="fim-manual" type="date" className={input} min={form.inicioVigencia || undefined} value={form.terminoVigencia}
          onChange={e => { atualizar('terminoVigencia', e.target.value); setTerminoManualConfirmado(Boolean(e.target.value)); }}
          {...acessibilidade('fim-manual', 'terminoVigencia')} />
        {Boolean(form.terminoVigencia) && <label className="mt-2 flex items-start gap-2 text-xs text-foreground/80">
          <input type="checkbox" checked={terminoManualConfirmado} onChange={e => { setTerminoManualConfirmado(e.target.checked); setErros(atuais => ({ ...atuais, terminoVigencia: undefined })); }}
            className="mt-0.5 accent-brand-green" />
          Confirmo a data de término explícita acima para esta duração ambígua.
        </label>}</Campo>}
    </fieldset>

    <div className="rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-3 sm:p-4 space-y-3">
      <h2 className="text-lg font-semibold text-brand-neon">Situação e acompanhamento físico</h2>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo titulo="Status operacional" id="status" obrigatorio ajuda={emRevisao ? 'Fase operacional durante a revisão.' : inicial ? 'Situações especiais exigem autorização. Concluído depende de aprovação separada.' : 'O novo contrato começa em Planejamento ou Em execução.'} erro={erroDo('status')}>
          <select id="status" className={input} value={valorSelectStatus} onChange={e => selecionarStatus(e.target.value as StatusContrato)} {...acessibilidade('status', 'status', true)}>{statusDisponiveis.map(k => <option key={`contrato-status-${k}`} value={k}>{k === 'ENCERRADO' ? 'Encerrar' : STATUS[k]}</option>)}</select></Campo>

      </div>
      <p className="rounded-lg border border-brand-green/20 p-3 text-xs text-foreground/70">
        O cálculo físico é configurado na aba Execução, conforme as permissões operacionais do contrato.
      </p>
    </div>

    <details open className="group rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-3 sm:p-4">
      <summary className="cursor-pointer text-lg font-semibold text-brand-neon focus-visible:outline-2 focus-visible:outline-brand-green">Informações complementares <span className="text-xs font-normal text-foreground/60">(opcionais)</span></summary>
      <div className="mt-3 space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo titulo="Processo administrativo" id="processo" erro={erroDo('processoAdministrativo')} contador={{ valor: (form.processoAdministrativo ?? '').length, max: LIMITES_CONTRATO.processoAdministrativo }}>
            <input id="processo" className={input} maxLength={LIMITES_CONTRATO.processoAdministrativo} value={form.processoAdministrativo ?? ''} onChange={e => atualizar('processoAdministrativo', e.target.value || null)} {...acessibilidade('processo', 'processoAdministrativo')} /></Campo>
          <Campo titulo="Unidade responsável" id="unidade" erro={erroDo('unidadeResponsavel')} ajuda="Setor ou unidade interna responsável pela gestão do contrato." contador={{ valor: (form.unidadeResponsavel ?? '').length, max: LIMITES_CONTRATO.unidadeResponsavel }}>
            <input id="unidade" className={input} maxLength={LIMITES_CONTRATO.unidadeResponsavel} value={form.unidadeResponsavel ?? ''} onChange={e => atualizar('unidadeResponsavel', e.target.value || null)} {...acessibilidade('unidade', 'unidadeResponsavel', true)} /></Campo>
          <Campo titulo="Data de assinatura" id="assinatura" erro={erroDo('dataAssinatura')} ajuda="Data de formalização do contrato. Preenchimento opcional.">
            <input id="assinatura" type="date" className={input} value={form.dataAssinatura ?? ''} onChange={e => atualizar('dataAssinatura', e.target.value || null)} {...acessibilidade('assinatura', 'dataAssinatura', true)} /></Campo>
          <Campo titulo="Fiscal/gestor público" id="fiscal" erro={erroDo('fiscalGestor')} ajuda="Identificação informativa do representante público; não cria usuário nem acesso externo." contador={{ valor: (form.fiscalGestor ?? '').length, max: LIMITES_CONTRATO.fiscalGestor }}>
            <input id="fiscal" className={input} maxLength={LIMITES_CONTRATO.fiscalGestor} value={form.fiscalGestor ?? ''} onChange={e => atualizar('fiscalGestor', e.target.value || null)} {...acessibilidade('fiscal', 'fiscalGestor', true)} /></Campo>
          <Campo titulo="Responsável pelo contrato (opcional)" id="responsavel" erro={erroDo('responsavelInternoId')} ajuda="Essa pessoa poderá consultar o contrato. Para permitir alterações, configure o acesso em Funcionários.">
            <select id="responsavel" className={input} disabled={!podeDefinirResponsavel} value={responsavelExibido} onChange={e => atualizar('responsavelInternoId', e.target.value || null)} {...acessibilidade('responsavel', 'responsavelInternoId', true)}>
              <option value="">Não atribuído</option>
              {responsaveis.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}</select></Campo>
        </div>
        <div className="grid gap-3 md:grid-cols-2"><Campo titulo="Descrição" id="descricao" erro={erroDo('descricao')} ajuda="Detalhamento adicional do objeto e do contexto do contrato." contador={{ valor: (form.descricao ?? '').length, max: LIMITES_CONTRATO.descricao }}>
          <textarea id="descricao" rows={2} className={input} maxLength={LIMITES_CONTRATO.descricao} value={form.descricao ?? ''} onChange={e => atualizar('descricao', e.target.value || null)} {...acessibilidade('descricao', 'descricao', true)} /></Campo>
        <Campo titulo="Observações" id="observacoes" erro={erroDo('observacoes')} ajuda="Anotações administrativas complementares, sem dados financeiros estruturados." contador={{ valor: (form.observacoes ?? '').length, max: LIMITES_CONTRATO.observacoes }}>
          <textarea id="observacoes" rows={2} className={input} maxLength={LIMITES_CONTRATO.observacoes} value={form.observacoes ?? ''} onChange={e => atualizar('observacoes', e.target.value || null)} {...acessibilidade('observacoes', 'observacoes', true)} /></Campo></div>
      </div>
    </details>
    <p role="note" className="rounded-xl border border-brand-green/20 p-3 text-sm text-foreground/70">O contrato será salvo primeiro. Em seguida, você poderá anexar o PDF principal e outros documentos classificados, sem exigir arquivo no cadastro.</p>
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erroGeral}</p>}
    <div className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-brand-green/20 px-1 pt-4 pb-2">
      {onCancelar ? <button type="button" onClick={onCancelar} disabled={salvando} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-brand-green/35 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-green/65 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-50">Cancelar</button> :
        <Link href={inicial ? `/contratos/${encodeURIComponent(inicial.id)}` : '/contratos'} className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-brand-green/35 px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-brand-green/65 hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon">Cancelar</Link>}
      <button type="submit" data-tec08-salvar-contextual aria-busy={salvando} disabled={salvando} className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-brand-green/70 bg-brand-green px-3 py-2 text-sm font-semibold text-on-brand-green transition-[filter,transform,box-shadow] hover:brightness-110 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-50">
        {salvando ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Cadastrar contrato'}
      </button>
    </div>
  </form>;
}
