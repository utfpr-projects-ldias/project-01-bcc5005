'use client';
import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { SeletorOcorrencia } from './seletor-ocorrencia';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { editarAtividadeApi, type Atividade } from '@/hooks/use-atividades';
import { atividadeSchema, TIPOS_ATIVIDADE, type FormularioAtividade } from '@/lib/validacao-atividade';

const CAMPO = 'mt-1 w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon';
function dataLocal(data: string): string {
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return '';
  const ajuste = new Date(instante.getTime() - instante.getTimezoneOffset() * 60000);
  return ajuste.toISOString().slice(0, 16);
}
export function ModalEdicaoAtividade({ atividade, contratoId, origem, onFechar, onSalvo }: {
  atividade: Atividade; contratoId: string; origem?: HTMLElement | null;
  onFechar: () => void; onSalvo?: () => void;
}) {
  const entregaveis = useEntregaveis(contratoId);
  const agenda = useOcorrencias(contratoId);
  const [form, setForm] = useState<FormularioAtividade>(() => ({
    titulo: atividade.titulo, dataHora: dataLocal(atividade.dataHora), descricao: atividade.descricao,
    tipo: TIPOS_ATIVIDADE.find(x => x === atividade.tipo) ?? 'Outro',
    responsavel: atividade.responsavel ?? '', duracao: atividade.duracao ?? '',
    participantes: (atividade.participantes ?? []).join(', '), local: atividade.local ?? '',
    observacoes: atividade.observacoes ?? '', ocorrenciaId: atividade.ocorrenciaId, ocorrenciaIds: atividade.ocorrencias?.map(o => o.id) ?? (atividade.ocorrenciaId ? [atividade.ocorrenciaId] : []), quantidadeExecucao: atividade.quantidadeExecucao ?? null, entregavelIds: atividade.entregaveis.map(x => x.id),
  }));
  const selecionada = agenda.ocorrencias.find(o => o.id === form.ocorrenciaId);
  const unidade = entregaveis.dados?.find(e => e.id === selecionada?.entregavelId)?.unidadeMedida || "unidades";
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const campo = <K extends keyof FormularioAtividade>(chave: K, valor: FormularioAtividade[K]) =>
    setForm(anterior => ({ ...anterior, [chave]: valor }));
  async function salvar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); if (salvando) return;
    setErro(''); setErrosCampos({});
    if (atividade.status !== 'REGISTRADA') { setErro('Esta atividade não está aberta para edição.'); return; }
    const validado = atividadeSchema.safeParse(form);
    if (!validado.success) {
      const erros: Record<string, string> = {};
      validado.error.issues.forEach(issue => { erros[String(issue.path[0])] ??= issue.message; });
      setErrosCampos(erros); setErro('Confira os campos destacados.'); return;
    }
    const validos = new Set((entregaveis.dados ?? []).filter(e => !e.arquivadoEm && e.statusExecucao !== 'CONCLUIDO').map(e => e.id));
    if (validado.data.entregavelIds.some(id => !validos.has(id))) {
      setErro('Vincule somente entregáveis abertos e disponíveis para edição.'); return;
    }
    setSalvando(true);
    try {
      await editarAtividadeApi(contratoId, atividade.id, {
        ...validado.data, dataHora: new Date(validado.data.dataHora).toISOString(),
        participantes: validado.data.participantes.split(',').map(x => x.trim()).filter(Boolean),
      });
      onSalvo?.(); onFechar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível editar a atividade.'); }
    finally { setSalvando(false); }
  }
  return createPortal(<ModalEtapa titulo="Editar atividade" contexto={atividade.titulo} estadoContextual="normal"
    ocupado={salvando} larguraAmpla camada="edicao" focoRetorno={origem} onFechar={onFechar} rotuloFechar="Fechar edição da atividade">
    <form aria-label="Formulário de edição da atividade" onSubmit={salvar} noValidate className="space-y-2.5">
      <p className="text-xs text-foreground/70">Campos com * são obrigatórios. As alterações ficam registradas na rastreabilidade.</p>
      {erro && <p role="alert" className="rounded-lg border border-error-text/35 p-3 text-sm text-error-text">{erro}</p>}
      <label className="block text-sm font-medium">Título *
        <input required maxLength={255} className={CAMPO} value={form.titulo} onChange={e => campo('titulo', e.target.value)} aria-invalid={Boolean(errosCampos.titulo)} /></label>
      {errosCampos.titulo && <p className="text-xs text-error-text">{errosCampos.titulo}</p>}
      <div className="grid gap-3 lg:grid-cols-2"><label className="block min-w-0 text-sm font-medium">Data e hora *
        <input required type="datetime-local" lang="pt-BR" className={`${CAMPO} tec08-data-hora`} value={form.dataHora} onChange={e => campo('dataHora', e.target.value)} aria-invalid={Boolean(errosCampos.dataHora)} /></label>
        <label className="block text-sm font-medium">Tipo *
          <select className={CAMPO} value={form.tipo} onChange={e => campo('tipo', e.target.value as FormularioAtividade['tipo'])}>
            {TIPOS_ATIVIDADE.map(x => <option key={x}>{x}</option>)}</select></label></div>
      {errosCampos.dataHora && <p className="text-xs text-error-text">{errosCampos.dataHora}</p>}
      <label className="block text-sm font-medium">Descrição *
        <textarea required rows={2} maxLength={5000} className={CAMPO} value={form.descricao} onChange={e => campo('descricao', e.target.value)} /></label>
      {errosCampos.descricao && <p className="text-xs text-error-text">{errosCampos.descricao}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Responsável
          <input maxLength={255} className={CAMPO} value={form.responsavel} onChange={e => campo('responsavel', e.target.value)} /></label>
        <label className="block text-sm font-medium">Duração
          <input maxLength={80} className={CAMPO} value={form.duracao} onChange={e => campo('duracao', e.target.value)} /></label>
        <label className="block text-sm font-medium">Participantes
          <input maxLength={2000} className={CAMPO} value={form.participantes} onChange={e => campo('participantes', e.target.value)} /></label>
        <label className="block text-sm font-medium">Local
          <input maxLength={255} className={CAMPO} value={form.local} onChange={e => campo('local', e.target.value)} /></label>
      </div>
      <label className="block text-sm font-medium">Observações
        <textarea rows={2} maxLength={5000} className={CAMPO} value={form.observacoes} onChange={e => campo('observacoes', e.target.value)} /></label>
      <fieldset className="space-y-2 rounded-lg border border-brand-green/25 p-3"><legend className="px-1 text-sm font-semibold">Vincular ao(s) entregável(is) *</legend>
        {entregaveis.carregando ? <p role="status" className="text-sm">Carregando entregáveis...</p> : entregaveis.erro ?
          <p role="alert" className="text-sm text-error-text">Não foi possível consultar entregáveis.</p> :
          <div className="max-h-44 space-y-1 overflow-y-auto">{(entregaveis.dados ?? []).filter(e => !e.arquivadoEm && e.statusExecucao !== 'CONCLUIDO').map(e =>
            <label key={e.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-brand-green/10">
              <input className="mt-1 accent-brand-green" type="checkbox" checked={form.entregavelIds.includes(e.id)}
                onChange={() => campo('entregavelIds', form.entregavelIds.includes(e.id) ? form.entregavelIds.filter(x => x !== e.id) : [...form.entregavelIds, e.id])} />
              <span className="min-w-0 break-words">{e.nome}</span></label>)}</div>}
        {errosCampos.entregavelIds && <p className="text-xs text-error-text">{errosCampos.entregavelIds}</p>}
      </fieldset>
      {selecionada && (selecionada.modoRegistro === 'DESCRITIVO' || selecionada.origem === 'RECORRENTE') && <p role="status" className="rounded-lg border border-current/20 bg-background/35 p-3 text-xs text-foreground/70">Esta ocorrência é descritiva: registre o que foi realizado no campo Descrição, sem informar uma quantidade.</p>}
      <SeletorOcorrencia contratoId={contratoId} entregavelIds={form.entregavelIds}
        valor={form.ocorrenciaId} valores={form.ocorrenciaIds ?? []}
        onChangeMultiplas={ids => setForm(atual => ({ ...atual, ocorrenciaIds: ids,
          ocorrenciaId: ids.includes(atual.ocorrenciaId ?? '') ? atual.ocorrenciaId : null,
          quantidadeExecucao: ids.includes(atual.ocorrenciaId ?? '') ? atual.quantidadeExecucao : null }))}
        onChange={v => { campo('ocorrenciaId', v); campo('quantidadeExecucao', null); }} />
      {selecionada?.origem === 'MANUAL_QUANTITATIVA' && (selecionada.modoRegistro === 'QUANTITATIVO' || (!selecionada.modoRegistro && (selecionada.metaQuantidade != null || selecionada.quantidadeRealizada != null))) && <label className="block text-sm font-medium">Quantidade executada nesta atividade
        <input type="number" min="0" step="0.001" inputMode="decimal" className={CAMPO} value={form.quantidadeExecucao ?? ''} onChange={e => campo('quantidadeExecucao', e.target.value || null)} placeholder="Ex.: 10" /><span className="ml-2 text-sm text-foreground/65">{unidade}</span>
      </label>}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4">
        <button type="button" className="rounded-lg border border-brand-green/30 px-4 py-2 text-sm" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="submit" aria-busy={salvando} disabled={salvando || entregaveis.carregando || Boolean(entregaveis.erro)}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green">{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
      </footer>
    </form>
  </ModalEtapa>, document.body);
}
