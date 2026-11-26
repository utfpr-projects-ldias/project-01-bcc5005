'use client';
import {CampoContribuicaoDisponivel} from '@/app/contratos/components/campo-contribuicao-disponivel';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { SeletorVinculosMultiplos } from './seletor-vinculos-multiplos';
import { useOcorrencias } from '@/hooks/use-ocorrencias';

export type MedicaoAtividade = { ocorrenciaId: string; quantidade: string };
type Props = {
  contratoId: string; entregavelIds: string[];
  valor?: string | null; onChange: (v: string | null) => void;
  valores?: string[]; onChangeMultiplas?: (ids: string[]) => void;
  medicoes?: MedicaoAtividade[]; onMedicoesChange?: (medicoes: MedicaoAtividade[]) => void;
  unidades?: Record<string,string>; somenteVinculos?: boolean; somenteMedicoes?: boolean; origemId?:string; onConfigurar?: (id:string)=>void; configuravel?: (id:string)=>boolean; resumoContribuicao?: (id:string)=>string;
};
const campo='w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2 text-sm outline-none focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20';
function Campo({ contratoId, entregavelIds, valor, onChange, valores, onChangeMultiplas,
  medicoes = [], onMedicoesChange, unidades = {}, somenteVinculos=false, somenteMedicoes=false, origemId, onConfigurar, configuravel, resumoContribuicao }: Props) {
  const agenda=useOcorrencias(contratoId);
  const opcoes=agenda.ocorrencias.filter(o=>entregavelIds.includes(o.entregavelId) && !o.substituidaEm &&
    !['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','CONCLUIDO','CONCLUIDO_PARCIALMENTE','PENDENTE_ENCERRAMENTO','ENCERRADA'].includes(o.status));
  if(onChangeMultiplas) {
    const escolhidas=valores??[];
    const disponiveis=opcoes.filter(o=>escolhidas.includes(o.id));
    const quantitativas=disponiveis.filter(o=>o.modoRegistro==='QUANTITATIVO' && o.metaQuantidade!=null);
    function mudarMedicao(ocorrenciaId:string,quantidade:string) {
      if(!onMedicoesChange)return;
      const antigas=medicoes.filter(m=>m.ocorrenciaId!==ocorrenciaId);
      onMedicoesChange(quantidade!==''?[...antigas,{ocorrenciaId,quantidade}]:antigas);
    }
    if(somenteMedicoes&&!quantitativas.length)return null;
    return <div className="space-y-3">
      {!somenteMedicoes&&<div className="space-y-2">
      {agenda.erro&&<p role="alert" className="text-xs text-error-text">Não foi possível consultar as ocorrências.</p>}
      {!opcoes.length?<p className="text-sm text-foreground/65">Nenhuma ocorrência disponível.</p>:
        <SeletorVinculosMultiplos rotulo="Selecionar ocorrências" placeholder="Localizar ocorrência…" itens={opcoes.map(o=>({id:o.id,nome:o.titulo,detalhe:o.modoRegistro==='QUANTITATIVO'?'Por quantidade':'Descritiva',configuravel:configuravel?.(o.id),contribuicao:resumoContribuicao?.(o.id)}))} onConfigurar={onConfigurar} valores={escolhidas} onChange={ids=>onChangeMultiplas(ids)}/>}</div>}

      {!somenteVinculos&&quantitativas.length>0&&<div className="space-y-3 border-t border-current/15 pt-3">
        {!somenteMedicoes&&<h4 className="text-sm font-semibold">Contribuição</h4>}

        {quantitativas.map(o=>{
          const quantidade=medicoes.find(m=>m.ocorrenciaId===o.id)?.quantidade??'';
          const meta=Number(o.metaQuantidade??0);const feito=Number(o.quantidadeExecutada??0);
          const unidade=unidades[o.entregavelId]||'unidades';
          return <div key={o.id} className="pi-medicao-atividade-linha">
            <h5 className="break-words text-sm font-semibold">{o.titulo}</h5>
            <dl className="pi-medicao-atividade-metricas text-xs">
              <div><dt className="text-foreground/60">Meta</dt><dd className="font-semibold tabular-nums">{meta} {unidade}</dd></div>
              <div><dt className="text-foreground/60">Aprovado</dt><dd className="font-semibold tabular-nums">{feito} {unidade}</dd></div>
              <div><dt className="text-foreground/60">Restante</dt><dd className="font-semibold tabular-nums">{Math.max(0,meta-feito)} {unidade}</dd></div>
            </dl>
            <CampoContribuicaoDisponivel item={{id:o.entregavelId,contratoId,tipo:'QUANTITATIVO',quantidadePrevista:null,quantidadeRealizada:null,unidadeMedida:unidade}} ocorrenciaId={o.id} meta={meta} modo="quantidade" origem="ATIVIDADE" origemId={origemId} valor={quantidade} onValor={v=>mudarMedicao(o.id,v.replace(',','.'))}/>
          </div>;
        })}
      </div>}
    </div>;
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
