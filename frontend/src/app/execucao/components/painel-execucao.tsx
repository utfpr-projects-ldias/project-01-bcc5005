'use client';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';

import { ProgressoCircular } from '@/app/components/progresso-circular';
import { ResumoVinculosEntregavel } from '@/app/contratos/components/resumo-vinculos-entregavel';
import { useResumoDocumentalContrato } from '@/hooks/use-entregaveis';

import { decimalDigitado, decimalExibicao, decimalParaApi } from '@/lib/campos-numericos';
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { BotaoEditarModal } from '@/app/components/botoes-modal';
import { PainelOcorrencias } from '@/app/ocorrencias/components/painel-ocorrencias';
import { calcularDistribuicaoPesos } from '@/lib/distribuicao-pesos';
import { useProgresso, type ProgressoContrato, type ProgressoEntregavel, type AtualizacaoExecucao } from '@/hooks/use-progresso';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';

const INPUT = 'mt-1.5 w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-current/25 disabled:opacity-50';
const BOTAO = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-current/30 bg-background/40 px-3 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-45';
const CANCELAR_PESOS = 'inline-flex min-h-9 items-center rounded-lg border border-red-500/55 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300';
const PRIMARIO = 'inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45';
const rotulosTipo: Record<string, string> = { UNICO: 'Único', QUANTITATIVO: 'Quantitativo', RECORRENTE: 'Recorrente', CONTINUO: 'Contínuo', MARCO: 'Marco' };
const percent = (v: number | null) => v == null ? 'Não calculável' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const civilBR = (v: string | null | undefined) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : 'Não informada';
const statusVisivel = (e: ProgressoEntregavel) => e.statusFisico;
const statusFisico = (e: ProgressoEntregavel) => statusVisivel(e) === 'CONCLUIDO' ? 'Execução integral' : statusVisivel(e) === 'EM_ANDAMENTO' ? 'Em andamento' : statusVisivel(e) === 'NAO_INICIADO' ? 'Sem avanço físico' : 'Aguardando dados';
const estadoFisico = (e: ProgressoEntregavel): EstadoContextual => estadoDoObjeto({objeto:'entregavel',status:e.statusEntregavel,reaberto:Boolean(e.reabertoEm),pendenteConclusao:Boolean(e.regularizacaoDocumentalSolicitada)});
const textoFonte = (e: ProgressoEntregavel) => e.fonte === 'EVIDENCIAS_DIRETAS' ? 'Lançamentos, atividades e evidências de execução direta' : e.fonte === 'AGENDA' ? 'Agenda de ocorrências recorrentes' : e.fonte === 'OCORRENCIAS' ? 'Ocorrências quantitativas' : e.fonte === 'CONFLITO_QUANTIDADE' ? 'Quantidade precisa de conciliação' : 'Registro de execução do entregável';
const numero = (valor: string | null) => valor == null ? 'Não informado' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export type Props = { ocultarConfiguracao?: boolean; contratoId: string; entregavelId?: string; estadoContextual?: EstadoContextual; onAbrirEntregavel?: (id: string, origem: HTMLElement) => void; somenteLeitura?: boolean; onExecucaoAlterada?: () => void };
export function PainelExecucaoContextual(props: Props) {
  const cache = useRepositorioConsultasOpcional();
  return cache ? <PainelExecucao {...props} /> : null;
}

