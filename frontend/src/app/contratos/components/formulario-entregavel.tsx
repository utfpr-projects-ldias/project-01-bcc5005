'use client';
import { IconeTipoEntregavel } from './icone-tipo-entregavel';
import { CampoDataCivil } from '@/app/components/campo-data-civil';
import { useCallback, useId, useRef, useState, type Ref, type FormEvent } from 'react';
import { ErroEntregavel, ROTULOS_TIPO, pesquisarResponsaveisEntregavel, type Entregavel } from '@/lib/entregaveis';
import { SeletorResponsavel, type OpcaoResponsavel } from './seletor-responsavel';
import { decimalDigitado } from '@/lib/campos-numericos';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { pesoDisponivelContrato, saldoPesosRascunho } from '@/lib/peso-disponivel-contrato';
import { inicialEntregavel,
  normalizarDecimalPlanejamento, validarEntregavel, type DadosPlanejamentoEntregavel, type ErrosEntregavel, type RascunhoEntregavel } from '@/lib/validacao-entregavel';

import { intervaloVigencia, validarDatasNaVigencia, type VigenciaPlanejamento } from '@/lib/vigencia-planejamento';

const estilo = 'w-full min-w-0 rounded-lg border border-brand-green/35 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-neon aria-invalid:border-red-500';

