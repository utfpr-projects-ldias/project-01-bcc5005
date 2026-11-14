'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { criarCompartilhada, type VinculoCompartilhado } from '@/lib/atividades-compartilhadas';

const campo = 'w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30';
const vazio = (contratoId: string): VinculoCompartilhado => ({ contratoId, entregavelIds: [], ocorrenciaIds: [], medicoes: [] });

function EditorContrato({ contratoId, valor, onChange, nome }: {
  contratoId: string; valor: VinculoCompartilhado; onChange: (v: VinculoCompartilhado) => void; nome: string;
}) {
  const acesso = useAcessoContrato(contratoId);
  const entregaveis = useEntregaveis(contratoId);
  const etapas = useEtapas(contratoId);
  const ocorrencias = useOcorrencias(contratoId);
  const permitido = Boolean(acesso.dados?.permissoes?.registrarAtividades && !acesso.erro);
  const podeVincularOcorrencia = Boolean(acesso.dados?.permissoes?.vincularAtividadesOcorrencia);
  const podeMedirOcorrencia = Boolean(acesso.dados?.permissoes?.registrarExecucaoOcorrencia);
  const etapasAbertas = new Set((etapas.dados??[]).filter(e=>!e.arquivadoEm && !e.conclusaoSolicitadaEm && !e.encerramentoSolicitadoEm && !['CONCLUIDA','ENCERRADA'].includes(e.status)).map(e=>e.id));
  const entregaveisValidos = (entregaveis.dados ?? []).filter(e => !e.arquivadoEm && etapasAbertas.has(e.etapaId) &&
    !['CONCLUIDO', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? ''));
  const registros = ocorrencias.ocorrencias.filter(o => valor.entregavelIds.includes(o.entregavelId) &&
    !['CONCLUIDO', 'ENCERRADA', 'PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO'].includes(o.status));
  return <section className="min-w-0 space-y-3 rounded-xl border border-brand-green/25 p-3" aria-label={`Vínculos do contrato ${nome}`}>
    <h4 className="min-w-0 truncate text-sm font-semibold" title={nome}>{nome}</h4>
    {acesso.carregando || entregaveis.carregando || etapas.carregando ? <p className="text-xs text-foreground/60">Carregando planejamento...</p>
      : !permitido ? <p role="alert" className="text-xs text-error-text">Sem autorização para registrar neste contrato.</p> : <>
        <fieldset className="space-y-1"><legend className="text-xs font-semibold">Entregáveis atendidos</legend>
          <div className="max-h-36 overflow-auto">{entregaveisValidos.map(e => <label key={e.id} className="flex items-start gap-2 rounded p-1.5 text-xs hover:bg-brand-green/10">
            <input type="checkbox" className="mt-0.5 accent-brand-green" checked={valor.entregavelIds.includes(e.id)} onChange={() => {
              const lista = valor.entregavelIds.includes(e.id) ? valor.entregavelIds.filter(id => id !== e.id) : [...valor.entregavelIds, e.id];
              const selecionadas = ocorrencias.ocorrencias.filter(o => lista.includes(o.entregavelId)).map(o => o.id);
              onChange({ ...valor, entregavelIds: lista, ocorrenciaIds: valor.ocorrenciaIds.filter(id => selecionadas.includes(id)),
                medicoes: valor.medicoes.filter(m => selecionadas.includes(m.ocorrenciaId)) });
            }}/><span className="min-w-0 break-words">{e.nome}</span></label>)}
          </div>
          {!entregaveisValidos.length && <p className="text-xs text-foreground/55">Nenhum entregável disponível em etapa aberta neste contrato.</p>}
        </fieldset>
        {valor.entregavelIds.length > 0 && <fieldset className="space-y-2 border-t border-brand-green/20 pt-3">
          {!podeVincularOcorrencia && <p role="status" className="text-xs text-amber-300">Sem permissão para vincular ocorrências. Você pode registrar a atividade diretamente nos entregáveis selecionados.</p>}
          {podeVincularOcorrencia && !podeMedirOcorrencia && <p className="text-xs text-amber-300">Vínculo permitido; para informar quantidades, solicite a permissão Registrar execução.</p>}
          <legend className="text-xs font-semibold">Ocorrências e quantidade executada por ocorrência</legend>
          {registros.length ? registros.map(o => {
            const selecionada = valor.ocorrenciaIds.includes(o.id);
            const medicao = valor.medicoes.find(m => m.ocorrenciaId === o.id);
            const unidade = entregaveis.dados?.find(e => e.id === o.entregavelId)?.unidadeMedida || 'unidades';
            return <div key={o.id} className="grid min-w-0 gap-2 rounded-lg border border-current/15 p-2 sm:grid-cols-[minmax(0,1fr)_8rem] sm:items-center">
              <label className="flex min-w-0 items-start gap-2 text-xs"><input type="checkbox" className="mt-0.5 accent-brand-green" disabled={!podeVincularOcorrencia} checked={selecionada} onChange={() => {
                const ids = selecionada ? valor.ocorrenciaIds.filter(id => id !== o.id) : [...valor.ocorrenciaIds, o.id];
                onChange({ ...valor, ocorrenciaIds: ids, medicoes: valor.medicoes.filter(m => ids.includes(m.ocorrenciaId)) });
              }}/><span className="min-w-0 break-words">{o.titulo}</span></label>
              {selecionada && o.modoRegistro === 'QUANTITATIVO' ? <label className="text-[11px]">Realizado ({unidade})
                <input type="text" disabled={!podeMedirOcorrencia} inputMode="decimal" pattern="[0-9]+([.,][0-9]{1,3})?" className={campo} value={medicao?.quantidade ?? ''} placeholder="0" onChange={event => {
                  const numero = event.target.value.replace(',', '.');
                  if (numero && !/^\d{1,15}(?:\.\d{0,3})?$/.test(numero)) return;
                  const novas = valor.medicoes.filter(m => m.ocorrenciaId !== o.id);
                  if (numero && /^\d{1,15}(?:\.\d{0,3})?$/.test(numero)) novas.push({ ocorrenciaId: o.id, quantidade: numero });
                  onChange({ ...valor, medicoes: novas });
                }}/>
              </label> : <span className="text-xs text-foreground/50">{selecionada ? 'Descritiva' : 'Não selecionada'}</span>}
            </div>;
          }) : <p className="text-xs text-foreground/55">Nenhuma ocorrência aberta selecionável. O vínculo direto ao entregável permanece válido.</p>}
        </fieldset>}
      </>}
  </section>;
}

