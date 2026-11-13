'use client';

import { useId, useMemo, useState, type FormEvent } from 'react';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { BotaoEditarModal } from '@/app/components/botoes-modal';
import { PainelOcorrencias } from '@/app/ocorrencias/components/painel-ocorrencias';
import { CampoBuscaSugestoes } from '@/app/components/campo-busca-sugestoes';
import { useProgresso, type ProgressoContrato, type ProgressoEntregavel, type AtualizacaoExecucao } from '@/hooks/use-progresso';
import { estadoTemporal } from '@/lib/estado-temporal';

const INPUT = 'mt-1.5 w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-current/25 disabled:opacity-50';
const BOTAO = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-current/30 bg-background/40 px-3 py-2 text-sm font-semibold hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-45';
const CANCELAR_PESOS = 'inline-flex min-h-9 items-center rounded-lg border border-red-500/55 bg-red-500/15 px-3 py-1.5 text-xs font-semibold text-red-700 dark:text-red-300';
const PRIMARIO = 'inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45';
const rotulosTipo: Record<string, string> = { UNICO: 'Único', QUANTITATIVO: 'Quantitativo', RECORRENTE: 'Recorrente', CONTINUO: 'Contínuo', MARCO: 'Marco' };
const percent = (v: number | null) => v == null ? 'Não calculável' : `${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;
const civilBR = (v: string | null | undefined) => v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : 'Não informada';
const statusVisivel = (e: ProgressoEntregavel) => estadoTemporal(e.statusFisico, e.inicioPrevisto);
const statusFisico = (e: ProgressoEntregavel) => statusVisivel(e) === 'CONCLUIDO' ? 'Concluída' : statusVisivel(e) === 'EM_ANDAMENTO' ? 'Em andamento' : statusVisivel(e) === 'NAO_INICIADO' ? 'Não iniciada' : 'Aguardando dados';
const estadoFisico = (e: ProgressoEntregavel): EstadoContextual => e.statusEntregavel === 'FINALIZADO' ? 'finalizado' : (e.statusEntregavel === 'CONCLUIDO' || statusVisivel(e) === 'CONCLUIDO') ? 'concluido' : (statusVisivel(e) === 'EM_ANDAMENTO' || e.statusEntregavel === 'EM_ANDAMENTO') ? 'andamento' : 'nao-iniciado';
const textoFonte = (e: ProgressoEntregavel) => e.fonte === 'AGENDA' ? 'Agenda de ocorrências recorrentes' : e.fonte === 'OCORRENCIAS' ? 'Ocorrências quantitativas' : e.fonte === 'CONFLITO_QUANTIDADE' ? 'Quantidade precisa de conciliação' : 'Registro de execução do entregável';
const numero = (valor: string | null) => valor == null ? 'Não informado' : Number(valor).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

export type Props = { contratoId: string; entregavelId?: string; estadoContextual?: EstadoContextual };
export function PainelExecucaoContextual(props: Props) {
  const cache = useRepositorioConsultasOpcional();
  return cache ? <PainelExecucao {...props} /> : null;
}

export function PainelExecucao({ contratoId, entregavelId, estadoContextual = 'normal' }: Props) {
  const idPrefixo = useId();
  const perfil = useMeuPerfil();
  const acesso = useAcessoContrato(contratoId);
  const admin = perfil.dados?.perfil === 'ADMINISTRADOR';
  const ativo = Boolean(perfil.dados?.ativo && !acesso.erro);
  const podeEditar = ativo && (admin || Boolean(acesso.dados?.permissoes?.editarExecucaoFisica));
  const podeConfigurar = ativo && (admin || Boolean(acesso.dados?.permissoes?.configurarPesos));
  const consulta = useProgresso(contratoId);
  const [detalheId, setDetalheId] = useState<string | null>(null);
  const [filtroFisico, setFiltroFisico] = useState<'TODOS' | 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO'>('TODOS');
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
      setMensagem('Execução física atualizada.'); setValor(''); setEditandoExecucao(false);
    } catch (falha: unknown) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a execução.'); }
    finally { setSalvando(false); }
  }

  const naoCalculaveis = lista.filter(e => e.percentualExecucao === null);
  // Patch 05 removeu esta variável enquanto o painel geral continuou usando-a.
  // O filtro é derivado dos dados carregados, sem alterar a lista original.
  const itensVisiveis = lista.filter(e =>
    filtroFisico === 'TODOS' ||
    (filtroFisico === 'CONCLUIDO' && ['CONCLUIDO', 'FINALIZADO'].includes(e.statusEntregavel ?? '')) ||
    (!['CONCLUIDO', 'FINALIZADO'].includes(e.statusEntregavel ?? '') &&
      ((filtroFisico === 'NAO_INICIADO' && ['NAO_INICIADO', 'NAO_AVALIADO'].includes(statusVisivel(e))) ||
       (filtroFisico === 'EM_ANDAMENTO' && statusVisivel(e) === 'EM_ANDAMENTO')))
  );
  // Dentro do modal do entregável, nunca reproduzir o cartão do próprio
  // entregável nem abrir um segundo modal de execução idêntico.
  if (entregavelId) {
    const e = lista[0];
    const podeRegistrar = Boolean(e && podeEditar && e.editavel && e.tipo !== 'RECORRENTE' && !['OCORRENCIAS','CONFLITO_QUANTIDADE'].includes(e.fonte));
    return <section aria-label="Execução física" data-tec08-contexto-operacional data-pi-painel-contextual data-tec08-estado={estadoContextual}
      data-tec09-painel-execucao className="min-w-0 space-y-4 rounded-xl border p-3 sm:p-4">
      <header className="space-y-1"><h3 data-pi-titulo className="text-lg font-semibold">Execução física</h3>
        <p className="text-xs text-foreground/65">Avanço físico e registros relacionados, sem interferir na comprovação documental.</p></header>
      {consulta.loading && <p role="status">Consultando execução...</p>}
      {consulta.erro && <p role="alert" className="text-sm text-error-text">{consulta.erro}</p>}
      {e && <>
        <div data-pi-superficie data-tec08-secao-contextual className="flex flex-wrap items-center gap-2 rounded-xl border p-3" data-tec08-estado={estadoFisico(e)}>
          <span className="text-xs text-foreground/65">{rotulosTipo[e.tipo]} · {statusFisico(e)}</span>
          <span className="ml-auto text-xl font-bold text-foreground">{percent(e.percentualExecucao)}</span>
        </div>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            {e.tipo === 'QUANTITATIVO' && <><Dado nome="Quantidade prevista" valor={numero(e.previsto)} /><Dado nome="Quantidade realizada" valor={numero(e.realizado)} /></>}
            {e.tipo === 'RECORRENTE' && <><Dado nome="Períodos previstos" valor={numero(e.previsto)} /><Dado nome="Períodos concluídos" valor={numero(e.realizado)} /></>}
            {e.tipo === 'MARCO' && <Dado nome="Data do marco" valor={civilBR(e.dataEfetivaMarco)} />}
            {e.pesoOperacional != null && <Dado nome="Peso operacional" valor={`${Number(e.pesoOperacional).toLocaleString('pt-BR')}%`} />}
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
        <p className="text-sm text-foreground/70">Acompanhe o avanço dos entregáveis. A comprovação documental é independente.</p>
      </div>
      {!entregavelId && podeConfigurar && dados?.editavelPesos && <button type="button" aria-label="Configurar pesos da execução" title="Configurar pesos" data-pi-acao="secundaria"
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
          <div className="text-right text-xs text-foreground/70"><p>Modo: <strong>{dados.modoCalculo === 'PONDERADO' ? 'Ponderado' : 'Simples'}</strong></p><p>{lista.length} entregável(is)</p></div>
        </div>
        {naoCalculaveis.length > 0 && <p role="status" className="rounded-xl border border-amber-500/35 bg-amber-500/5 p-3 text-sm text-foreground/80">
          O avanço ainda não pode ser calculado integralmente: {naoCalculaveis.length} {naoCalculaveis.length === 1 ? 'entregável precisa' : 'entregáveis precisam'} de dados válidos de execução. Para recorrentes, é necessária uma agenda completa e conciliada.
        </p>}
      </>}

      <section className="space-y-3" aria-label="Execução por entregável">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 data-pi-titulo className="font-semibold">Entregáveis</h4><p className="mt-1 text-xs text-foreground/65">Selecione um cartão para consultar ou registrar o avanço.</p></div><span className="text-xs text-foreground/65">{itensVisiveis.length} de {lista.length}</span></div>
        {!entregavelId && <div role="tablist" aria-label="Filtrar entregáveis por execução" className="flex flex-wrap gap-1 rounded-xl border border-current/20 bg-background/40 p-1">{([
          ['TODOS','Todos'], ['NAO_INICIADO','Não iniciados'], ['EM_ANDAMENTO','Em andamento'], ['CONCLUIDO','Finalizados'],
        ] as const).map(([chave, nome]) => <button type="button" role="tab" key={chave} aria-selected={filtroFisico === chave} onClick={() => setFiltroFisico(chave)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${filtroFisico === chave ? 'bg-foreground/10 underline underline-offset-4' : 'text-foreground/70 hover:bg-foreground/5'}`}>{nome}</button>)}</div>}
        {itensVisiveis.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed p-5 text-sm text-foreground/70">Nenhum entregável corresponde ao filtro selecionado.</p> : <div className="grid gap-3 lg:grid-cols-2">{itensVisiveis.map(e => <article key={e.entregavelId} data-tec08-secao-contextual data-tec08-estado={estadoFisico(e)} data-pi-superficie className="relative min-w-0 rounded-xl border transition-colors hover:border-current/50">
          <button type="button" aria-label={`Ver detalhes da execução de ${e.nome}`} className="w-full space-y-2.5 rounded-xl p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-current/50" onClick={ev => abrir(e, ev.currentTarget)}>
            <h5 data-pi-titulo className="break-words text-base font-semibold">{e.nome}</h5>
            <p className="text-xs text-foreground/70">{rotulosTipo[e.tipo]} · {statusFisico(e)}</p>
            <p data-pi-titulo className="text-lg font-bold tabular-nums">{percent(e.percentualExecucao)}{e.statusEntregavel === 'FINALIZADO' && <span className="ml-2 rounded-full border border-purple-500/60 bg-purple-500/20 px-2 py-1 text-xs font-semibold text-purple-700 dark:text-purple-200">Encerrado</span>}</p>
            {e.percentualExecucao !== null && <div role="progressbar" aria-label={`Progresso físico de ${e.nome}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={e.percentualExecucao} className="h-2 max-w-48 overflow-hidden rounded-full bg-foreground/10"><span className="block h-full rounded-full bg-current" style={{ width: `${e.percentualExecucao}%` }} /></div>}
            <p className="text-xs text-foreground/70">{textoFonte(e)}</p>
            {(e.inicioPrevisto || e.terminoPrevisto) && <p className="text-xs text-foreground/65">{civilBR(e.inicioPrevisto)} — {civilBR(e.terminoPrevisto)}</p>}
          </button>
        </article>)}</div>}
      </section>
    </>}

    {erro && !detalhe && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
    {mensagem && !detalhe && <p role="status" className="rounded-lg border border-current/25 p-3 text-sm">{mensagem}</p>}

    {configurandoPesos && dados && podeConfigurar && !entregavelId && <ModalEtapa titulo="Configurar pesos" contexto="Execução física" estadoContextual={estadoContextual} compacto alturaEstavel ocupado={false} focoRetorno={focoConfiguracao} onFechar={() => setConfigurandoPesos(false)}>
      <EditorPesos dados={dados} salvarPeso={consulta.atualizarPesoIndividual} alterarModo={consulta.atualizarModoCalculo} />
    </ModalEtapa>}

    {detalhe && <ModalEtapa alturaEstavel titulo={detalhe.nome} contexto="Execução física do entregável" estadoContextual={estadoFisico(detalhe)} ocupado={salvando} focoRetorno={gatilho} onFechar={fechar} rotuloFechar="Fechar detalhes da execução"
      acoes={podeEditar && detalhe.editavel && detalhe.tipo !== 'RECORRENTE' && !['OCORRENCIAS', 'CONFLITO_QUANTIDADE'].includes(detalhe.fonte) && !editandoExecucao ?
        <BotaoEditarModal rotulo="Editar execução" onClick={() => setEditandoExecucao(true)} /> : undefined}>
      <div className="space-y-4" data-tec08-estado={estadoFisico(detalhe)} data-tec08-secao-contextual>
        <div className="flex gap-1 rounded-xl border border-current/20 p-1" role="tablist" aria-label="Detalhes de execução do entregável">
          <button type="button" role="tab" aria-selected={abaDetalhe === 'AVANCO'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${abaDetalhe === 'AVANCO' ? 'bg-current/20 underline underline-offset-4' : 'hover:bg-current/10'}`} onClick={() => setAbaDetalhe('AVANCO')}>Avanço físico</button>
          <button type="button" role="tab" aria-selected={abaDetalhe === 'OCORRENCIAS'} className={`rounded-lg px-3 py-2 text-sm font-semibold ${abaDetalhe === 'OCORRENCIAS' ? 'bg-current/20 underline underline-offset-4' : 'hover:bg-current/10'}`} onClick={() => setAbaDetalhe('OCORRENCIAS')}>Ocorrências</button>
        </div>
        <div role="tabpanel" hidden={abaDetalhe !== 'AVANCO'} className={abaDetalhe !== 'AVANCO' ? 'hidden' : 'space-y-3'}>
        <div data-pi-superficie className="rounded-xl border p-4">
          <p className="text-xs text-foreground/65">{rotulosTipo[detalhe.tipo]} · {statusFisico(detalhe)}</p>
          <p data-pi-titulo className="mt-2 text-3xl font-bold">{percent(detalhe.percentualExecucao)}</p>
          <p className="mt-2 text-sm text-foreground/75">{textoFonte(detalhe)}</p>
        </div>
        {detalhe.percentualExecucao == null && <p className="rounded-lg border border-amber-500/30 p-3 text-sm text-foreground/75">Execução ainda não calculável com os dados disponíveis. Para entregáveis recorrentes, gere e confira os períodos da agenda antes de obter o percentual.</p>}
        <dl className="grid gap-3 sm:grid-cols-2">
          {detalhe.tipo === 'QUANTITATIVO' && <><Dado nome="Quantidade prevista" valor={numero(detalhe.previsto)} /><Dado nome="Quantidade realizada" valor={numero(detalhe.realizado)} /></>}
          {detalhe.tipo === 'RECORRENTE' && <><Dado nome="Períodos previstos" valor={numero(detalhe.previsto)} /><Dado nome="Períodos concluídos" valor={numero(detalhe.realizado)} /></>}
          {detalhe.tipo === 'MARCO' && <Dado nome="Data efetiva do marco" valor={civilBR(detalhe.dataEfetivaMarco)} />}
          <Dado nome="Peso operacional" valor={detalhe.pesoOperacional == null ? 'Não definido' : `${Number(detalhe.pesoOperacional).toLocaleString('pt-BR')}%`} />
          <Dado nome="Período de execução previsto" valor={`${civilBR(detalhe.inicioPrevisto)} — ${civilBR(detalhe.terminoPrevisto)}`} />
        </dl>
    {erro && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
        {mensagem && <p role="status" className="rounded-lg border border-current/30 p-3 text-sm">{mensagem}</p>}
        {editandoExecucao && podeEditar && detalhe.editavel && detalhe.tipo !== 'RECORRENTE' && !['OCORRENCIAS', 'CONFLITO_QUANTIDADE'].includes(detalhe.fonte) && <form data-pi-formulario className="space-y-3 rounded-xl border border-current/20 p-4" onSubmit={ev => void salvarExecucao(ev, detalhe)}>
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
/** Editor incremental. Cada confirmação persiste um peso sem exigir soma de 100%.
 *  Ponderação só pode ser ativada depois da configuração completa. */
function EditorPesos({ dados, salvarPeso, alterarModo }: {
  dados: ProgressoContrato;
  salvarPeso: (entregavelId: string, versao: string, peso: string) => Promise<void>;
  alterarModo: (versao: string, modo: 'SIMPLES' | 'PONDERADO') => Promise<void>;
}) {
  const [pesquisa, setPesquisa] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [editandoModo, setEditandoModo] = useState(false);
  const [novoModo, setNovoModo] = useState<'SIMPLES' | 'PONDERADO'>(dados.modoCalculo);
  const [avisoPeso, setAvisoPeso] = useState(false);
  const itens = dados.entregaveis.filter(e => e.nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(pesquisa.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
  const itensVisiveis = itens.slice(0, 5);
  const inicio = (e: ProgressoEntregavel) => { setEditando(e.entregavelId); setRascunho(e.pesoOperacional == null ? '' : String(Number(e.pesoOperacional)));  setErro(''); };
  async function confirmar(e: ProgressoEntregavel) {
    const normalizado = rascunho.trim().replace(',', '.');
    if (!/^(?:100(?:\.0{1,2})?|\d{1,2}(?:\.\d{1,2})?)$/.test(normalizado)) {
      setErro('Informe um peso de 0% a 100%, com até duas casas decimais.'); return;
    }
    setOcupado(true); setErro('');
    try {
      await salvarPeso(e.entregavelId, dados.versaoPesos, normalizado);
      setEditando(null);

    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar o peso.'); }
    finally { setOcupado(false); }
  }
  async function modo(m: 'SIMPLES' | 'PONDERADO') {
    if (m === 'PONDERADO' && !dados.pesosValidos) { setAvisoPeso(true); return; }
    setOcupado(true); setErro('');
    try { await alterarModo(dados.versaoPesos, m); setEditandoModo(false); }
    catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível alterar o modo.'); }
    finally { setOcupado(false); }
  }
  return <div className="space-y-4" data-tec09-configuracao>
    <p className="text-sm text-foreground/80">O peso informa a porcentagem que cada entregável representa na realização de 100% do contrato. Por exemplo: A representa 20% e B representa 80%. Ocorrências, atividades e evidências registram ou comprovam a execução conforme o tipo de entregável. Nenhum desses registros recebe peso adicional; a comprovação documental, isoladamente, não aumenta o avanço físico.</p>
    <div data-pi-superficie className="grid gap-3 rounded-xl border p-3 text-sm sm:grid-cols-2">
      <div><span className="text-xs text-foreground/65">Modo de cálculo</span>
        {!editandoModo ? <div className="mt-1 flex items-center gap-2"><strong>{dados.modoCalculo === 'PONDERADO' ? 'Média ponderada' : 'Média simples'}</strong><button type="button" data-pi-acao="contextual" aria-label="Alterar modo de cálculo" title="Alterar modo de cálculo" disabled={ocupado || editando !== null} className="rounded-md p-1.5 focus-visible:outline-2 focus-visible:outline-current" onClick={() => { setNovoModo(dados.modoCalculo); setEditandoModo(true); }}>✎</button></div>
          : <div className="mt-2 space-y-2"><div role="radiogroup" aria-label="Modo de cálculo" className="inline-flex max-w-full gap-1 rounded-lg border border-current/30 p-1">
              {(['SIMPLES','PONDERADO'] as const).map(m => <button key={m} type="button" role="radio" aria-checked={novoModo === m} disabled={ocupado} onClick={() => setNovoModo(m)} className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors ${novoModo === m ? 'bg-current/20 underline underline-offset-4' : 'hover:bg-current/10'} disabled:opacity-45`}>{m === 'SIMPLES' ? 'Média simples' : 'Média ponderada'}</button>)}
            </div><div className="flex gap-2"><button type="button" className={CANCELAR_PESOS} disabled={ocupado} onClick={() => setEditandoModo(false)}>Cancelar</button><button type="button" data-pi-acao="primaria" className={`${PRIMARIO} min-h-9 bg-current/20`} disabled={ocupado || novoModo === dados.modoCalculo} onClick={() => void modo(novoModo)}>Confirmar</button></div></div>}
      </div>
      <div><span className="text-xs text-foreground/65">Distribuição dos pesos</span><p className="mt-1 font-semibold">{Number(dados.somaPesos ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}% de 100%</p></div>
    </div>
    <CampoBuscaSugestoes valor={pesquisa} onChange={setPesquisa}
      rotulo="Pesquisar entregável" placeholder="Digite ou selecione um entregável..." opcoes={dados.entregaveis.map(e => e.nome)} />
    <div className="max-h-[40dvh] space-y-2 overflow-y-auto pr-1" role="list" aria-label="Pesos por entregável">
      {itensVisiveis.map(e => <article key={e.entregavelId} role="listitem" data-pi-superficie className="rounded-xl border p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="min-w-0 flex-1"><p title={e.nome} className="truncate text-sm font-semibold">{e.nome}</p></div>
          {editando === e.entregavelId
            ? <form className="flex min-w-0 flex-wrap items-center justify-end gap-2" onSubmit={ev => { ev.preventDefault(); void confirmar(e); }}>
                <label className="flex w-28 items-center gap-1 border-b border-current/50 focus-within:border-current">
                  <input aria-label={`Novo peso de ${e.nome}`} type="text" inputMode="decimal" maxLength={6} autoFocus value={rascunho} onChange={ev => setRascunho(ev.target.value)} placeholder="Ex.: 20" disabled={ocupado} className="w-full min-w-0 bg-transparent py-1 text-right text-sm font-semibold outline-none" /><span className="text-xs text-foreground/70">%</span>
                </label>
                <button type="button" disabled={ocupado} className="rounded-lg border border-red-500/45 bg-red-500/10 px-2.5 py-2 text-xs font-bold text-red-700 hover:bg-red-500/15 dark:text-red-300" onClick={() => { setEditando(null); setErro(''); }}>Cancelar</button>
                <button type="submit" disabled={ocupado} data-pi-acao="primaria" className="rounded-lg px-2.5 py-2 text-xs font-bold disabled:opacity-50">Confirmar</button>
              </form>
            : <div className="flex shrink-0 items-center gap-2"><span className="text-sm font-semibold tabular-nums">{e.pesoOperacional == null ? '—' : Number(e.pesoOperacional).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'}</span>
                <button type="button" aria-label={`Editar peso de ${e.nome}`} title="Editar peso" disabled={ocupado || editando !== null}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-current/25 hover:bg-current/10 disabled:opacity-40" onClick={() => inicio(e)}>
                  <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m16 4 4 4M4 20l4.5-1 11-11a2.83 2.83 0 0 0-4-4l-11 11z" /></svg>
                </button>
              </div>}
        </div>
      </article>)}
      {itens.length === 0 && <p className="rounded-xl border border-dashed p-4 text-sm text-foreground/70">Nenhum entregável encontrado.</p>}
      {itens.length > 5 && <p className="px-2 py-1 text-xs text-foreground/65">Exibindo 5 de {itens.length}. Use a pesquisa para localizar outro entregável.</p>}
    </div>
    {avisoPeso && <ModalEtapa titulo="Média ponderada indisponível" contexto="Configuração de pesos" camada="edicao" estreito compacto ocupado={false} onFechar={() => setAvisoPeso(false)}>
      <p className="text-sm text-foreground/80">Para utilizar a média ponderada, a soma dos pesos dos entregáveis deve representar 100% da realização do contrato.</p>
      <div className="mt-4 flex justify-end"><button type="button" data-pi-acao="primaria" className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green" onClick={() => setAvisoPeso(false)}>Entendi</button></div>
    </ModalEtapa>}
    {erro && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
        {!dados.pesosValidos && <p className="text-xs text-foreground/65">Os pesos podem ser ajustados individualmente. O cálculo permanece simples até que totalizem 100%.</p>}
  </div>;
}
