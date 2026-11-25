import {CampoContribuicaoDisponivel} from '@/app/contratos/components/campo-contribuicao-disponivel';
import type { Entregavel } from '@/lib/entregaveis';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
export type MedicaoDireta={entregavelId:string;quantidade:string};
export function MedicoesDiretas({entregaveis,ocorrencias,selecionados,valores,onChange,origemId}:{entregaveis:Entregavel[];ocorrencias:Ocorrencia[];selecionados:string[];valores:MedicaoDireta[];onChange:(v:MedicaoDireta[])=>void;origemId?:string}){
 const opcoes=entregaveis.filter(e=>selecionados.includes(e.id)&&e.tipo==='QUANTITATIVO'&&Number(e.quantidadePrevista)>0&&Number(e.quantidadeRealizada??0)===0&&!ocorrencias.some(o=>o.entregavelId===e.id&&!o.substituidaEm));
 if(!opcoes.length)return null;
 return <div className="space-y-2">{opcoes.map(e=><div key={e.id} className="pi-medicao-direta-linha"><div className="min-w-0"><strong className="block truncate text-sm" title={e.nome}>{e.nome}</strong><span className="text-xs text-foreground/65">Execução direta · Meta: {e.quantidadePrevista} {e.unidadeMedida}</span></div><CampoContribuicaoDisponivel item={e} modo="quantidade" origem="ATIVIDADE" origemId={origemId} valor={valores.find(d=>d.entregavelId===e.id)?.quantidade??''} onValor={v=>onChange([...valores.filter(d=>d.entregavelId!==e.id),...(v?[{entregavelId:e.id,quantidade:v.replace(',','.') }]:[])])}/></div>)}</div>;
}