export function ModalAtividadeCompartilhada({ contratoInicialId, onFechar, onSalvo }: {
  contratoInicialId: string; onFechar: () => void; onSalvo?: () => void | Promise<void>;
}) {
  const consulta = useListaContratos();
  const contratos = useMemo(() => (consulta.dados ?? []).filter(c => !c.arquivadoEm &&
    ['PLANEJAMENTO', 'EM_EXECUCAO'].includes(c.status)), [consulta.dados]);
  const [vinculos, setVinculos] = useState<VinculoCompartilhado[]>(() => [vazio(contratoInicialId)]);
  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [dataHora, setDataHora] = useState('');
  const [tipo, setTipo] = useState('Reunião');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const disponiveis = contratos.filter(c => !vinculos.some(v => v.contratoId === c.id));
  const faltamContratos = vinculos.length < 2;
  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (salvando) return;
    if (!titulo.trim() || !descricao.trim() || !dataHora || vinculos.length < 2 || vinculos.some(v => !v.entregavelIds.length)) {
      setErro(vinculos.length<2?'Adicione um segundo contrato para criar esta atividade compartilhada.':'Preencha título, descrição, data/hora e marque ao menos um entregável aberto em cada contrato.'); return;
    }
    if (vinculos.some(v => v.medicoes.some(m => !/^\d{1,15}(?:\.\d{1,3})?$/.test(m.quantidade)))) {
      setErro('Confira as quantidades informadas: até três casas decimais por ocorrência.'); return;
    }
    setErro(''); setSalvando(true);
    try {
      await criarCompartilhada({ titulo: titulo.trim(), dataHora: new Date(dataHora).toISOString(),
        descricao: descricao.trim(), tipo, vinculos });
      try { await onSalvo?.(); } catch { /* cadastro confirmado não pode ser repetido por falha de atualização */ }
      onFechar();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível criar a atividade multicontrato.'); }
    finally { setSalvando(false); }
  }
  return createPortal(<ModalEtapa titulo="Atividade em vários contratos" contexto="Diário de execução" estadoContextual="andamento"
    ocupado={salvando} larguraAmpla formularioHorizontal onFechar={onFechar}>
    <form noValidate onSubmit={enviar} className="mx-auto max-w-3xl space-y-4" aria-label="Cadastrar atividade multicontrato">
      {erro && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-sm text-error-text">{erro}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-medium">Título *<input required maxLength={50} className={campo} value={titulo} onChange={e => setTitulo(e.target.value)}/></label>
        <label className="text-xs font-medium">Data e hora *<input required type="datetime-local" lang="pt-BR" className={campo} value={dataHora} onChange={e => setDataHora(e.target.value)}/></label>
        <label className="text-xs font-medium">Tipo *<select className={campo} value={tipo} onChange={e => setTipo(e.target.value)}>
          {['Reunião','Manutenção','Inspeção','Instalação','Treinamento','Outra'].map(t => <option key={t}>{t}</option>)}
        </select></label>
        <label className="text-xs font-medium">Descrição *<textarea required maxLength={500} rows={2} className={campo} value={descricao} onChange={e => setDescricao(e.target.value)}/></label>
      </div>
      {faltamContratos&&<p role="status" className="rounded-lg border border-violet-500/25 p-2 text-xs">Selecione pelo menos mais um contrato e marque seus entregáveis. A criação será feita para todos ou para nenhum.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">Contratos vinculados ({vinculos.length})</h3>
        <label className="text-xs">Adicionar contrato
          <select className={campo} value="" onChange={e => { if (e.target.value) setVinculos(v => [...v,vazio(e.target.value)]); }}>
            <option value="">Selecione...</option>
            {disponiveis.map(c => <option key={c.id} value={c.id}>{c.codigoPublico} · {c.objeto.slice(0,55)}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-3">{vinculos.map(v => {
        const contrato = contratos.find(c => c.id === v.contratoId);
        return <div key={v.contratoId} className="space-y-1">
          <div className="flex items-center justify-end"><button type="button" disabled={vinculos.length <= 1}
            onClick={() => setVinculos(lista => lista.filter(x => x.contratoId !== v.contratoId))}
            className="text-xs text-red-400 underline disabled:opacity-30">Remover contrato</button></div>
          <EditorContrato contratoId={v.contratoId} nome={contrato ? `${contrato.codigoPublico} · ${contrato.objeto}` : 'Contrato'}
            valor={v} onChange={novo => setVinculos(lista => lista.map(x => x.contratoId === novo.contratoId ? novo : x))}/>
        </div>;
      })}</div>
      <div className="flex justify-end gap-2 border-t border-current/20 pt-3">
        <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg border border-red-500/50 px-4 py-2 text-sm text-red-300">Cancelar</button>
        <button type="submit" disabled={salvando} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-40">Criar em {vinculos.length} contratos</button>
      </div>
    </form>
  </ModalEtapa>, document.body);
}
