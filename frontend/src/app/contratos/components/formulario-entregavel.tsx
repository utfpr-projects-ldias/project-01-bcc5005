'use client';
import { useEffect, useId, useRef, useState, type Ref, type FormEvent } from 'react';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { ErroEntregavel, ROTULOS_TIPO, pesquisarResponsaveisEntregavel, type ResponsavelEntregavel, type Entregavel } from '@/lib/entregaveis';
import { decimalDigitado, decimalExibicao, decimalValido } from '@/lib/campos-numericos';
import { inicialEntregavel,
  validarEntregavel, type DadosPlanejamentoEntregavel, type ErrosEntregavel, type RascunhoEntregavel } from '@/lib/validacao-entregavel';

const estilo = 'w-full min-w-0 rounded-lg border border-brand-green/35 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-neon aria-invalid:border-red-500';
function Seta() { return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m4 10 4 4 8-8" /></svg>; }
export function FormularioEntregavel({ contratoId, etapaId, inicial, onSalvar, onCancelar, onArquivar, referenciaArquivar, onSalvandoMudou, podeConfigurarPesos = false, podeReplanejarOcorrencias = false }: {
  contratoId?: string; etapaId: string; inicial?: Entregavel; onSalvar: (dados: DadosPlanejamentoEntregavel) => Promise<void>;
  onCancelar: () => void; onArquivar?: () => void; referenciaArquivar?: Ref<HTMLButtonElement>; onSalvandoMudou?: (salvando: boolean) => void;
  podeAlterarObrigatoriedade?: boolean; podeCriarEvidencias?: boolean;
  podeConfigurarPesos?: boolean; podeReplanejarOcorrencias?: boolean;
}) {
  const prefixo = useId().replace(/:/g, '');
  const agendaBloqueada = Boolean(inicial?.tipo === 'RECORRENTE' && !podeReplanejarOcorrencias);
  const pesoBloqueado = Boolean(inicial && !podeConfigurarPesos);
  const existentes = useEntregaveis(contratoId ?? '', Boolean(contratoId));
  const enviando = useRef(false);
  const [dados, setDados] = useState<RascunhoEntregavel>(() => inicialEntregavel(etapaId, inicial));
  const [mesmoDia, setMesmoDia] = useState(() => Boolean(inicial?.inicioPrevisto && inicial.inicioPrevisto === inicial.terminoPrevisto));
  const [erros, setErros] = useState<ErrosEntregavel>({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [buscaResponsavel, setBuscaResponsavel] = useState('');
  const [responsaveis, setResponsaveis] = useState<ResponsavelEntregavel[]>([]);
  // Mantém a lista anterior estável até chegar a próxima resposta; nenhuma seleção é feita sem clique/Enter.
  const [pesquisaConcluida, setPesquisaConcluida] = useState<string | null>(null);
  const [listaAberta, setListaAberta] = useState(false);
  const [indiceDestacado, setIndiceDestacado] = useState(-1);
  const [totalResponsaveis, setTotalResponsaveis] = useState(0);
  const [consultandoResponsavel, setConsultandoResponsavel] = useState(false);
  const [erroResponsavel, setErroResponsavel] = useState('');
  const [responsavelEscolhido, setResponsavelEscolhido] = useState<ResponsavelEntregavel | null>(() =>
    inicial?.responsavelId ? { id: inicial.responsavelId, email: inicial.responsavel?.email ?? '', nome: inicial.responsavel?.nome ?? null } : null);
  useEffect(() => {
    if (!contratoId || responsavelEscolhido || !listaAberta ||
      (buscaResponsavel.trim().length > 0 && buscaResponsavel.trim().length < 2)) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setConsultandoResponsavel(true);
      try {
        const resultado = await pesquisarResponsaveisEntregavel(contratoId, buscaResponsavel, controller.signal);
        if (!controller.signal.aborted) {
          const opcoes = resultado.itens.filter((u) => u.email.toLowerCase().includes(buscaResponsavel.trim().toLowerCase()));
          setResponsaveis(opcoes); setPesquisaConcluida(buscaResponsavel.trim().toLowerCase());
          setTotalResponsaveis(resultado.total); setIndiceDestacado(-1); setErroResponsavel('');
        }
      } catch (erro) {
        if (!controller.signal.aborted) {
          setResponsaveis([]); setPesquisaConcluida(buscaResponsavel.trim().toLowerCase()); setTotalResponsaveis(0);
          setErroResponsavel(erro instanceof ErroEntregavel ? erro.message : 'Não foi possível pesquisar e-mails.');
        }
      } finally { if (!controller.signal.aborted) setConsultandoResponsavel(false); }
    }, 280);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [contratoId, buscaResponsavel, responsavelEscolhido, listaAberta]);
  function escolherResponsavel(usuario: ResponsavelEntregavel) {
    setResponsavelEscolhido(usuario);
    atualizar('responsavelId', usuario.id);
    setBuscaResponsavel('');
    setResponsaveis([]);
    setListaAberta(false); setIndiceDestacado(-1);
  }
  function limparResponsavel() {
    setResponsavelEscolhido(null);
    atualizar('responsavelId', '');
    setBuscaResponsavel('');
    setResponsaveis([]);
    setListaAberta(false); setIndiceDestacado(-1);
  }
  const emailDigitado = buscaResponsavel.trim().toLowerCase();
  const opcoesVisiveis = responsaveis.filter((u) => u.email.toLowerCase().includes(emailDigitado));
  const aguardandoBusca = listaAberta && (emailDigitado.length === 0 || emailDigitado.length >= 2) && pesquisaConcluida !== emailDigitado;
  const formId = (campo: string) => `entregavel-${prefixo}-${campo}`;
  function atualizar<K extends keyof RascunhoEntregavel>(campo: K, valor: RascunhoEntregavel[K]) {
    setDados((prev) => ({ ...prev, [campo]: valor,
      ...(campo === 'inicioPrevisto' && mesmoDia && typeof valor === 'string' ? { terminoPrevisto: valor } : {}) }));
    setErros((prev) => { const proximo = { ...prev }; delete proximo[campo]; return proximo; });
    setErroGeral('');
  }
  function campoErro(campo: string) {
    return { 'aria-invalid': !!erros[campo], 'aria-describedby': erros[campo] ? `${formId(campo)}-erro` : undefined };
  }
  function mensagem(campo: string) {
    return erros[campo] ? <p role="alert" id={`${formId(campo)}-erro`} className="mt-1 text-xs text-error-text">{erros[campo]}</p> : null;
  }
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando.current) return; // trava síncrona contra clique duplo
    const resultado = validarEntregavel(dados, inicial);
    if (!resultado.sucesso) { setErros(resultado.erros); setErroGeral('Revise os campos destacados.'); return; }
    const ocupados = (existentes.dados ?? []).filter(e => !e.arquivadoEm && e.id !== inicial?.id).reduce((soma, e) => soma + (Number(e.peso) || 0), 0);
    const restante = Math.max(0, Math.round((100 - ocupados) * 100) / 100);
    if (existentes.dados && Number(resultado.dados.peso) > restante + 0.000001) {
      setErros(prev => ({ ...prev, peso: `Apenas ${restante.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% restante disponível para usar como peso deste entregável.` }));
      setErroGeral('Ajuste o peso operacional.'); return;
    }
    enviando.current = true; setSalvando(true); onSalvandoMudou?.(true); setErros({}); setErroGeral('');
    try { await onSalvar(resultado.dados); }
    catch (erro) { setErroGeral(erro instanceof ErroEntregavel ? erro.message : 'Não foi possível salvar. O formulário foi preservado.'); }
    finally { enviando.current = false; setSalvando(false); onSalvandoMudou?.(false); }
  }
  return <form data-tec08-formulario-contextual data-tec08-edicao={inicial ? "true" : undefined} data-tec08-criacao={inicial ? undefined : "true"} noValidate aria-label={inicial ? `Editar entregável ${inicial.nome}` : 'Cadastrar entregável'} onSubmit={(e) => void enviar(e)}
    className="min-w-0 space-y-5 rounded-xl border border-brand-green/30 bg-brand-darkgreen/10 p-4">
    <div>{!inicial && <h3 className="text-lg font-semibold text-brand-neon">Novo entregável</h3>}
      {!inicial && <p className="mt-1 text-sm text-foreground/70">Informe os dados do entregável. As evidências poderão ser cadastradas depois.</p>}</div>
    <div className="grid min-w-0 gap-5 lg:grid-cols-2">
      <section className="min-w-0 space-y-4 rounded-xl border border-brand-green/20 bg-background/30 p-3 sm:p-4" aria-label="Informações do entregável">
        <h4 className="font-semibold text-brand-neon">Informações do entregável</h4>
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_2fr]">
      <div><label className="mb-1 block text-sm" htmlFor={formId('codigo')}>Código (opcional)</label>
        <input id={formId('codigo')} className={estilo} maxLength={15} value={dados.codigo} {...campoErro('codigo')} onChange={(e) => atualizar('codigo', e.target.value)} />{mensagem('codigo')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.codigo.length}/15</span></div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('nome')}>Nome *</label>
        <input id={formId('nome')} className={estilo} maxLength={42} value={dados.nome} {...campoErro('nome')} onChange={(e) => atualizar('nome', e.target.value)} />{mensagem('nome')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.nome.length}/42</span></div>
    </div>
    <div className="space-y-2">
      <p className="block text-sm font-semibold">Responsável pelo entregável (opcional)</p>
      <p className="text-xs text-foreground/70">Escolha a pessoa que acompanhará esta entrega. O acesso ao contrato é configurado separadamente.</p>
      {responsavelEscolhido ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand-green/45 bg-brand-green/10 px-3 py-3">
        <div className="min-w-0"><p className="text-xs font-medium text-foreground/65">Responsável atribuído</p>
          <p className="max-w-full truncate font-semibold text-brand-neon" title={responsavelEscolhido.email}>{responsavelEscolhido.email || 'Usuário cadastrado'}</p>

        </div>
        <button type="button" disabled={salvando} onClick={limparResponsavel}
          className="rounded-lg border border-brand-green/45 px-3 py-2 text-sm transition-colors hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">Remover atribuição</button>
      </div> : <div className="relative">
        <label className="sr-only" htmlFor={formId('email-responsavel')}>Buscar responsável por e-mail</label>
        <div className="flex items-stretch rounded-lg border border-brand-green/45 bg-background focus-within:ring-2 focus-within:ring-brand-neon/70">
          <input id={formId('email-responsavel')} type="search" inputMode="email" autoComplete="off"
            className="min-w-0 flex-1 rounded-l-lg bg-transparent px-3 py-2.5 text-sm text-foreground outline-none aria-invalid:border-red-500"
            maxLength={100} value={buscaResponsavel} placeholder="Digite ou escolha um e-mail"
            role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded={listaAberta}
            aria-controls={formId('opcoes-responsavel')}
            aria-activedescendant={listaAberta && indiceDestacado >= 0 && opcoesVisiveis[indiceDestacado]
              ? formId(`opcao-responsavel-${opcoesVisiveis[indiceDestacado].id}`) : undefined}
            {...campoErro('responsavelId')} disabled={salvando || !contratoId}
            onChange={(e) => { setBuscaResponsavel(e.target.value); setListaAberta(true); setIndiceDestacado(-1); setConsultandoResponsavel(false); setErroResponsavel(''); }}
            onFocus={() => setListaAberta(true)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.stopPropagation(); setListaAberta(false); setIndiceDestacado(-1); }
              if (e.key === 'ArrowDown') {
                e.preventDefault(); setListaAberta(true);
                if (opcoesVisiveis.length) setIndiceDestacado((i) => (i + 1) % opcoesVisiveis.length);
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault(); setListaAberta(true);
                if (opcoesVisiveis.length) setIndiceDestacado((i) => (i <= 0 ? opcoesVisiveis.length - 1 : i - 1));
              }
              if (e.key === 'Enter' && listaAberta && opcoesVisiveis.length && (indiceDestacado >= 0 || opcoesVisiveis.length === 1)) {
                e.preventDefault(); escolherResponsavel(opcoesVisiveis[indiceDestacado >= 0 ? indiceDestacado : 0]);
              }
            }} />
          <button type="button" disabled={salvando || !contratoId} aria-haspopup="listbox"
            aria-controls={formId('opcoes-responsavel')} aria-expanded={listaAberta}
            aria-label={listaAberta ? 'Fechar lista de responsáveis' : 'Abrir lista de responsáveis'}
            title={listaAberta ? 'Fechar lista' : 'Mostrar usuários ativos'}
            className="inline-flex w-11 shrink-0 cursor-pointer items-center justify-center rounded-r-lg border-l border-brand-green/45 text-brand-neon transition-colors duration-200 hover:bg-brand-green/20 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => { setListaAberta((aberta) => !aberta); setIndiceDestacado(-1); }}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              className={`h-5 w-5 transition-transform duration-200 ${listaAberta ? 'rotate-180' : ''}`}>
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
        {listaAberta && <div id={formId('opcoes-responsavel')} role="listbox" aria-label="E-mails encontrados"
          className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-brand-green/50 bg-background p-1 shadow-2xl">
          {(consultandoResponsavel || aguardandoBusca) && <p role="status" className="px-3 py-2 text-xs text-foreground/65">Buscando e-mails...</p>}
          {!consultandoResponsavel && !aguardandoBusca && !opcoesVisiveis.length && <p className="px-3 py-2 text-xs text-foreground/65">
            {buscaResponsavel.length === 1 ? 'Digite mais um caractere para pesquisar.' : 'Nenhum e-mail disponível para essa busca.'}
          </p>}
          {!aguardandoBusca && opcoesVisiveis.map((usuario, indice) => <button key={usuario.id} id={formId(`opcao-responsavel-${usuario.id}`)}
            role="option" aria-selected={indice === indiceDestacado} type="button"
            className={`block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-brand-neon ${indice === indiceDestacado ? 'bg-brand-green/25' : 'hover:bg-brand-green/20'}`}
            onMouseDown={(e) => e.preventDefault()} onMouseEnter={() => setIndiceDestacado(indice)}
            onClick={() => escolherResponsavel(usuario)}>
            <span className="block max-w-full truncate font-medium" title={usuario.email}>{usuario.email}</span>
          </button>)}
          {!consultandoResponsavel && !aguardandoBusca && totalResponsaveis > opcoesVisiveis.length && <p className="border-t border-brand-green/20 px-3 py-2 text-xs text-foreground/65">
            Mostrando até {opcoesVisiveis.length} de {totalResponsaveis} contas ativas; refine pelo e-mail.
          </p>}
        </div>}
      </div>}
      {!responsavelEscolhido && <p className="text-xs text-foreground/65">Nenhum responsável atribuído. Digite parte do e-mail ou abra a lista de usuários ativos e selecione uma opção.</p>}
      {erroResponsavel && <p role="alert" className="text-xs text-error-text">{erroResponsavel}</p>}
      {!erroResponsavel && !consultandoResponsavel && !responsavelEscolhido && buscaResponsavel.length >= 2 && !responsaveis.length && !listaAberta &&
        <p className="text-xs text-foreground/65">Nenhum usuário ativo encontrado com esse e-mail.</p>}
      {mensagem('responsavelId')}
    </div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('descricao')}>Descrição (opcional)</label>
      <textarea id={formId('descricao')} className={estilo} rows={3} maxLength={220} value={dados.descricao}
        onChange={(e) => atualizar('descricao', e.target.value)} />{mensagem('descricao')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.descricao.length}/220</span></div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('observacoes')}>Observações (opcional)</label>
      <textarea id={formId('observacoes')} className={estilo} rows={2} maxLength={120} value={dados.observacoes}
        onChange={(e) => atualizar('observacoes', e.target.value)} />{mensagem('observacoes')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.observacoes.length}/120</span></div>
      </section>
      <section className="min-w-0 space-y-4 rounded-xl border border-brand-green/25 bg-brand-green/[0.04] p-3 sm:p-4" aria-label="Planejamento do entregável">
        <h4 className="font-semibold text-brand-neon">Planejamento do entregável</h4>
    <div className="space-y-2">
      <label className="mb-1 block text-sm font-semibold" htmlFor={formId('tipo')}>Tipo de entregável *</label>
      {inicial ? <div className="rounded-lg border border-violet-400/25 bg-violet-400/[0.06] px-3 py-2">
        <p className="font-semibold">{ROTULOS_TIPO[dados.tipo]}</p>
        <p className="mt-1 text-xs text-foreground/65">O tipo não pode ser alterado após o cadastro. Para mudar, crie um novo entregável.</p>
      </div> : <select id={formId('tipo')} className={estilo} value={dados.tipo}
        onChange={e => { const tipo = e.target.value as RascunhoEntregavel['tipo'];
          setDados(v => ({ ...v, tipo, quantidadePrevista: '', unidadeMedida: '', periodicidade: '' }));
          setMesmoDia(false); setErros({}); }}>
        {Object.entries(ROTULOS_TIPO).map(([chave, rotulo]) => <option key={chave} value={chave}>{rotulo}</option>)}
      </select>}
    </div>
    {dados.tipo === 'QUANTITATIVO' && <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm" htmlFor={formId('quantidadePrevista')}>Quantidade prevista *</label>
        <input id={formId('quantidadePrevista')} placeholder="Ex.: 20" maxLength={18} inputMode="decimal" className={estilo} value={dados.quantidadePrevista}
          onChange={e => atualizar('quantidadePrevista', e.target.value)} {...campoErro('quantidadePrevista')} />{mensagem('quantidadePrevista')}</div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('unidadeMedida')}>Unidade de medida *</label>
        <input id={formId('unidadeMedida')} placeholder="Ex.: computadores limpos" maxLength={40} className={estilo} value={dados.unidadeMedida}
          onChange={e => atualizar('unidadeMedida', e.target.value)} {...campoErro('unidadeMedida')} />{mensagem('unidadeMedida')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.unidadeMedida.length}/40</span></div>
    </div>}
    {dados.tipo === 'RECORRENTE' && <div><label className="mb-1 block text-sm" htmlFor={formId('periodicidade')}>Periodicidade *</label>
      <select id={formId('periodicidade')} disabled={agendaBloqueada} className={`${estilo} disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.periodicidade}
        onChange={e => atualizar('periodicidade', e.target.value as RascunhoEntregavel['periodicidade'])} {...campoErro('periodicidade')}>
        <option value="">Selecione</option>
        {([['DIARIA','Diária'],['SEMANAL','Semanal'],['MENSAL','Mensal'],['TRIMESTRAL','Trimestral'],['SEMESTRAL','Semestral'],['ANUAL','Anual']] as const).map(([v,t])=><option key={v} value={v}>{t}</option>)}
      </select>{mensagem('periodicidade')}{agendaBloqueada && <p className="mt-1 text-xs text-foreground/65">Somente leitura: requer permissão de replanejamento.</p>}</div>}
    <div className={`grid gap-4 ${mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo) ? '' : 'sm:grid-cols-2'}`}>
      <div><label className="mb-1 block text-sm" htmlFor={formId('inicioPrevisto')}>{mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo) ? 'Data prevista *' : 'Início previsto *'}</label>
        <input id={formId('inicioPrevisto')} type="date" disabled={agendaBloqueada} className={`${estilo} disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.inicioPrevisto} {...campoErro('inicioPrevisto')}
          onChange={(e) => atualizar('inicioPrevisto', e.target.value)} />{mensagem('inicioPrevisto')}</div>
      {!(mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo)) && <div><label className="mb-1 block text-sm" htmlFor={formId('terminoPrevisto')}>Término previsto</label>
        <input id={formId('terminoPrevisto')} type="date" disabled={agendaBloqueada} className={`${estilo} disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.terminoPrevisto} {...campoErro('terminoPrevisto')}
          onChange={(e) => atualizar('terminoPrevisto', e.target.value)} />{mensagem('terminoPrevisto')}</div>}
    </div>
    {['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo) && <>
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/80">
      <input type="checkbox" checked={mesmoDia} onChange={evento => {
        const marcado = evento.target.checked;
        setMesmoDia(marcado);
        atualizar('terminoPrevisto', marcado ? dados.inicioPrevisto : '');
      }} className="h-4 w-4 accent-brand-green" />
      Mesma data do início (entrega prevista para um único dia)
    </label>
    </>}
    <div><label className="mb-1 block text-sm" htmlFor={formId('peso')}>Peso operacional (%) *</label>
      <input id={formId('peso')} maxLength={6} disabled={pesoBloqueado} className={`${estilo} max-w-32 disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} inputMode="decimal" value={dados.peso} {...campoErro('peso')}
        placeholder="Ex.: 20,00" onChange={(e) => atualizar('peso', decimalDigitado(e.target.value))} onBlur={() => { if (dados.peso && decimalValido(dados.peso, 100, Boolean(inicial?.peso != null && Number(inicial.peso) === 0))) atualizar('peso', decimalExibicao(dados.peso)); }} />{mensagem('peso')}<span className="mt-1 block text-right text-[11px] text-foreground/60">Até 100,00%</span>
      <p className="mt-1 text-xs text-foreground/65">% dos 100% que representa o contrato para este entregável.</p>
      {pesoBloqueado && <p className="mt-1 text-xs text-foreground/65">Somente leitura: requer permissão Configurar pesos.</p>}</div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('criterioConclusao')}>Critério de conclusão {['CONTINUO','MARCO'].includes(dados.tipo) ? '*' : '(opcional)'}</label>
      <textarea id={formId('criterioConclusao')} className={estilo} rows={3} maxLength={350} value={dados.criterioConclusao} {...campoErro('criterioConclusao')}
        onChange={(e) => atualizar('criterioConclusao', e.target.value)} />{mensagem('criterioConclusao')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.criterioConclusao.length}/350</span></div>
      </section>
    </div>
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/45 p-3 text-sm text-error-text">{erroGeral}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand-green/20 pt-4" role="group" aria-label="Ações de edição do entregável">
      {inicial && onArquivar ? <button type="button" onClick={onArquivar} ref={referenciaArquivar} disabled={salvando}
        className="inline-flex min-h-9 items-center rounded-lg border border-amber-500/45 px-3 py-1.5 text-xs font-semibold text-amber-200 hover:bg-amber-500/10 disabled:opacity-50">Arquivar entregável</button> : <span aria-hidden="true" />}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button type="button" className="rounded-lg border border-brand-green/40 px-3 py-1.5 text-xs disabled:opacity-50" disabled={salvando} onClick={onCancelar}>Cancelar</button>
        <button type="submit" aria-busy={salvando} disabled={salvando}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-green px-3 py-1.5 text-xs font-semibold text-on-brand-green disabled:opacity-50">
          {!salvando && <Seta />}{salvando ? 'Salvando...' : inicial ? 'Salvar alterações' : 'Cadastrar entregável'}
        </button>
      </div>
    </div>
  </form>;
}