export function PainelExecucao({ contratoId, entregavelId, estadoContextual = 'normal', onAbrirEntregavel, somenteLeitura = false, onExecucaoAlterada, ocultarConfiguracao = false }: Props) {
  const idPrefixo = useId();
  const perfil = useMeuPerfil();
  const acesso = useAcessoContrato(contratoId);
  const admin = perfil.dados?.perfil === 'ADMINISTRADOR';
  const ativo = Boolean(perfil.dados?.ativo && !acesso.erro);
  const podeEditar = !somenteLeitura && ativo && (admin || Boolean(acesso.dados?.permissoes?.editarExecucaoFisica));
  const podeConfigurar = ativo && (admin || Boolean(acesso.dados?.permissoes?.configurarPesos));
  const consulta = useProgresso(contratoId);
  const documental = useResumoDocumentalContrato(contratoId, !entregavelId);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [filtroFisico, setFiltroFisico] = useState<'TODOS' | 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'REVISAO' | 'PENDENTE' | 'CONCLUIDO'>('TODOS');
  const [gatilho, setGatilho] = useState<HTMLElement | null>(null);
  const [valor, setValor] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const [editandoExecucao, setEditandoExecucao] = useState(false);
  const [abaDetalhe, setAbaDetalhe] = useState<'AVANCO'|'OCORRENCIAS'>('AVANCO');
  const [configurandoPesos, setConfigurandoPesos] = useState(false);
  const [focoConfiguracao, setFocoConfiguracao] = useState<HTMLElement | null>(null);
  const dados = consulta.progresso;
  const lista = useMemo(() => (dados?.entregaveis ?? []).filter(e => !entregavelId || e.entregavelId === entregavelId), [dados, entregavelId]);
  const detalhe = lista.find(e => e.entregavelId === detalheId) ?? null;

  const abrir = (e: ProgressoEntregavel, origem: HTMLElement) => {
    if (onAbrirEntregavel) { onAbrirEntregavel(e.entregavelId, origem); return; }
    setDetalheId(e.entregavelId); setAbaDetalhe('AVANCO'); setEditandoExecucao(false); setGatilho(origem); setValor(''); setErro(''); setMensagem('');
  };
  const fechar = () => { if (!salvando) { setDetalheId(null); setEditandoExecucao(false); setValor(''); setErro(''); } };

  async function salvarExecucao(evento: FormEvent<HTMLFormElement>, e: ProgressoEntregavel) {
    evento.preventDefault(); setErro(''); setMensagem('');
    const texto = valor.trim().replace(',', '.');
    let payload: AtualizacaoExecucao;
    if (e.tipo === 'QUANTITATIVO') {
      if (!/^\d{1,15}(?:\.\d{1,3})?$/.test(texto)) { setErro('Informe uma quantidade válida, com até três casas decimais.'); return; }
      payload = { quantidadeRealizada: texto };
    } else if (e.tipo === 'MARCO') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) { setErro('Selecione uma data efetiva válida.'); return; }
      payload = { dataEfetivaMarco: texto };
    } else if (e.tipo === 'UNICO' || e.tipo === 'CONTINUO') {
      if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(texto) || Number(texto) > 100) { setErro('Informe um percentual de 0 a 100, com até duas casas decimais.'); return; }
      payload = { percentualManual: Number(texto) };
    } else return;
    setSalvando(true);
    try {
      await consulta.atualizarExecucao(e.entregavelId, payload);
      onExecucaoAlterada?.();
      setMensagem('Execução física atualizada.'); setValor(''); setEditandoExecucao(false);
    } catch (falha: unknown) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a execução.'); }
    finally { setSalvando(false); }
  }

  const naoCalculaveis = lista.filter(e => e.percentualExecucao === null);
  // Patch 05 removeu esta variável enquanto o painel geral continuou usando-a.
  // Solicitação e revisão são situações operacionais, não percentuais físicos.
  // Nenhum registro deve sumir das categorias por ter um estado terminal anterior.
  const itensVisiveis = lista.filter(e => {
    if (filtroFisico === 'TODOS') return true;
    const estado = estadoFisico(e);
    if (estado === 'pendente') return filtroFisico === 'PENDENTE';
    if (estado === 'revisao') return filtroFisico === 'REVISAO';
    if (['concluido','parcial','finalizado','encerrado'].includes(estado)) return filtroFisico === 'CONCLUIDO';
    if (estado === 'nao-iniciado') return filtroFisico === 'NAO_INICIADO';
    // 100% físico ainda sem aprovação continua operacionalmente aberto.
    return filtroFisico === 'EM_ANDAMENTO';
  });
  // Dentro do modal do entregável, nunca reproduzir o cartão do próprio
  // entregável nem abrir um segundo modal de execução idêntico.
  if (entregavelId) {
    const e = lista[0];
    const podeRegistrar = Boolean(e && podeEditar && e.editavel && e.tipo !== 'RECORRENTE' && !['OCORRENCIAS','CONFLITO_QUANTIDADE','EVIDENCIAS_DIRETAS'].includes(e.fonte));
    return <section aria-label="Execução física" data-tec08-contexto-operacional data-pi-painel-contextual data-tec08-estado={estadoContextual}
      data-tec09-painel-execucao className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-4">
      <header className="space-y-1"><h3 data-pi-titulo className="text-lg font-semibold">Execução física</h3>
        <p className="text-xs text-foreground/65">Avanço físico e registros relacionados, sem interferir na comprovação documental.</p></header>
      {consulta.loading && <p role="status">Consultando execução...</p>}
      {consulta.erro && <p role="alert" className="text-sm text-error-text">{consulta.erro}</p>}
      {e && <>
        <div data-pi-superficie data-tec08-secao-contextual className="flex flex-wrap items-center gap-2 rounded-xl border p-3" data-tec08-estado={estadoFisico(e)}>
          <span className="text-xs text-foreground/65">{rotulosTipo[e.tipo]} · {rotuloEstadoEntregavel(e.statusEntregavel,false,Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada))} · {statusFisico(e)}</span><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.finalizadoComAtraso}/>
          <span className="ml-auto text-xl font-bold text-foreground">{percent(e.percentualExecucao)}</span>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {e.tipo === 'QUANTITATIVO' && <><Dado nome="Quantidade prevista" valor={numero(e.previsto)} /><Dado nome="Quantidade realizada" valor={numero(e.realizado)} /></>}
            {e.tipo === 'RECORRENTE' && <><Dado nome="Períodos previstos" valor={numero(e.previsto)} /><Dado nome="Períodos concluídos" valor={numero(e.realizado)} /></>}
            {e.tipo === 'MARCO' && <Dado nome="Data do marco" valor={civilBR(e.dataEfetivaMarco)} />}
            {e.pesoOperacional != null && <Dado nome="Peso operacional" valor={`${Number(e.pesoOperacional).toLocaleString('pt-BR')}% do contrato`} />}
          </div>
          {e.percentualExecucao == null && <p role="status" className="rounded-lg border border-amber-500/40 p-3 text-sm">Não há dados suficientes para calcular o avanço. {e.tipo === 'RECORRENTE' ? 'É necessário planejar e gerar as ocorrências recorrentes.' : 'Confira os dados registrados para este entregável.'}</p>}
          {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
          {mensagem && <p role="status" className="text-sm">{mensagem}</p>}
          {podeRegistrar && <form data-pi-formulario className="space-y-3 rounded-xl border border-current/20 p-3" onSubmit={ev => void salvarExecucao(ev, e)}>
            <label htmlFor={`${idPrefixo}-inline`} className="block text-sm font-medium">{e.tipo === 'MARCO' ? 'Data em que o marco foi alcançado' : e.tipo === 'QUANTITATIVO' ? 'Quantidade efetivamente realizada' : 'Percentual físico realizado (0 a 100)'}
              <input id={`${idPrefixo}-inline`} type={e.tipo === 'MARCO' ? 'date' : 'text'} maxLength={e.tipo === 'MARCO' ? undefined : 18} inputMode={e.tipo === 'MARCO' ? undefined : 'decimal'}
                value={valor} onChange={ev => setValor(ev.target.value)} required className={INPUT} placeholder={e.tipo === 'MARCO' ? undefined : 'Ex.: 75,50'} />
            </label>
            <div className="flex justify-end"><button type="submit" data-pi-acao="primaria" disabled={salvando} className={PRIMARIO}>{salvando ? 'Salvando...' : 'Salvar execução'}</button></div>
          </form>}
          {!podeRegistrar && <p className="text-xs text-foreground/60">{e.tipo === 'RECORRENTE' || e.fonte === 'OCORRENCIAS' ? 'Atualize a execução por meio das ocorrências vinculadas.' : 'Edição indisponível para seu perfil ou para a situação atual do entregável.'}</p>}
        </div>
      </>}
    </section>;
  }
  return <section data-tec08-contexto-operacional data-tec08-estado={estadoContextual} data-pi-painel-contextual data-tec09-painel-execucao className="space-y-5 rounded-2xl border p-4 sm:p-5" aria-label="Execução física">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h3 data-pi-titulo className="text-xl font-bold">Execução física</h3>

      </div>
      {!ocultarConfiguracao && !entregavelId && podeConfigurar && dados?.editavelPesos && <button type="button" aria-label="Configurar pesos da execução" title="Configurar pesos" data-pi-acao="secundaria"
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/30 bg-background/40 hover:bg-current/10 focus-visible:ring-2 focus-visible:ring-current"
        onClick={e => { setFocoConfiguracao(e.currentTarget); setConfigurandoPesos(true); }}>
        <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M10 2h4l.8 2.3 2 1.1 2.4-.5 2 3.5-1.7 1.8v2.3l1.7 1.8-2 3.5-2.4-.5-2 1.1L14 21h-4l-.8-2.3-2-1.1-2.4.5-2-3.5 1.7-1.8v-2.3L2.8 8.4l2-3.5 2.4.5 2-1.1L10 2Z"/><circle cx="12" cy="11.5" r="3"/></svg>
      </button>}
    </header>

    {consulta.loading && <p role="status" className="text-sm text-foreground/70">Consultando a execução física...</p>}
    {consulta.erro && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-500/40 p-3 text-sm text-error-text"><span>{consulta.erro}</span><button type="button" className={BOTAO} onClick={() => void consulta.atualizar()}>Tentar novamente</button></div>}
    {dados && <>
      {!entregavelId && <>
        <div data-pi-superficie className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4" aria-label="Resumo da execução física do contrato">
          <div><p className="text-sm font-semibold text-foreground/70">Avanço do contrato</p><p data-pi-titulo className="mt-1 text-3xl font-bold">{percent(dados.avanco)}</p></div>
          <div className="text-right text-xs text-foreground/70"><p>Modo: <strong>{dados.modoCalculo === 'PONDERADO' ? 'Média ponderada' : 'Média simples'}</strong></p><p>{lista.length} entregável(is)</p></div>
        </div>
        {dados.configuracaoPendente && <p role="status" className="text-xs text-foreground/70">Pesos incompletos ({percent(dados.somaPesos)} distribuídos). Avanço provisório; peso restante contribui com 0%.</p>}
        {naoCalculaveis.length > 0 && <p role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 text-sm text-foreground/80">
          O avanço ainda não pode ser calculado integralmente: {naoCalculaveis.length} {naoCalculaveis.length === 1 ? 'entregável precisa' : 'entregáveis precisam'} de dados válidos de execução. A soma de pesos igual a 100% não significa que a execução foi realizada. Para recorrentes, é necessária uma agenda completa e conciliada; para os demais tipos, registre a execução efetiva e aprove as ocorrências quando aplicável.
        </p>}
      </>}

      <section className="space-y-3" aria-label="Execução por entregável">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 data-pi-titulo className="font-semibold">Entregáveis</h4><p className="mt-1 text-xs text-foreground/65">Selecione um cartão para consultar ou registrar o avanço.</p></div><span className="text-xs text-foreground/65">{itensVisiveis.length} de {lista.length}</span></div>
        {!entregavelId && <div role="tablist" aria-label="Filtrar entregáveis por execução" className="flex flex-wrap gap-1 rounded-xl border border-current/20 bg-background/40 p-1">{([
          ['TODOS','Todos'], ['NAO_INICIADO','Não iniciados'], ['EM_ANDAMENTO','Em andamento'], ['REVISAO','Em revisão'], ['PENDENTE','Pendentes'], ['CONCLUIDO','Finalizados'],
        ] as const).map(([chave, nome]) => <button type="button" role="tab" key={chave} aria-selected={filtroFisico === chave} onClick={() => setFiltroFisico(chave)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filtroFisico === chave ? 'bg-foreground/10 underline underline-offset-4' : 'text-foreground/70 hover:bg-foreground/5'}`}>{nome}</button>)}</div>}
        {itensVisiveis.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed p-5 text-sm text-foreground/70">Nenhum entregável corresponde ao filtro selecionado.</p> : <div className="flex flex-col gap-3">{itensVisiveis.map(e => <article key={e.entregavelId} data-tec08-secao-contextual data-tec08-estado={estadoFisico(e)} data-pi-entregavel data-pi-superficie className="relative min-w-0 rounded-xl border transition-colors hover:border-current/50">
          <button type="button" aria-label={`Ver detalhes da execução de ${e.nome}`} className="pi-card-entregavel flex w-full min-w-0 items-center gap-3 rounded-xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-current/50" onClick={ev => abrir(e, ev.currentTarget)}>
            <ProgressoCircular valor={e.percentualExecucao} nome={e.nome} tamanho="grande" corFisica />
            <div className="pi-card-entregavel-info min-w-0 flex-1 space-y-1">
            <h5 data-pi-titulo className="break-words text-base font-semibold">{e.nome}</h5>
            <p className="text-xs text-foreground/70">{rotulosTipo[e.tipo]} · {rotuloEstadoEntregavel(e.statusEntregavel,false,Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada))} · {statusFisico(e)}</p><EtiquetaAtraso atrasado={e.atrasado} finalizadoComAtraso={e.finalizadoComAtraso}/>
            {e.statusEntregavel === 'FINALIZADO' && <span className="inline-flex rounded-full border border-purple-500/60 bg-purple-500/20 px-2 py-1 text-xs font-semibold text-purple-700 dark:text-purple-200">Encerrado</span>}

            <p className="text-xs text-foreground/70">{textoFonte(e)}</p>
            {(e.inicioPrevisto || e.terminoPrevisto) && <p className="text-xs text-foreground/65">{civilBR(e.inicioPrevisto)} — {civilBR(e.terminoPrevisto)}</p>}
            </div>
            <ResumoVinculosEntregavel resumo={documental.dados?.[e.entregavelId]} participacao={e.participacaoOperacional} />
          </button>
        </article>)}</div>}
      </section>
    </>}

    {erro && !detalhe && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
    {mensagem && !detalhe && <p role="status" className="rounded-lg border border-current/25 p-3 text-sm">{mensagem}</p>}

    {configurandoPesos && dados && podeConfigurar && !entregavelId && <ModalConfigurarExecucao contratoId={contratoId} estadoContextual={estadoContextual} focoRetorno={focoConfiguracao} onFechar={()=>setConfigurandoPesos(false)}/>}


    {detalhe && !onAbrirEntregavel && <ModalEtapa alturaEstavel titulo={detalhe.nome} contexto="Execução física do entregável" estadoContextual={estadoFisico(detalhe)} ocupado={salvando} focoRetorno={gatilho} onFechar={fechar} rotuloFechar="Fechar detalhes da execução"
      acoes={podeEditar && detalhe.editavel && detalhe.tipo !== 'RECORRENTE' && !['OCORRENCIAS', 'CONFLITO_QUANTIDADE','EVIDENCIAS_DIRETAS'].includes(detalhe.fonte) && !editandoExecucao ?
        <BotaoEditarModal rotulo="Editar execução" onClick={() => setEditandoExecucao(true)} /> : undefined}>
      <div className="space-y-4" data-tec08-estado={estadoFisico(detalhe)} data-tec08-secao-contextual>
        <div className="flex gap-1 rounded-xl border border-current/20 p-1" role="tablist" aria-label="Detalhes de execução do entregável">
          <button type="button" role="tab" aria-selected={abaDetalhe === 'AVANCO'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${abaDetalhe === 'AVANCO' ? 'bg-current/20 underline underline-offset-4' : 'hover:bg-current/10'}`} onClick={() => setAbaDetalhe('AVANCO')}>Avanço físico</button>
          <button type="button" role="tab" aria-selected={abaDetalhe === 'OCORRENCIAS'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${abaDetalhe === 'OCORRENCIAS' ? 'bg-current/20 underline underline-offset-4' : 'hover:bg-current/10'}`} onClick={() => setAbaDetalhe('OCORRENCIAS')}>Ocorrências</button>
        </div>
        <div role="tabpanel" hidden={abaDetalhe !== 'AVANCO'} className={abaDetalhe !== 'AVANCO' ? 'hidden' : 'space-y-3'}>
        <div data-pi-superficie className="rounded-xl border p-4">
          <p className="text-xs text-foreground/65">{rotulosTipo[detalhe.tipo]} · {rotuloEstadoEntregavel(detalhe.statusEntregavel,false,Boolean(detalhe.reabertoEm),Boolean(detalhe.regularizacaoDocumentalSolicitada))} · {statusFisico(detalhe)}</p><EtiquetaAtraso atrasado={detalhe.atrasado} finalizadoComAtraso={detalhe.finalizadoComAtraso}/>
          <p data-pi-titulo className="mt-2 text-3xl font-bold">{percent(detalhe.percentualExecucao)}</p>
          <p className="mt-2 text-sm text-foreground/75">{textoFonte(detalhe)}</p>
        </div>
        {detalhe.percentualExecucao == null && <p className="rounded-lg border border-amber-500/30 p-3 text-sm text-foreground/75">Execução ainda não calculável com os dados disponíveis. Para entregáveis recorrentes, gere e confira os períodos da agenda antes de obter o percentual.</p>}
        <dl className="grid gap-3 sm:grid-cols-2">
          {detalhe.tipo === 'QUANTITATIVO' && <><Dado nome="Quantidade prevista" valor={numero(detalhe.previsto)} /><Dado nome="Quantidade realizada" valor={numero(detalhe.realizado)} /></>}
          {detalhe.tipo === 'RECORRENTE' && <><Dado nome="Períodos previstos" valor={numero(detalhe.previsto)} /><Dado nome="Períodos concluídos" valor={numero(detalhe.realizado)} /></>}
          {detalhe.tipo === 'MARCO' && <Dado nome="Data efetiva do marco" valor={civilBR(detalhe.dataEfetivaMarco)} />}
          <Dado nome="Peso operacional" valor={detalhe.pesoOperacional == null ? 'Não definido' : `${Number(detalhe.pesoOperacional).toLocaleString('pt-BR')}% do contrato`} />
          <Dado nome="Período de execução previsto" valor={`${civilBR(detalhe.inicioPrevisto)} — ${civilBR(detalhe.terminoPrevisto)}`} />
        </dl>
    {erro && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
        {mensagem && <p role="status" className="rounded-lg border border-current/30 p-3 text-sm">{mensagem}</p>}
        {editandoExecucao && podeEditar && detalhe.editavel && detalhe.tipo !== 'RECORRENTE' && !['OCORRENCIAS', 'CONFLITO_QUANTIDADE','EVIDENCIAS_DIRETAS'].includes(detalhe.fonte) && <form data-pi-formulario className="space-y-3 rounded-xl border border-current/20 p-4" onSubmit={ev => void salvarExecucao(ev, detalhe)}>
          <h4 data-pi-titulo className="text-sm font-semibold">Atualizar execução</h4>
          <label htmlFor={`${idPrefixo}-valor`} className="block text-sm font-medium">{detalhe.tipo === 'MARCO' ? 'Data em que o marco foi alcançado' : detalhe.tipo === 'QUANTITATIVO' ? 'Quantidade efetivamente realizada' : 'Percentual físico realizado (0 a 100)'}
            <input id={`${idPrefixo}-valor`} type={detalhe.tipo === 'MARCO' ? 'date' : 'text'} maxLength={detalhe.tipo === 'MARCO' ? undefined : 18} inputMode={detalhe.tipo === 'MARCO' ? undefined : 'decimal'} value={valor} onChange={ev => setValor(ev.target.value)} required placeholder={detalhe.tipo === 'MARCO' ? undefined : detalhe.tipo === 'QUANTITATIVO' ? 'Ex.: 15,500' : 'Ex.: 75,50'} className={INPUT} />
          </label>
          <div className="flex justify-end gap-2"><button type="button" className={CANCELAR_PESOS} onClick={() => { setEditandoExecucao(false); setErro(''); }}>Cancelar</button><button type="submit" data-pi-acao="primaria" disabled={salvando} className={PRIMARIO}>{salvando ? 'Salvando...' : 'Salvar execução'}</button></div>
        </form>}
        <p className="text-xs text-foreground/60">A execução física não comprova automaticamente evidências, não conclui documentalmente o entregável e não altera registros históricos.</p>
        </div>
        {abaDetalhe === 'OCORRENCIAS' && <div role="tabpanel" aria-label="Ocorrências vinculadas" className="min-w-0 min-h-[24rem]"><PainelOcorrencias contratoId={contratoId} entregavelIdInicial={detalhe.entregavelId} estadoContextual={estadoFisico(detalhe)} embutido /></div>}
      </div>
    </ModalEtapa>}
  </section>;
}

function Dado({ nome, valor }: { nome: string; valor: string }) {
  return <div data-pi-superficie className="rounded-lg border p-3"><dt className="text-xs text-foreground/60">{nome}</dt><dd className="mt-1 break-words text-sm font-semibold text-foreground">{valor}</dd></div>;
}
/** Configuração única do cálculo; as alterações ponderadas são persistidas
 * atomicamente pelo PATCH /pesos, que também ativa o modo ponderado. */
export function ModalConfigurarExecucao({contratoId,numeroContrato,estadoContextual='normal',focoRetorno,onFechar}:{contratoId:string;numeroContrato?:string;estadoContextual?:EstadoContextual;focoRetorno?:HTMLElement|null;onFechar:()=>void}) {
  const perfil=useMeuPerfil(),acesso=useAcessoContrato(contratoId),consulta=useProgresso(contratoId);
  const dados=consulta.progresso;
  const autorizado=Boolean(perfil.dados?.ativo&&!acesso.erro&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.configurarPesos));
  const [ocupado,setOcupado]=useState(false); const fecharRef=useRef<(()=>boolean)|null>(null);
  const [descartar,setDescartar]=useState(false);
  const fechar=()=>{if(ocupado)return;if(!fecharRef.current||fecharRef.current())onFechar();else setDescartar(true);};
  return <><ModalEtapa titulo="Editar execução" contexto={numeroContrato?`Contrato ${numeroContrato}`:'Configuração do contrato'} estadoContextual={estadoContextual} larguraFormulario="entregavel" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={fechar} camada="edicao">
    {consulta.loading&&!dados?<p role="status">Consultando execução…</p>:consulta.erro?<p role="alert" className="text-error-text">{consulta.erro}</p>:!autorizado||!dados?.editavelPesos?<p role="status" className="text-sm text-foreground/70">Configuração indisponível para esta situação ou perfil.</p>:<EditorPesos key={contratoId} dados={dados} salvarPesos={consulta.atualizarPesos} alterarModo={consulta.atualizarModoCalculo} onFechar={onFechar} onOcupado={setOcupado} fecharRef={fecharRef} solicitarFechamento={fechar}/>}
  </ModalEtapa>{descartar&&<ConfirmacaoSimples titulo="Descartar alterações?" descricao="A configuração da execução ainda não foi salva." confirmar="Descartar alterações" perigoso descarte onCancelar={()=>setDescartar(false)} onConfirmar={()=>{setDescartar(false);onFechar();}}/>}</>;
}
function EditorPesos({dados,salvarPesos,alterarModo,onFechar,onOcupado,fecharRef,solicitarFechamento}:{solicitarFechamento:()=>void;dados:ProgressoContrato;salvarPesos:(versao:string,pesos:{entregavelId:string;peso:string}[])=>Promise<void>;alterarModo:(versao:string,modo:'SIMPLES'|'PONDERADO')=>Promise<void>;onFechar:()=>void;onOcupado:(v:boolean)=>void;fecharRef:{current:(()=>boolean)|null}}) {
  const [modo,setModo]=useState(dados.modoCalculo);
  const [pesos,setPesos]=useState<Record<string,string>>(()=>Object.fromEntries(dados.entregaveis.map(e=>[e.entregavelId,decimalExibicao(e.pesoOperacional,4)])));
  const [versao]=useState(dados.versaoPesos);const trava=useRef(false);
  const [ocupado,setOcupado]=useState(false),[erro,setErro]=useState('');
  const valores=dados.entregaveis.map(e=>pesos[e.entregavelId]??'');
  const distribuicao=calcularDistribuicaoPesos(valores);
  const mudou=dados.modoCalculo!==modo||(modo==='PONDERADO'&&dados.entregaveis.some(e=>Number(decimalParaApi(pesos[e.entregavelId]??''))!==Number(e.pesoOperacional??0)));
  const desatualizado=versao!==dados.versaoPesos;
  const valido=modo==='SIMPLES'||(distribuicao.soma<=100&&valores.every(v=>!v.trim()||(/^\d{1,3}(?:[.,]\d{1,4})?$/.test(v.trim())&&Number(v.replace(',','.'))<=100)));
  useEffect(()=>{fecharRef.current=()=>!mudou;return()=>{fecharRef.current=null;};},[fecharRef,mudou]);
  async function salvar(evento:FormEvent<HTMLFormElement>){
    evento.preventDefault(); if(trava.current||!valido||desatualizado)return;
    trava.current=true;setOcupado(true);onOcupado(true);setErro('');
    try{if(modo==='PONDERADO'&&dados.entregaveis.length)await salvarPesos(versao,dados.entregaveis.map(e=>({entregavelId:e.entregavelId,peso:decimalParaApi(pesos[e.entregavelId]??'')||'0'})));else if(modo==='PONDERADO')await alterarModo(versao,'PONDERADO');else if(dados.modoCalculo!=='SIMPLES')await alterarModo(versao,'SIMPLES');onFechar();}
    catch(e){setErro(e instanceof Error?e.message:'Não foi possível salvar a configuração.');}finally{trava.current=false;setOcupado(false);onOcupado(false);}
  }
  return <form data-pi-formulario data-pi-editar-execucao className="min-w-0 space-y-4" onSubmit={e=>void salvar(e)}>
    <fieldset className="grid gap-2 sm:grid-cols-2"><legend className="mb-2 text-sm font-semibold">Modo de cálculo</legend>{(['SIMPLES','PONDERADO'] as const).map(m=><label key={m} className="pi-opcao-origem flex cursor-pointer items-start gap-3 rounded-lg border border-slate-500/25 px-3 py-2.5"><input type="radio" name="modo-calculo" checked={modo===m} disabled={ocupado} onChange={()=>setModo(m)} className="mt-1 accent-brand-green"/><span><strong className="block text-sm">{m==='SIMPLES'?'Média simples':'Média ponderada'}</strong><span className="text-xs text-foreground/65">{m==='SIMPLES'?'Participação equivalente dos entregáveis.':'Participação definida por peso operacional.'}</span></span></label>)}</fieldset>
    <dl className="grid grid-cols-2 gap-3 border-y border-slate-500/20 py-3 sm:grid-cols-4">{[['Execução física',percent(dados.avanco)],['Entregáveis',dados.entregaveis.length],...(modo==='PONDERADO'?[['Pesos distribuídos',percent(distribuicao.soma)],['Restante',percent(Math.max(0,100-distribuicao.soma))]]:[])].map(([rotulo,valor])=><div key={rotulo}><dt className="text-xs text-foreground/60">{rotulo}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{valor}</dd></div>)}</dl>
    <div role="list" aria-label="Pesos por entregável" className="divide-y divide-slate-500/20">{dados.entregaveis.map(e=><div role="listitem" key={e.entregavelId} className="flex min-w-0 flex-wrap items-center gap-3 py-3"><ProgressoCircular valor={e.percentualExecucao} nome={e.nome} corFisica/><div className="min-w-0 flex-1"><p title={e.nome} className="truncate font-semibold text-sm">{e.nome}</p><p className="text-xs text-foreground/65">{rotulosTipo[e.tipo]} · {rotuloEstadoEntregavel(e.statusEntregavel,false,Boolean(e.reabertoEm),Boolean(e.regularizacaoDocumentalSolicitada))}</p></div>{e.percentualExecucao!=null&&(modo==='SIMPLES'||valido)&&<span className="shrink-0 text-xs text-foreground/65">{(e.percentualExecucao*(modo==='SIMPLES'?1/dados.entregaveis.length:Number(decimalParaApi(pesos[e.entregavelId]??'0'))/100)).toLocaleString('pt-BR',{maximumFractionDigits:3})} p.p. no contrato</span>}{modo==='PONDERADO'?<label className="flex shrink-0 items-center gap-2 text-xs">Peso <input aria-label={`Peso operacional de ${e.nome}`} className="w-28 rounded-lg border border-slate-500/30 bg-transparent px-2 py-2 text-sm tabular-nums focus-visible:outline-2 focus-visible:outline-current" inputMode="decimal" value={pesos[e.entregavelId]??''} disabled={ocupado} onChange={ev=>setPesos(p=>({...p,[e.entregavelId]:decimalDigitado(ev.target.value,100,4)}))}/> %</label>:<strong className="shrink-0 text-sm tabular-nums">{percent(100/dados.entregaveis.length)} do contrato</strong>}</div>)}{!dados.entregaveis.length&&<p className="py-3 text-sm text-foreground/60">Nenhum entregável cadastrado.</p>}</div>
    {modo==='PONDERADO'&&valido&&!distribuicao.valida&&<p role="status" className="text-xs text-amber-500">Distribuição incompleta: o peso restante contribui com 0%. Complete 100% antes da conclusão do contrato.</p>}{modo==='PONDERADO'&&!valido&&<p role="status" className="text-xs text-amber-500">Informe pesos válidos, sem ultrapassar 100%.</p>}{desatualizado&&<p role="alert" className="text-sm text-error-text">O planejamento mudou. Feche e abra a configuração para consultar a versão atual.</p>}{erro&&<p role="alert" className="text-sm text-error-text">{erro}</p>}
    <footer className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-500/20 bg-background py-3"><button type="button" disabled={ocupado} className={CANCELAR_PESOS} onClick={solicitarFechamento}>Cancelar</button><button type="submit" data-pi-acao="primaria" disabled={ocupado||!valido||desatualizado||!mudou} className={`${PRIMARIO} bg-brand-green text-on-brand-green`}>{ocupado?'Salvando…':'Salvar alterações'}</button></footer>
  </form>;
}
