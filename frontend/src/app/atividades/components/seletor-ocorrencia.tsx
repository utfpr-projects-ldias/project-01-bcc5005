'use client';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { useOcorrencias } from '@/hooks/use-ocorrencias';

export type MedicaoAtividade = { ocorrenciaId: string; quantidade: string };
type Props = {
  contratoId: string; entregavelIds: string[];
  valor?: string | null; onChange: (v: string | null) => void;
  valores?: string[]; onChangeMultiplas?: (ids: string[]) => void;
  medicoes?: MedicaoAtividade[]; onMedicoesChange?: (medicoes: MedicaoAtividade[]) => void;
  unidades?: Record<string,string>;
};
const campo='w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2 text-sm outline-none focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20';
function Campo({ contratoId, entregavelIds, valor, onChange, valores, onChangeMultiplas,
  medicoes = [], onMedicoesChange, unidades = {} }: Props) {
  const agenda=useOcorrencias(contratoId);
  const opcoes=agenda.ocorrencias.filter(o=>entregavelIds.includes(o.entregavelId) && !o.substituidaEm &&
    !['PENDENTE_CONCLUSAO','CONCLUIDO','PENDENTE_ENCERRAMENTO','ENCERRADA'].includes(o.status));
  if(onChangeMultiplas) {
    const escolhidas=valores??[];
    const disponiveis=opcoes.filter(o=>escolhidas.includes(o.id));
    const quantitativas=disponiveis.filter(o=>o.modoRegistro==='QUANTITATIVO' && o.metaQuantidade!=null);
    function mudarMedicao(ocorrenciaId:string,quantidade:string) {
      if(!onMedicoesChange)return;
      const antigas=medicoes.filter(m=>m.ocorrenciaId!==ocorrenciaId);
      onMedicoesChange(quantidade!==''?[...antigas,{ocorrenciaId,quantidade}]:antigas);
    }
    return <fieldset className="space-y-3 rounded-xl border border-current/20 p-3 sm:p-4">
      <legend className="px-1 text-sm font-semibold">Ocorrências e quantidades por execução</legend>
      <p className="text-xs leading-relaxed text-foreground/70">Selecione todas as ocorrências atendidas. Uma mesma atividade pode participar de várias, com <strong>quantidades diferentes para cada uma</strong>. Vincular sem informar quantidade registra somente a participação.</p>
      {agenda.erro&&<p role="alert" className="text-xs text-error-text">Não foi possível consultar as ocorrências.</p>}
      {!opcoes.length?<p className="text-sm text-foreground/65">Nenhuma ocorrência aberta para os entregáveis selecionados.</p>:
        <div className="max-h-44 space-y-1 overflow-y-auto" role="group" aria-label="Selecionar ocorrências">
          {opcoes.map(o=><label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-current/15 p-2.5 text-sm hover:bg-current/[0.06]">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-green" checked={escolhidas.includes(o.id)} onChange={e=>{
              const proximas=e.target.checked?[...escolhidas,o.id]:escolhidas.filter(id=>id!==o.id);
              onChangeMultiplas(proximas);
              if(!e.target.checked){onMedicoesChange?.(medicoes.filter(m=>m.ocorrenciaId!==o.id));if(valor===o.id)onChange(null);}
            }}/><span className="min-w-0 flex-1 break-words font-medium">{o.titulo}</span>
            <span className="shrink-0 text-xs text-foreground/55">{o.modoRegistro==='QUANTITATIVO'?'Por quantidade':'Descritiva'}</span>
          </label>)}
        </div>}
      {quantitativas.length>0&&<div className="space-y-3 border-t border-current/15 pt-3">
        <h4 className="text-sm font-semibold">Quanto foi realizado nesta atividade?</h4>
        <p className="text-xs text-foreground/65">Os valores informados só entram na meta após a aprovação desta atividade. Não repita aqui quantidades já lançadas manualmente.</p>
        {quantitativas.map(o=>{
          const quantidade=medicoes.find(m=>m.ocorrenciaId===o.id)?.quantidade??'';
          const meta=Number(o.metaQuantidade??0);const feito=Number(o.quantidadeExecutada??0);
          const unidade=unidades[o.entregavelId]||'unidades';
          return <div key={o.id} className="rounded-xl border border-current/20 bg-current/[0.025] p-3">
            <h5 className="break-words text-sm font-semibold">{o.titulo}</h5>
            <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
              <div><dt className="text-foreground/60">Meta</dt><dd className="font-semibold tabular-nums">{meta} {unidade}</dd></div>
              <div><dt className="text-foreground/60">Aprovado</dt><dd className="font-semibold tabular-nums">{feito} {unidade}</dd></div>
              <div><dt className="text-foreground/60">Restante</dt><dd className="font-semibold tabular-nums">{Math.max(0,meta-feito)} {unidade}</dd></div>
            </dl>
            <label className="mt-3 block text-xs font-semibold" htmlFor={`medicao-${o.id}`}>Realizado nesta atividade para esta ocorrência (opcional)</label>
            <div className="mt-1 flex items-center gap-2"><input id={`medicao-${o.id}`} type="number" inputMode="decimal" min="0" step="0.001" className={campo} placeholder="Ex.: 5" value={quantidade} onChange={e=>mudarMedicao(o.id,e.target.value)}/><span className="shrink-0 text-xs text-foreground/65">{unidade}</span></div>
          </div>;
        })}
      </div>}
      {disponiveis.filter(o=>o.modoRegistro!=='QUANTITATIVO'||o.metaQuantidade==null).length>0&&
        <p className="text-xs text-foreground/65">Vínculos descritivos: {disponiveis.filter(o=>o.modoRegistro!=='QUANTITATIVO'||o.metaQuantidade==null).map(o=>o.titulo).join(' · ')}. Não exigem valor numérico.</p>}
    </fieldset>;
  }
  const ausente=Boolean(valor&&!opcoes.some(o=>o.id===valor));
  return <label className="block text-sm font-medium">Ocorrência (opcional)
    <select aria-label="Ocorrência (opcional)" className={`mt-1 ${campo}`} value={valor??''} onChange={e=>onChange(e.target.value||null)} disabled={agenda.loading}>
      <option value="">Sem ocorrência</option>
      {ausente&&<option value={valor!}>Vínculo não disponível</option>}
      {opcoes.map(o=><option key={o.id} value={o.id}>{o.titulo}</option>)}
    </select><span className="text-xs text-foreground/65">Selecione somente ocorrências realmente atendidas.</span>
  </label>;
}
export function SeletorOcorrencia(props:Props) {
  const cache=useRepositorioConsultasOpcional();
  return cache?<Campo {...props}/>:null;
}
