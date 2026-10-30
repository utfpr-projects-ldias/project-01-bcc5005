'use client';

import { useState } from 'react';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { ErroEtapa, STATUS_ETAPA, type DadosEtapa, type Etapa } from '@/lib/etapas';
import { FormularioEtapa } from './formulario-etapa';

/** Indicador visual e semantico de expansao; a animacao respeita movimento reduzido. */
function SetaPainel({ aberto }: { aberto: boolean }) {
  return <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    className={`h-4 w-4 shrink-0 transition-transform duration-300 ease-out motion-reduce:transition-none ${aberto ? 'rotate-180' : ''}`}>
    <path d="m5 7.5 5 5 5-5" />
  </svg>;
}

function dataBR(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

export function PainelEtapas({ contratoId, habilitado, podeGerenciar }: {
  contratoId: string; habilitado: boolean; podeGerenciar: boolean;
}) {
  const consulta = useEtapas(contratoId, habilitado);
  const mutacoes = useMutacoesEtapas(contratoId);
  const [editor, setEditor] = useState<string | null>(null);
  const [ordemProvisoria, setOrdemProvisoria] = useState<string[] | null>(null);
  const [reordenando, setReordenando] = useState(false);
  const [salvandoFormulario, setSalvandoFormulario] = useState(false);
  const [erroAcao, setErroAcao] = useState('');
  const [avisoAcao, setAvisoAcao] = useState('');
  const [bloqueio, setBloqueio] = useState(false);
  const erroConsulta = consulta.erro;
  const erroProtegido = erroConsulta instanceof ErroEtapa && [401, 403, 404].includes(erroConsulta.status);
  const etapas = habilitado && !erroProtegido && !bloqueio ? consulta.dados : undefined;
  const ordenadas = ordemProvisoria && etapas ? ordemProvisoria.map((id) => etapas.find((e) => e.id === id)).filter((e): e is Etapa => !!e) : etapas;
  const itemEditando = editor && editor !== 'nova' ? etapas?.find((e) => e.id === editor) : undefined;
  const podeEscrever = habilitado && podeGerenciar && !erroProtegido && !bloqueio;
  const entregaveisQuery = useEntregaveis(contratoId, habilitado && !erroProtegido && !bloqueio && !!etapas);

  async function atualizar() {
    setErroAcao(''); setAvisoAcao('');
    try { await consulta.atualizar(); setBloqueio(false); }
    catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); setEditor(null); }
      setErroAcao(erro instanceof ErroEtapa ? erro.message : 'Não foi possível atualizar as etapas.');
    }
  }

  async function salvar(dados: DadosEtapa) {
    try {
      if (editor === 'nova') await mutacoes.criar(dados);
      else if (editor) await mutacoes.editar(editor, dados);
      else return;
      setEditor(null); setErroAcao(''); setAvisoAcao('Etapa salva com sucesso.');
    } catch (erro) {
      if (erro instanceof ErroEtapa && [401, 403, 404].includes(erro.status)) { setBloqueio(true); setEditor(null); }
      throw erro;
    }
  }

  async function mover(indice: number, deslocamento: -1 | 1) {
    if (!etapas || !podeEscrever || reordenando || salvandoFormulario || indice + deslocamento < 0 || indice + deslocamento >= etapas.length) return;
    const idsOrdemAtual = etapas.map((etapa) => etapa.id);
    const idsOrdemNova = [...idsOrdemAtual];
    [idsOrdemNova[indice], idsOrdemNova[indice + deslocamento]] = [idsOrdemNova[indice + deslocamento], idsOrdemNova[indice]];
    setOrdemProvisoria(idsOrdemNova); setReordenando(true); setErroAcao(''); setAvisoAcao('');
    try {
      await mutacoes.reordenar(idsOrdemAtual, idsOrdemNova);
      setAvisoAcao('Ordem das etapas salva.');
    } catch (erro) {
      const conhecido = erro instanceof ErroEtapa;
      setErroAcao(conhecido ? erro.message : 'Não foi possível reordenar. A ordem anterior foi restaurada.');
      if (conhecido && [401, 403, 404].includes(erro.status)) { setBloqueio(true); setEditor(null); }
      if (conhecido && erro.status === 409) void consulta.atualizar().catch(() => {});
    } finally {
      setOrdemProvisoria(null); setReordenando(false);
    }
  }

  return <section aria-labelledby="titulo-etapas" className="min-w-0 space-y-4 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 id="titulo-etapas" className="text-lg font-semibold text-brand-neon">Etapas do contrato</h3>
        <p className="mt-1 text-sm text-foreground/65">Planejamento das etapas em sequência, vinculado a este contrato.</p></div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void atualizar()} disabled={!habilitado || consulta.atualizando || reordenando || salvandoFormulario}
          className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm disabled:opacity-50">{consulta.atualizando ? 'Atualizando...' : 'Atualizar etapas'}</button>
        {podeEscrever && <button type="button" onClick={() => { setEditor((atual) => atual === 'nova' ? null : 'nova'); setErroAcao(''); }}
          disabled={reordenando || salvandoFormulario} aria-expanded={editor === 'nova'} aria-controls="formulario-nova-etapa"
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors duration-200 motion-reduce:transition-none disabled:cursor-default ${editor === 'nova' ? 'border-brand-green bg-brand-green/15 text-brand-neon' : 'border-brand-green bg-brand-green text-background hover:brightness-110'} disabled:opacity-100`}>
          <span>{editor === 'nova' ? 'Cadastrando etapa' : 'Nova etapa'}</span><SetaPainel aberto={editor === 'nova'} />
        </button>}
      </div>
    </div>
    {erroAcao && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">{erroAcao}</p>}
    {avisoAcao && <p role="status" className="text-sm text-brand-neon">{avisoAcao}</p>}
    {reordenando && <p role="status" className="text-sm text-foreground/65">Salvando nova ordem...</p>}
    {consulta.carregando && !etapas && !erroConsulta && !bloqueio && <p role="status" className="text-sm text-foreground/70">Carregando etapas...</p>}
    {Boolean(erroConsulta) && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">
      {erroConsulta instanceof ErroEtapa ? erroConsulta.message : 'Não foi possível consultar as etapas. Tente atualizar.'}
    </p>}
    {bloqueio && !erroConsulta && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-400">O acesso às etapas precisa ser verificado novamente. Atualize a página.</p>}
    {podeEscrever && editor === 'nova' && <div id="formulario-nova-etapa" className="etapa-form-expandido">
      <FormularioEtapa key="nova" onSalvar={salvar} onCancelar={() => setEditor(null)}
        onSalvandoMudou={setSalvandoFormulario} />
    </div>}
    {etapas?.length === 0 && <div className="rounded-xl border border-dashed border-brand-green/30 p-4 text-sm text-foreground/70">
      Ainda não há etapas cadastradas para este contrato. {podeEscrever ? 'Use “Nova etapa” para organizar o planejamento.' : 'O planejamento ainda não foi iniciado.'}
    </div>}
    {!!ordenadas?.length && <ol aria-label="Etapas em ordem de execução" className="space-y-3">
      {ordenadas.map((etapa, indice) => <li key={etapa.id} className="min-w-0 rounded-xl border border-brand-green/25 bg-background/70 p-4">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-foreground/55">Etapa {indice + 1} {etapa.codigo ? `· ${etapa.codigo}` : ''}</p>
            <h4 className="break-words font-semibold">{etapa.nome}</h4>
            <p className="text-sm text-foreground/70">{STATUS_ETAPA[etapa.status]}</p>
          </div>
          {podeEscrever && <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={reordenando || salvandoFormulario || indice === 0} onClick={() => void mover(indice, -1)}
              aria-label={`Subir etapa ${etapa.nome}`} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm disabled:opacity-40">Subir</button>
            <button type="button" disabled={reordenando || salvandoFormulario || indice === ordenadas.length - 1} onClick={() => void mover(indice, 1)}
              aria-label={`Descer etapa ${etapa.nome}`} className="rounded-lg border border-brand-green/40 px-3 py-2 text-sm disabled:opacity-40">Descer</button>
            <button type="button" disabled={reordenando || salvandoFormulario}
              onClick={() => { setEditor((atual) => atual === etapa.id ? null : etapa.id); setErroAcao(''); }}
              aria-expanded={editor === etapa.id} aria-controls={`formulario-etapa-${etapa.id}`}
              aria-label={editor === etapa.id ? `Editando etapa ${etapa.nome}` : `Editar etapa ${etapa.nome}`}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors duration-200 motion-reduce:transition-none disabled:cursor-default ${editor === etapa.id ? 'border-brand-green bg-brand-green/15 text-brand-neon' : 'border-brand-green/40 hover:bg-brand-green/10'} ${reordenando ? 'opacity-40' : ''}`}>
              {editor === etapa.id ? 'Editando' : 'Editar'} <SetaPainel aberto={editor === etapa.id} />
            </button>
          </div>}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-foreground/55">Início previsto</dt><dd>{dataBR(etapa.inicioPrevisto)}</dd></div>
          <div><dt className="text-xs text-foreground/55">Término previsto</dt><dd>{dataBR(etapa.terminoPrevisto)}</dd></div>
        </dl>
        {etapa.descricao && <p className="mt-3 whitespace-pre-wrap break-words text-sm text-foreground/75">{etapa.descricao}</p>}
        {etapa.observacoes && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground/65"><strong>Observações:</strong> {etapa.observacoes}</p>}
        {etapa.avisoVigencia && <p role="note" className="mt-3 rounded-lg border border-amber-600/45 p-3 text-sm text-foreground">
          Atenção: as datas previstas desta etapa estão fora da vigência atual do contrato. Revise o planejamento; nenhuma data foi alterada automaticamente.
        </p>}
        <EntregaveisDaEtapa contratoId={contratoId} etapaId={etapa.id}
          dados={entregaveisQuery.dados} erro={entregaveisQuery.erro}
          carregando={entregaveisQuery.carregando} atualizar={entregaveisQuery.atualizar} podeCriar={podeEscrever} />
        {podeEscrever && editor === etapa.id && itemEditando && <div id={`formulario-etapa-${etapa.id}`} className="etapa-form-expandido mt-4">
          <FormularioEtapa key={etapa.id} inicial={itemEditando} onSalvar={salvar} onCancelar={() => setEditor(null)}
            onSalvandoMudou={setSalvandoFormulario} />
        </div>}
      </li>)}
    </ol>}
  </section>;
}
