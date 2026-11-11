'use client';

import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useAtividades, type DadosAtividade } from '@/hooks/use-atividades';
import { atividadeSchema, TIPOS_ATIVIDADE, type FormularioAtividade } from '@/lib/validacao-atividade';

const vazio = (entregavelId: string): FormularioAtividade => ({
  titulo: '', dataHora: '', descricao: '', tipo: 'Reunião', responsavel: '',
  participantes: '', local: '', duracao: '', observacoes: '',
  entregavelIds: entregavelId ? [entregavelId] : [],
});
const CAMPO = 'mt-1 w-full min-w-0 rounded-lg border border-brand-green/30 bg-background px-3 py-2.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon';

type Props = { contratoId: string; entregavelId?: string; origem?: HTMLElement | null; estadoContextual?: EstadoContextual;
  onFechar: () => void; onSalvo?: () => void | Promise<unknown> };

/** Compartilhado com a consulta contratual: nunca redireciona para /atividades.
 * A API revalida contrato, etapas, entregáveis e permissões sob transação. */
export function ModalCadastroAtividade({ contratoId, entregavelId = '', origem, onFechar, onSalvo, estadoContextual = 'normal' }: Props) {
  const [form, setForm] = useState<FormularioAtividade>(() => vazio(entregavelId));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const entregaveisConsulta = useEntregaveis(contratoId);
  const etapasConsulta = useEtapas(contratoId);
  const diario = useAtividades(contratoId, { page: 1, limit: 20 });
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e =>
    !e.arquivadoEm && e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const elegiveis = (entregaveisConsulta.dados ?? []).filter(ent => !ent.arquivadoEm &&
    ent.statusExecucao !== 'CONCLUIDO' && etapasAbertas.has(ent.etapaId));
  const origemNaoElegivel = Boolean(entregavelId && !elegiveis.some(e => e.id === entregavelId));

  async function salvar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (salvando) return;
    const parsed = atividadeSchema.safeParse(form);
    if (!parsed.success) {
      const mapa: Record<string, string> = {};
      for (const problema of parsed.error.issues) mapa[String(problema.path[0])] ??= problema.message;
      setErros(mapa); setErro('Confira os campos destacados.'); return;
    }
    if (origemNaoElegivel || parsed.data.entregavelIds.some(id => !elegiveis.some(e => e.id === id))) {
      setErro('Reabra o contrato, a etapa ou o entregável antes de registrar a atividade.'); return;
    }
    const dados: DadosAtividade = { ...parsed.data, contratoId,
      dataHora: new Date(parsed.data.dataHora).toISOString(),
      participantes: parsed.data.participantes.split(',').map(s => s.trim()).filter(Boolean),
    };
    setSalvando(true); setErro(''); setErros({});
    try { await diario.criarAtividade(dados); await onSalvo?.(); onFechar(); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível registrar a atividade.'); }
    finally { setSalvando(false); }
  }
  const campo = <K extends keyof FormularioAtividade>(nome: K, valor: FormularioAtividade[K]) =>
    setForm(prev => ({ ...prev, [nome]: valor }));

  return createPortal(<ModalEtapa estadoContextual={estadoContextual} titulo="Nova atividade" contexto="Diário de execução" formularioLongo
    ocupado={salvando} camada={entregavelId ? 'edicao' : 'principal'} focoRetorno={origem} onFechar={onFechar} rotuloFechar="Fechar cadastro de atividade">
    <form data-pi-formulario aria-label="Formulário de atividade" onSubmit={salvar} noValidate className="space-y-4">
      <p className="text-xs text-foreground/70">Campos com * são obrigatórios. A atividade pode vincular vários entregáveis abertos do mesmo contrato.</p>
      {erro && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-sm text-error-text">{erro}</p>}
      <label className="block text-sm font-medium">Título *
        <input required maxLength={255} className={CAMPO} value={form.titulo} onChange={e => campo('titulo', e.target.value)} aria-invalid={Boolean(erros.titulo)} />
      </label>{erros.titulo && <p className="text-xs text-error-text">{erros.titulo}</p>}
      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block text-sm font-medium">Data e hora *
          <input required type="datetime-local" lang="pt-BR" className={`${CAMPO} tec08-data-hora`} value={form.dataHora} onChange={e => campo('dataHora', e.target.value)} aria-invalid={Boolean(erros.dataHora)} />
        </label>
        <label className="block text-sm font-medium">Tipo *
          <select className={CAMPO} value={form.tipo} onChange={e => campo('tipo', e.target.value as FormularioAtividade['tipo'])}>
            {TIPOS_ATIVIDADE.map(tipo => <option key={tipo}>{tipo}</option>)}
          </select>
        </label>
      </div>{erros.dataHora && <p className="text-xs text-error-text">{erros.dataHora}</p>}
      <label className="block text-sm font-medium">Descrição *
        <textarea required rows={4} maxLength={5000} className={CAMPO} value={form.descricao} onChange={e => campo('descricao', e.target.value)} />
      </label>{erros.descricao && <p className="text-xs text-error-text">{erros.descricao}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm font-medium">Responsável
          <input maxLength={255} placeholder="Padrão: usuário conectado" className={CAMPO} value={form.responsavel} onChange={e => campo('responsavel', e.target.value)} />
        </label>
        <label className="block text-sm font-medium">Duração
          <input maxLength={80} placeholder="Ex.: 2 horas" className={CAMPO} value={form.duracao} onChange={e => campo('duracao', e.target.value)} />
        </label>
        <label className="block text-sm font-medium">Participantes
          <input maxLength={2000} placeholder="Separe por vírgulas" className={CAMPO} value={form.participantes} onChange={e => campo('participantes', e.target.value)} />
        </label>
        <label className="block text-sm font-medium">Local
          <input maxLength={255} className={CAMPO} value={form.local} onChange={e => campo('local', e.target.value)} />
        </label>
      </div>
      <label className="block text-sm font-medium">Observações
        <textarea rows={2} maxLength={5000} className={CAMPO} value={form.observacoes} onChange={e => campo('observacoes', e.target.value)} />
      </label>
      <fieldset className="rounded-xl border border-brand-green/25 p-3 space-y-2">
        <legend className="px-1 text-sm font-semibold">Vincular ao(s) entregável(is) *</legend>
        {entregaveisConsulta.carregando || etapasConsulta.carregando ? <p role="status" className="text-sm">Carregando entregáveis...</p> :
          elegiveis.length === 0 ? <p role="alert" className="text-sm text-foreground/70">Nenhum entregável aberto e autorizado para o registro.</p> :
          <div className="max-h-44 space-y-1 overflow-y-auto">{elegiveis.map(ent => <label key={ent.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-brand-green/10">
            <input type="checkbox" className="mt-1 accent-brand-green" checked={form.entregavelIds.includes(ent.id)}
              onChange={() => campo('entregavelIds', form.entregavelIds.includes(ent.id) ? form.entregavelIds.filter(id => id !== ent.id) : [...form.entregavelIds, ent.id])} />
            <span className="min-w-0 break-words">{ent.nome}</span></label>)}</div>}
        {erros.entregavelIds && <p className="text-xs text-error-text">{erros.entregavelIds}</p>}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-brand-green/20 pt-4">
        <button data-pi-acao="secundaria" type="button" onClick={onFechar} disabled={salvando} className="rounded-lg border border-brand-green/30 px-4 py-2 text-sm">Cancelar</button>
        <button data-pi-acao="primaria" type="submit" aria-busy={salvando} disabled={salvando || !elegiveis.length || origemNaoElegivel}
          className="min-h-10 min-w-36 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green">
          Registrar atividade</button>
      </div>
    </form>
  </ModalEtapa>, document.body);
}
