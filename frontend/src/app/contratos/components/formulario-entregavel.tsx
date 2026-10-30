'use client';
import { useId, useRef, useState, type FormEvent } from 'react';
import { ErroEntregavel, ROTULOS_PERIODICIDADE, ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';
import { DESCRICOES_TIPO, PERIODICIDADES, TIPOS, inicialEntregavel, mudouEstrutura,
  validarEntregavel, type DadosPlanejamentoEntregavel, type ErrosEntregavel, type RascunhoEntregavel } from '@/lib/validacao-entregavel';

const estilo = 'w-full min-w-0 rounded-lg border border-brand-green/35 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-neon aria-invalid:border-red-500';
function Seta() { return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="m4 10 4 4 8-8" /></svg>; }
export function FormularioEntregavel({ etapaId, inicial, onSalvar, onCancelar, onSalvandoMudou }: {
  etapaId: string; inicial?: Entregavel; onSalvar: (dados: DadosPlanejamentoEntregavel) => Promise<void>;
  onCancelar: () => void; onSalvandoMudou?: (salvando: boolean) => void;
}) {
  const prefixo = useId().replace(/:/g, '');
  const proximaChave = useRef(0);
  const enviando = useRef(false);
  const [dados, setDados] = useState<RascunhoEntregavel>(() => inicialEntregavel(etapaId, inicial));
  const [erros, setErros] = useState<ErrosEntregavel>({});
  const [erroGeral, setErroGeral] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const estrutural = mudouEstrutura(dados, inicial);
  const excluidos = !!inicial && inicial.evidenciasEsperadas.some((e) => !dados.evidenciasEsperadas.some((item) => item.id === e.id));
  const exigeConfirmacao = estrutural || excluidos;
  const formId = (campo: string) => `entregavel-${prefixo}-${campo}`;
  function atualizar<K extends keyof RascunhoEntregavel>(campo: K, valor: RascunhoEntregavel[K]) {
    setDados((prev) => ({ ...prev, [campo]: valor }));
    setErros((prev) => { const proximo = { ...prev }; delete proximo[campo]; return proximo; });
    setErroGeral('');
    if (['tipo', 'periodicidade', 'inicioPrevisto', 'terminoPrevisto', 'etapaId'].includes(campo)) setConfirmado(false);
  }
  function campoErro(campo: string) {
    return { 'aria-invalid': !!erros[campo], 'aria-describedby': erros[campo] ? `${formId(campo)}-erro` : undefined };
  }
  function mensagem(campo: string) {
    return erros[campo] ? <p role="alert" id={`${formId(campo)}-erro`} className="mt-1 text-xs text-red-400">{erros[campo]}</p> : null;
  }
  function trocarItem(indice: number, campo: 'tipoEvidencia' | 'descricao' | 'obrigatoria', valor: string | boolean) {
    setDados((prev) => ({ ...prev, evidenciasEsperadas: prev.evidenciasEsperadas.map((e, i) => i === indice ? { ...e, [campo]: valor } : e) }));
    setErros((prev) => { const proximo = { ...prev }; delete proximo[`evidencias.${indice}.${campo}`]; return proximo; }); setErroGeral('');
  }
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (enviando.current) return; // trava síncrona contra clique duplo
    const resultado = validarEntregavel(dados);
    if (!resultado.sucesso) { setErros(resultado.erros); setErroGeral('Revise os campos destacados.'); return; }
    if (exigeConfirmacao && !confirmado) {
      setErroGeral('Confirme que compreendeu o impacto do replanejamento ou remoção de itens.'); return;
    }
    enviando.current = true; setSalvando(true); onSalvandoMudou?.(true); setErros({}); setErroGeral('');
    try { await onSalvar(resultado.dados); }
    catch (erro) { setErroGeral(erro instanceof ErroEntregavel ? erro.message : 'Não foi possível salvar. O formulário foi preservado.'); }
    finally { enviando.current = false; setSalvando(false); onSalvandoMudou?.(false); }
  }
  return <form noValidate aria-label={inicial ? `Editar entregável ${inicial.nome}` : 'Cadastrar entregável'} onSubmit={(e) => void enviar(e)}
    className="min-w-0 space-y-5 rounded-2xl border border-brand-green/40 bg-brand-darkgreen/10 p-4 md:p-6">
    <div><h3 className="text-lg font-semibold text-brand-neon">{inicial ? 'Editar entregável' : 'Novo entregável'}</h3>
      <p className="mt-1 text-sm text-foreground/70">Planejamento da etapa selecionada. Evidências esperadas não são arquivos enviados.</p></div>
    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_2fr]">
      <div><label className="mb-1 block text-sm" htmlFor={formId('codigo')}>Código (opcional)</label>
        <input id={formId('codigo')} className={estilo} maxLength={50} value={dados.codigo} {...campoErro('codigo')} onChange={(e) => atualizar('codigo', e.target.value)} />{mensagem('codigo')}</div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('nome')}>Nome *</label>
        <input id={formId('nome')} className={estilo} maxLength={255} value={dados.nome} {...campoErro('nome')} onChange={(e) => atualizar('nome', e.target.value)} />{mensagem('nome')}</div>
    </div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('tipo')}>Tipo *</label>
      <select id={formId('tipo')} className={estilo} value={dados.tipo} {...campoErro('tipo')}
        onChange={(e) => atualizar('tipo', e.target.value as RascunhoEntregavel['tipo'])}>
        {TIPOS.map((tipo) => <option value={tipo} key={tipo}>{ROTULOS_TIPO[tipo]}</option>)}
      </select>{mensagem('tipo')}
      <p role="note" className="mt-1 text-sm text-foreground/70">{DESCRICOES_TIPO[dados.tipo]}</p>
    </div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('descricao')}>Descrição (opcional)</label>
      <textarea id={formId('descricao')} className={estilo} rows={3} maxLength={3000} value={dados.descricao}
        onChange={(e) => atualizar('descricao', e.target.value)} />{mensagem('descricao')}</div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm" htmlFor={formId('inicioPrevisto')}>Início previsto</label>
        <input id={formId('inicioPrevisto')} type="date" className={estilo} value={dados.inicioPrevisto} {...campoErro('inicioPrevisto')}
          onChange={(e) => atualizar('inicioPrevisto', e.target.value)} />{mensagem('inicioPrevisto')}</div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('terminoPrevisto')}>Término previsto</label>
        <input id={formId('terminoPrevisto')} type="date" className={estilo} value={dados.terminoPrevisto} {...campoErro('terminoPrevisto')}
          onChange={(e) => atualizar('terminoPrevisto', e.target.value)} />{mensagem('terminoPrevisto')}</div>
    </div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('responsavelId')}>Responsável cadastral (UUID v4, opcional)</label>
      <input id={formId('responsavelId')} className={estilo} value={dados.responsavelId} {...campoErro('responsavelId')}
        placeholder="Identificador do usuário ativo" onChange={(e) => atualizar('responsavelId', e.target.value)} />
      {mensagem('responsavelId')}
      <p className="mt-1 text-xs text-foreground/65">O responsável deve existir e estar ativo. Informar o ID não concede acesso ao contrato; permissões são definidas na Administração.</p>
    </div>
    {dados.tipo === 'QUANTITATIVO' && <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="mb-1 block text-sm" htmlFor={formId('quantidadePrevista')}>Quantidade prevista *</label>
        <input id={formId('quantidadePrevista')} className={estilo} inputMode="decimal" value={dados.quantidadePrevista} {...campoErro('quantidadePrevista')}
          placeholder="Ex.: 120.500" onChange={(e) => atualizar('quantidadePrevista', e.target.value)} />{mensagem('quantidadePrevista')}</div>
      <div><label className="mb-1 block text-sm" htmlFor={formId('unidadeMedida')}>Unidade de medida *</label>
        <input id={formId('unidadeMedida')} className={estilo} maxLength={80} value={dados.unidadeMedida} {...campoErro('unidadeMedida')}
          placeholder="Ex.: unidades, páginas" onChange={(e) => atualizar('unidadeMedida', e.target.value)} />{mensagem('unidadeMedida')}</div>
    </div>}
    {dados.tipo === 'RECORRENTE' && <div><label className="mb-1 block text-sm" htmlFor={formId('periodicidade')}>Periodicidade fixa *</label>
      <select id={formId('periodicidade')} className={estilo} value={dados.periodicidade} {...campoErro('periodicidade')}
        onChange={(e) => atualizar('periodicidade', e.target.value as RascunhoEntregavel['periodicidade'])}>
        <option value="">Selecione</option>{PERIODICIDADES.map((p) => <option key={p} value={p}>{ROTULOS_PERIODICIDADE[p]}</option>)}
      </select>{mensagem('periodicidade')}
      <p className="mt-1 text-xs text-foreground/65">Configuração enviada: versão 1. Personalizada ainda não foi homologada; ocorrências serão geradas na HU09.</p>
    </div>}
    <div><label className="mb-1 block text-sm" htmlFor={formId('peso')}>Peso operacional (%) — opcional</label>
      <input id={formId('peso')} className={estilo} inputMode="decimal" value={dados.peso} {...campoErro('peso')}
        placeholder="Ex.: 20.0000" onChange={(e) => atualizar('peso', e.target.value)} />{mensagem('peso')}
      <p className="mt-1 text-xs text-foreground/65">Peso físico, não financeiro. No modo ponderado, a soma de 100% entre entregáveis será validada em TEC09; não é requisito individual.</p></div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('criterioConclusao')}>Critério de conclusão {['CONTINUO','MARCO'].includes(dados.tipo) ? '*' : '(opcional)'}</label>
      <textarea id={formId('criterioConclusao')} className={estilo} rows={3} maxLength={5000} value={dados.criterioConclusao} {...campoErro('criterioConclusao')}
        onChange={(e) => atualizar('criterioConclusao', e.target.value)} />{mensagem('criterioConclusao')}</div>
    <div><label className="mb-1 block text-sm" htmlFor={formId('observacoes')}>Observações (opcional)</label>
      <textarea id={formId('observacoes')} className={estilo} rows={2} maxLength={3000} value={dados.observacoes}
        onChange={(e) => atualizar('observacoes', e.target.value)} />{mensagem('observacoes')}</div>
    <fieldset className="min-w-0 space-y-3 rounded-xl border border-brand-green/25 p-3 sm:p-4">
      <legend className="px-1 font-semibold">Evidências esperadas (0 a 100)</legend>
      <p className="text-sm text-foreground/70">Somente o checklist de planejamento; nenhum upload ou comprovação será criado.</p>
      {dados.evidenciasEsperadas.map((item, indice) => <div key={item.chave} className="min-w-0 space-y-3 rounded-lg border border-brand-green/20 bg-background/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm">Item {indice + 1}</strong>
          <button type="button" className="rounded-lg border border-red-500/40 px-3 py-1 text-xs disabled:opacity-50" disabled={salvando}
            aria-label={`Remover evidência esperada ${indice + 1}`}
            onClick={() => { setDados((prev) => ({ ...prev, evidenciasEsperadas: prev.evidenciasEsperadas.filter((e) => e.chave !== item.chave) })); setConfirmado(false); }}>
            Remover item</button></div>
        <div><label className="mb-1 block text-sm" htmlFor={formId(`ev-${item.chave}-tipo`)}>Tipo de evidência *</label>
          <input id={formId(`ev-${item.chave}-tipo`)} className={estilo} maxLength={100} value={item.tipoEvidencia}
            {...campoErro(`evidencias.${indice}.tipoEvidencia`)} onChange={(e) => trocarItem(indice, 'tipoEvidencia', e.target.value)} />
          {mensagem(`evidencias.${indice}.tipoEvidencia`)}</div>
        <div><label className="mb-1 block text-sm" htmlFor={formId(`ev-${item.chave}-descricao`)}>Descrição (opcional)</label>
          <textarea id={formId(`ev-${item.chave}-descricao`)} className={estilo} rows={2} maxLength={3000} value={item.descricao ?? ''}
            {...campoErro(`evidencias.${indice}.descricao`)} onChange={(e) => trocarItem(indice, 'descricao', e.target.value)} />
          {mensagem(`evidencias.${indice}.descricao`)}</div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={item.obrigatoria}
          onChange={(e) => trocarItem(indice, 'obrigatoria', e.target.checked)} /> Obrigatória</label>
      </div>)}
      <button type="button" className="inline-flex items-center gap-2 rounded-lg border border-brand-green/50 px-3 py-2 text-sm disabled:opacity-50"
        disabled={salvando || dados.evidenciasEsperadas.length >= 100}
        onClick={() => { const chave = `novo-${++proximaChave.current}`; setDados((prev) => ({ ...prev, evidenciasEsperadas: [...prev.evidenciasEsperadas,
          { chave, tipoEvidencia: '', descricao: '', obrigatoria: false }] })); }}>
        + Adicionar evidência esperada</button>
      {mensagem('evidenciasEsperadas')}
    </fieldset>
    {exigeConfirmacao && <div className="space-y-2 rounded-xl border border-amber-500/50 bg-amber-500/5 p-3 text-sm">
      <p role="note" className="font-semibold">Atenção ao replanejamento</p>
      <p>Tipo, periodicidade, prazo ou etapa foram alterados, ou itens foram removidos do checklist. Parâmetros incompatíveis serão limpos ao salvar, mas permanecem neste formulário caso você retorne ao tipo anterior. Itens removidos serão registrados em auditoria. Se houver ocorrências vinculadas, a API pode bloquear a alteração (409), sem apagá-las.</p>
      <label className="flex items-start gap-2"><input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} /> Confirmo que compreendi essas alterações.</label>
    </div>}
    {erroGeral && <p role="alert" className="rounded-lg border border-red-500/45 p-3 text-sm text-red-400">{erroGeral}</p>}
    <div className="flex flex-wrap justify-end gap-2">
      <button type="button" className="rounded-lg border border-brand-green/40 px-4 py-2 text-sm disabled:opacity-50" disabled={salvando} onClick={onCancelar}>Cancelar</button>
      <button type="submit" disabled={salvando || (exigeConfirmacao && !confirmado)}
        className="inline-flex items-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">
        {!salvando && <Seta />}{salvando ? 'Salvando entregável...' : inicial ? 'Salvar alterações' : 'Cadastrar entregável'}
      </button>
    </div>
  </form>;
}
