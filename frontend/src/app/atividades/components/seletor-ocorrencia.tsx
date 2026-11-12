'use client';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { useOcorrencias } from '@/hooks/use-ocorrencias';

type Props = { contratoId: string; entregavelIds: string[];
  valor?: string | null; onChange: (v: string | null) => void;
  valores?: string[]; onChangeMultiplas?: (ids: string[]) => void;
};
function Campo({ contratoId, entregavelIds, valor, onChange, valores, onChangeMultiplas }: Props) {
  const agenda = useOcorrencias(contratoId);
  const opcoes = agenda.ocorrencias.filter(o => entregavelIds.includes(o.entregavelId) && !o.substituidaEm &&
    !['PENDENTE_CONCLUSAO','CONCLUIDO','PENDENTE_ENCERRAMENTO','ENCERRADA'].includes(o.status));
  if (onChangeMultiplas) {
    const escolhidas = valores ?? [];
    const quantitativas = opcoes.filter(o => escolhidas.includes(o.id) && o.modoRegistro === 'QUANTITATIVO');
    return <fieldset className="rounded-xl border border-brand-green/25 p-3">
      <legend className="px-1 text-sm font-semibold">Ocorrências vinculadas (opcional)</legend>
      <p className="mb-2 text-xs text-foreground/65">Marque somente as ocorrências das quais a atividade participou. Um entregável pode ter várias ocorrências, e nenhuma é selecionada automaticamente.</p>
      {agenda.erro && <p role="alert" className="text-xs text-error-text">Não foi possível consultar as ocorrências.</p>}
      {!opcoes.length ? <p className="text-xs text-foreground/60">Nenhuma ocorrência disponível para os entregáveis selecionados.</p>
      : <div className="max-h-48 space-y-2 overflow-y-auto">{opcoes.map(o => <label key={o.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-brand-green/20 px-3 py-2 text-sm hover:bg-brand-green/10">
        <input type="checkbox" className="h-4 w-4 accent-brand-green" checked={escolhidas.includes(o.id)}
          onChange={evento => {
            const novas = evento.target.checked ? [...escolhidas, o.id] : escolhidas.filter(id => id !== o.id);
            onChangeMultiplas(novas);
            if (!novas.includes(valor ?? '')) onChange(null);
          }}/><span className="min-w-0 break-words">{o.titulo}</span>
        <span className="ml-auto text-xs text-foreground/55">{o.modoRegistro === 'QUANTITATIVO' ? 'Quantitativa' : 'Descritiva'}</span>
      </label>)}</div>}
      {quantitativas.length > 0 && <label className="mt-3 block text-sm font-medium">Ocorrência de medição de quantidade
        <select className="mt-1 w-full rounded-lg border border-brand-green/35 bg-background px-3 py-2"
          value={valor ?? ''} onChange={evento => onChange(evento.target.value || null)}>
          <option value="">Não lançar quantidade</option>
          {quantitativas.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
        </select>
        <span className="mt-1 block text-xs text-foreground/60">A quantidade será contabilizada somente na ocorrência escolhida, evitando duplicidade.</span>
      </label>}
    </fieldset>;
  }
  const ausente = Boolean(valor && !opcoes.some(o => o.id === valor));
  return <label className="block text-sm font-medium">Ocorrência (opcional)
    <select aria-label="Ocorrência (opcional)" className="mt-1 w-full rounded-lg border border-brand-green/30 bg-background px-3 py-2" value={valor ?? ''} onChange={e => onChange(e.target.value || null)} disabled={agenda.loading}>
      <option value="">Sem ocorrência</option>
      {ausente && <option value={valor!}>Vínculo incompatível com a seleção atual</option>}
      {opcoes.map(o => <option key={o.id} value={o.id}>{o.titulo}</option>)}
    </select><span className="text-xs text-foreground/65">Selecione apenas a ocorrência realmente executada.</span>
  </label>;
}
export function SeletorOcorrencia(props: Props) {
  const cache = useRepositorioConsultasOpcional();
  return cache ? <Campo {...props}/> : null;
}