function Seta() { return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m4 10 4 4 8-8" /></svg>; }
export function FormularioEntregavel({ contratoId, etapaId, vigencia, inicial, onSalvar, onCancelar, onArquivar, referenciaArquivar, onSalvandoMudou, podeConfigurarPesos = !inicial, podeReplanejarOcorrencias = false, secaoEdicao, pesosContrato, modoCalculo = 'SIMPLES' }: {
  contratoId?: string; etapaId: string; vigencia?: VigenciaPlanejamento; inicial?: Entregavel; onSalvar: (dados: DadosPlanejamentoEntregavel, base?: Entregavel) => Promise<void>;
  onCancelar: () => void; onArquivar?: () => void; referenciaArquivar?: Ref<HTMLButtonElement>; onSalvandoMudou?: (salvando: boolean) => void;
  podeAlterarObrigatoriedade?: boolean; podeCriarEvidencias?: boolean;
  podeConfigurarPesos?: boolean; podeReplanejarOcorrencias?: boolean; secaoEdicao?: 'informacoes' | 'planejamento' | 'completo';
  pesosContrato?: Array<{ id: string; peso: string | null; arquivadoEm?: string | null; etapaArquivada?: boolean }>; modoCalculo?: 'SIMPLES' | 'PONDERADO';
}) {
  const disponibilidade = pesoDisponivelContrato(pesosContrato, inicial?.id);
  const pesoMaximo = disponibilidade;
  const prefixo = useId().replace(/:/g, '');
  const agendaBloqueada = Boolean(inicial?.tipo === 'RECORRENTE' && !podeReplanejarOcorrencias);
  const pesoBloqueado = !podeConfigurarPesos;
  const base = useRef(inicial).current;
  const enviando = useRef(false);
  const [dados, setDados] = useState<RascunhoEntregavel>(() => ({ ...inicialEntregavel(etapaId, base), ...(!base && pesoBloqueado ? {peso:'0'} : {}) }));
  const saldoProjetado = saldoPesosRascunho(pesosContrato, inicial?.id, dados.peso);
  const [avisoPeso, setAvisoPeso] = useState<DadosPlanejamentoEntregavel | null>(null);
  const formatarPeso = (valor: number) => valor.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
  const [mesmoDia, setMesmoDia] = useState(() => Boolean(inicial?.inicioPrevisto && inicial.inicioPrevisto === inicial.terminoPrevisto));
  const [erros, setErros] = useState<ErrosEntregavel>({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [responsavelSelecionado, setResponsavelSelecionado] = useState<OpcaoResponsavel | null>(() =>
    inicial?.responsavelId ? { id: inicial.responsavelId, email: inicial.responsavel?.email ?? '', nome: inicial.responsavel?.nome ?? null } : null);
  const pesquisarResponsavel = useCallback((termo: string, signal: AbortSignal) => {
    if (!contratoId) return Promise.resolve({ itens: [], total: 0 });
    return pesquisarResponsaveisEntregavel(contratoId, termo, signal);
  }, [contratoId]);
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
    if (enviando.current || avisoPeso) return; // trava síncrona contra clique duplo
    const resultado = validarEntregavel(dados, base);
    if (!resultado.sucesso) { setErros(resultado.erros); setErroGeral('Revise os campos destacados.'); return; }
    const errosVigencia = validarDatasNaVigencia(resultado.dados, vigencia, base);
    if (Object.keys(errosVigencia).length) { setErros(errosVigencia); setErroGeral('Revise as datas previstas.'); return; }
    if (pesoMaximo !== null && modoCalculo === 'PONDERADO' && Number(resultado.dados.peso ?? '0') > pesoMaximo + 0.000001 &&
        !(base?.peso != null && Number(dados.peso.replace(',', '.')) === Number(base.peso))) {
      setErros({ peso: `Disponível apenas ${pesoMaximo.toLocaleString('pt-BR', { maximumFractionDigits: 4 })}% para este entregável.` });
      setErroGeral('Revise o peso operacional.'); return;
    }
    if (modoCalculo === 'SIMPLES' && Number(resultado.dados.peso) > 0 && (!base || (!pesoBloqueado && Number(resultado.dados.peso) !== Number(base.peso)))) {
      setAvisoPeso(resultado.dados); return;
    }
    await persistir(resultado.dados);
  }
  async function persistir(valor: DadosPlanejamentoEntregavel) {
    if (enviando.current) return;
    setAvisoPeso(null);
    // O servidor valida a distribuição apenas quando o modo é PONDERADO.
    // A soma dos pesos cadastrados não pode bloquear o modo SIMPLES.
    enviando.current = true; setSalvando(true); onSalvandoMudou?.(true); setErros({}); setErroGeral('');
    try { if (base) await onSalvar(valor, base); else await onSalvar(valor); }
    catch (erro) { setErroGeral(erro instanceof ErroEntregavel ? erro.message : 'Não foi possível salvar. O formulário foi preservado.'); }
    finally { enviando.current = false; setSalvando(false); onSalvandoMudou?.(false); }
  }
  return <><form data-tec08-formulario-contextual data-tec08-edicao={inicial ? "true" : undefined} data-tec08-criacao={inicial ? undefined : "true"} noValidate aria-label={inicial ? `Editar entregável ${inicial.nome}` : 'Cadastrar entregável'} onSubmit={(e) => void enviar(e)}
    className="pi-form-entregavel min-w-0 space-y-3">
    <fieldset className="min-w-0 space-y-2"><legend className="text-sm font-semibold">Tipo de entregável *</legend>
      {inicial ? <p className="text-sm font-medium">{ROTULOS_TIPO[dados.tipo]} <span className="text-xs font-normal text-foreground/65">· Tipo definido no cadastro</span></p> : <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-5">{(Object.entries(ROTULOS_TIPO) as [RascunhoEntregavel['tipo'],string][]).map(([tipo,rotulo])=><label key={tipo} htmlFor={formId(`tipo-${tipo}`)} className="pi-opcao-origem pi-tipo-cadastro flex min-w-0 cursor-pointer items-center gap-2 rounded-lg border border-current/15 px-2.5 py-2 text-xs font-medium"><input id={formId(`tipo-${tipo}`)} className="pi-radio-area" type="radio" name={formId('tipo')} value={tipo} checked={dados.tipo===tipo} onChange={()=>{setDados(v=>({...v,tipo,quantidadePrevista:'',unidadeMedida:'',periodicidade:'',modoRecorrente:'DESCRITIVO'}));setMesmoDia(false);setErros({});}}/><IconeTipoEntregavel tipo={tipo}/>{rotulo}</label>)}</div>}
    </fieldset>
    <div className="pi-form-colunas">
      {(!inicial || secaoEdicao !== 'planejamento') && <section className="min-w-0 space-y-3" aria-label="Informações do entregável">
        {!inicial && <h4 className="pi-titulo-formulario">Informações do entregável</h4>}
    <div className="grid gap-3 sm:grid-cols-[minmax(5rem,8rem)_minmax(0,1fr)]">
      <div><label className="mb-1 block text-sm" htmlFor={formId('codigo')}>Código (opcional)</label>
        <input id={formId('codigo')} className={`${estilo} max-w-32`} maxLength={Math.max(15, base?.codigo?.length ?? 0)} value={dados.codigo} {...campoErro('codigo')} onChange={(e) => atualizar('codigo', e.target.value)} />{mensagem('codigo')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{[...dados.codigo].length}/15</span></div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('nome')}>Nome *</label>
        <input id={formId('nome')} className={estilo} maxLength={Math.max(45, base?.nome.length ?? 0)} value={dados.nome} {...campoErro('nome')} onChange={(e) => atualizar('nome', e.target.value)} />{mensagem('nome')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{[...dados.nome].length}/45</span></div>
    </div>
    <div className="space-y-2">
      <SeletorResponsavel id={formId('email-responsavel')} rotulo="Responsável pelo entregável (opcional)"
        valor={dados.responsavelId || null} selecionado={responsavelSelecionado} pesquisar={pesquisarResponsavel}
        desabilitado={salvando || !contratoId} erro={erros.responsavelId}
        onChange={(id, usuario) => { setResponsavelSelecionado(usuario ?? null); atualizar('responsavelId', id ?? ''); }} />
      <p className="text-xs text-foreground/65">Escolha a pessoa que acompanhará esta entrega. O acesso ao contrato é configurado separadamente.</p>
    </div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('descricao')}>Descrição (opcional)</label>
      <textarea id={formId('descricao')} className={estilo} rows={2} maxLength={Math.max(200, base?.descricao?.length ?? 0)} value={dados.descricao}
        onChange={(e) => atualizar('descricao', e.target.value)} />{mensagem('descricao')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.descricao.length}/200</span></div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('observacoes')}>Observações (opcional)</label>
      <textarea id={formId('observacoes')} className={estilo} rows={2} maxLength={Math.max(100, base?.observacoes?.length ?? 0)} value={dados.observacoes}
        onChange={(e) => atualizar('observacoes', e.target.value)} />{mensagem('observacoes')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.observacoes.length}/100</span></div>
      </section>}
      {(!inicial || secaoEdicao !== 'informacoes') && <section className="min-w-0 space-y-3" aria-label="Planejamento do entregável">
        <h4 className="pi-titulo-formulario">Planejamento do entregável</h4>
    {dados.tipo === 'QUANTITATIVO' && <div className="grid gap-3 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm" htmlFor={formId('quantidadePrevista')}>Quantidade prevista *</label>
        <input id={formId('quantidadePrevista')} placeholder="Ex.: 20" maxLength={19} inputMode="decimal" className={`${estilo} max-w-44`} value={dados.quantidadePrevista}
          onChange={e => atualizar('quantidadePrevista', e.target.value)} {...campoErro('quantidadePrevista')} />{mensagem('quantidadePrevista')}</div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('unidadeMedida')}>Unidade de medida *</label>
        <input id={formId('unidadeMedida')} placeholder="Ex.: computadores limpos" maxLength={Math.max(40, base?.unidadeMedida?.length ?? 0)} className={estilo} value={dados.unidadeMedida}
          onChange={e => atualizar('unidadeMedida', e.target.value)} {...campoErro('unidadeMedida')} />{mensagem('unidadeMedida')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.unidadeMedida.length}/40</span></div>
    </div>}
    {dados.tipo === 'RECORRENTE' && <div className="pi-recorrente-planejamento"><div><label className="mb-1 block text-sm" htmlFor={formId('modoRecorrente')}>Medição recorrente</label><select id={formId('modoRecorrente')} className={estilo} disabled={agendaBloqueada} value={dados.modoRecorrente??''} onChange={e=>{const modo=(e.target.value||undefined) as RascunhoEntregavel['modoRecorrente'];setDados(v=>({...v,modoRecorrente:modo,...(!inicial&&modo==='DESCRITIVO'?{unidadeMedida:''}:{})}));}}>{!dados.modoRecorrente&&<option value="" disabled>Selecione a modalidade</option>}<option value="DESCRITIVO">Descritiva</option><option value="QUANTITATIVO">Quantitativa</option></select></div>{dados.modoRecorrente!=='DESCRITIVO'&&<div><label className="mb-1 block text-sm" htmlFor={formId('unidadeMedida')} title="Para períodos quantitativos">Unidade de medida {dados.modoRecorrente==='QUANTITATIVO'?'*':''}</label>
      <input id={formId('unidadeMedida')} maxLength={Math.max(40, base?.unidadeMedida?.length ?? 0)} placeholder="Ex.: computadores" className={estilo}
        value={dados.unidadeMedida} onChange={e => atualizar('unidadeMedida', e.target.value)} />
      {mensagem('unidadeMedida')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.unidadeMedida.length}/40</span>
    </div>}
    <div><label className="mb-1 block text-sm" htmlFor={formId('periodicidade')}>Periodicidade *</label>
      <select id={formId('periodicidade')} disabled={agendaBloqueada} className={`${estilo} max-w-52 disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.periodicidade}
        onChange={e => atualizar('periodicidade', e.target.value as RascunhoEntregavel['periodicidade'])} {...campoErro('periodicidade')}>
        <option value="">Selecione</option>
        {([['DIARIA','Diária'],['SEMANAL','Semanal'],['MENSAL','Mensal'],['TRIMESTRAL','Trimestral'],['SEMESTRAL','Semestral'],['ANUAL','Anual']] as const).map(([v,t])=><option key={v} value={v}>{t}</option>)}
      </select>{mensagem('periodicidade')}{agendaBloqueada && <p className="mt-1 text-xs text-foreground/65">Somente leitura: requer permissão de replanejamento.</p>}</div></div>}
    {vigencia && <p className="text-xs text-foreground/70">Vigência do contrato: {intervaloVigencia(vigencia)}</p>}
    <div className={`pi-datas-pareadas ${mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo) ? 'pi-data-unica' : ''}`}>
      <div><label className="mb-1 block text-sm" htmlFor={formId('inicioPrevisto')}>{mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo) ? 'Data prevista *' : 'Início previsto *'}</label>
        <CampoDataCivil id={formId('inicioPrevisto')} min={vigencia?.inicioVigencia} max={vigencia?.terminoVigencia} disabled={agendaBloqueada} className={`${estilo} tec08-data-hora max-w-52 disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.inicioPrevisto} {...campoErro('inicioPrevisto')}
          onChange={(e) => atualizar('inicioPrevisto', e.target.value)} />{mensagem('inicioPrevisto')}</div>
      {!(mesmoDia && ['UNICO','MARCO','QUANTITATIVO'].includes(dados.tipo)) && <div><label className="mb-1 block text-sm" htmlFor={formId('terminoPrevisto')}>Término previsto</label>
        <CampoDataCivil id={formId('terminoPrevisto')} min={vigencia?.inicioVigencia} max={vigencia?.terminoVigencia} disabled={agendaBloqueada} className={`${estilo} tec08-data-hora max-w-52 disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} value={dados.terminoPrevisto} {...campoErro('terminoPrevisto')}
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
    <div><label className="mb-1 block text-sm" htmlFor={formId('criterioConclusao')}>Critério de conclusão {['CONTINUO','MARCO'].includes(dados.tipo) ? '*' : '(opcional)'}</label>
      <textarea id={formId('criterioConclusao')} className={estilo} rows={2} maxLength={Math.max(200, base?.criterioConclusao?.length ?? 0)} value={dados.criterioConclusao} {...campoErro('criterioConclusao')}
        onChange={(e) => atualizar('criterioConclusao', e.target.value)} />{mensagem('criterioConclusao')}<span className="mt-1 block text-right text-[11px] text-foreground/60">{dados.criterioConclusao.length}/200</span></div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('peso')}>Peso operacional (%) *</label>
      <input id={formId('peso')} maxLength={8} disabled={pesoBloqueado} className={`${estilo} max-w-32 disabled:cursor-not-allowed disabled:bg-slate-500/15 disabled:opacity-55`} inputMode="decimal" value={dados.peso} {...campoErro('peso')}
        placeholder="Ex.: 20,00" onChange={(e) => atualizar('peso', decimalDigitado(e.target.value, 100, 4))} onBlur={() => { if (dados.peso && /^(?:\d{1,3})(?:[,.]\d{1,4})?$/.test(dados.peso) && Number(dados.peso.replace(',', '.')) <= 100) atualizar('peso', normalizarDecimalPlanejamento(dados.peso).replace('.', ',')); }} />{mensagem('peso')}<div className="pi-saldo-pesos pi-saldo-pesos-lado" aria-live="polite">
        {saldoProjetado === null ? <p>Saldo dos pesos indisponível no momento.</p> : <p data-excedente={saldoProjetado < 0}>{saldoProjetado < 0 ? <>Excedente de <strong>{formatarPeso(-saldoProjetado)}%</strong> na distribuição</> : <>Disponível <strong>{formatarPeso(saldoProjetado)}%</strong> para distribuição dos pesos</>}{modoCalculo === 'SIMPLES' && ' (Média ponderada).'}</p>}
        {modoCalculo === 'SIMPLES' && <p className="pi-peso-informativo">O peso não tem efeito na Média simples.</p>}
      </div>
      {pesoBloqueado && <p className="mt-1 text-xs text-foreground/65">Somente leitura: requer permissão Configurar pesos.</p>}</div>
      </section>}
    </div>
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/45 p-3 text-sm text-error-text">{erroGeral}</p>}
    <div className="pi-rodape-formulario flex flex-wrap items-center justify-between gap-3 border-t border-current/15 pt-3" role="group" aria-label="Ações de edição do entregável">
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
  </form>{avisoPeso && <ConfirmacaoSimples titulo="Peso operacional informativo" descricao="O contrato utiliza Média simples. O peso será salvo, mas não influencia a execução do contrato. Para utilizá-lo, configure a Média ponderada em Editar execução, com pesos totalizando 100%." confirmar="Entendi" somenteConfirmar neutro onCancelar={()=>setAvisoPeso(null)} onConfirmar={()=>void persistir(avisoPeso)}/>}</>;
}
