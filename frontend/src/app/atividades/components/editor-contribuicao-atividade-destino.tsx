'use client';
import {ModalContribuicaoDestino} from '@/app/contratos/components/modal-contribuicao-destino';
import {CampoContribuicaoDisponivel} from '@/app/contratos/components/campo-contribuicao-disponivel';
import type {Entregavel} from '@/lib/entregaveis';
import type {Ocorrencia} from '@/hooks/use-ocorrencias';
import type {MedicaoDireta} from './medicoes-diretas';
import type {MedicaoAtividade} from './seletor-ocorrencia';
export type ParcelaAtividade={entregavelId:string;ocorrenciaId?:string;percentual:string};
export type AlvoContribuicaoAtividade={entregavelId:string;ocorrenciaId?:string};
export function temOcorrenciaVinculada(id:string,ocorrencias:Ocorrencia[],ids:string[]){return ocorrencias.some(o=>o.entregavelId===id&&!o.substituidaEm&&ids.includes(o.id));}
export function resumoDireto(id:string,unidade:string|null|undefined,diretas:MedicaoDireta[],parcelas:ParcelaAtividade[]){return [...diretas.filter(d=>d.entregavelId===id).map(d=>`${d.quantidade} ${unidade??'unidades'}`),...parcelas.filter(p=>p.entregavelId===id&&!p.ocorrenciaId).map(p=>`${p.percentual}%`)].join(' · ');}
export function resumoOcorrencia(id:string,unidade:string|null|undefined,medicoes:MedicaoAtividade[],parcelas:ParcelaAtividade[]){return [...medicoes.filter(m=>m.ocorrenciaId===id&&Number(m.quantidade)>0).map(m=>`${m.quantidade} ${unidade??'unidades'}`),...parcelas.filter(p=>p.ocorrenciaId===id).map(p=>`${p.percentual}%`)].join(' · ');}
export function modoContribuicaoAtividade(item:Entregavel,ocorrencia:Ocorrencia|undefined,agenda:Ocorrencia[],agendaPronta:boolean,podePercentual:boolean,podeMedir:boolean):'quantidade'|'percentual'|undefined{
 if(ocorrencia){if(ocorrencia.substituidaEm||!['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(ocorrencia.status)||ocorrencia.entregavelId!==item.id)return;
  if(podeMedir&&ocorrencia.modoRegistro==='QUANTITATIVO'&&Number(ocorrencia.metaQuantidade)>0&&(['QUANTITATIVO','RECORRENTE'].includes(item.tipo)||item.tipo==='MARCO'&&!!ocorrencia.metaMarcoOrigemId))return 'quantidade';
  if(podePercentual&&ocorrencia.modoRegistro==='DESCRITIVO'&&['RECORRENTE','CONTINUO'].includes(item.tipo))return 'percentual';return;}
 if(!podePercentual)return;
 if(item.tipo==='UNICO')return 'percentual';
 if(!agendaPronta||agenda.some(o=>o.entregavelId===item.id&&!o.substituidaEm))return;

 if(item.tipo==='QUANTITATIVO'&&Number(item.quantidadePrevista)>0&&Number(item.quantidadeRealizada??0)===0)return 'quantidade';
}
export function EditorContribuicaoAtividadeDestino({item,ocorrencia,agenda,agendaPronta,podePercentual,podeMedir,diretas,medicoes,parcelas,onDiretas,onMedicoes,onParcelas,fechar,origemId}:{item:Entregavel;ocorrencia?:Ocorrencia;agenda:Ocorrencia[];agendaPronta:boolean;podePercentual:boolean;podeMedir:boolean;diretas:MedicaoDireta[];medicoes:MedicaoAtividade[];parcelas:ParcelaAtividade[];onDiretas:(v:MedicaoDireta[])=>void;onMedicoes:(v:MedicaoAtividade[])=>void;onParcelas:(v:ParcelaAtividade[])=>void;fechar:()=>void;origemId?:string}){
 const modo=modoContribuicaoAtividade(item,ocorrencia,agenda,agendaPronta,podePercentual,podeMedir);
 const parcela=parcelas.find(p=>p.entregavelId===item.id);
 const outro=modo==='percentual'&&parcela&&parcela.ocorrenciaId!==ocorrencia?.id;
 const valor=modo==='percentual'?(outro?'':parcela?.percentual??''):ocorrencia?medicoes.find(m=>m.ocorrenciaId===ocorrencia.id)?.quantidade??'':diretas.find(m=>m.entregavelId===item.id)?.quantidade??'';
 function mudar(v:string){const normal=v.replace(',','.');if(modo==='percentual'&&!outro)onParcelas([...parcelas.filter(p=>p.entregavelId!==item.id),...(v?[{entregavelId:item.id,ocorrenciaId:ocorrencia?.id,percentual:normal}]:[])]);else if(modo==='quantidade'){if(ocorrencia)onMedicoes([...medicoes.filter(m=>m.ocorrenciaId!==ocorrencia.id),...(v?[{ocorrenciaId:ocorrencia.id,quantidade:normal}]:[])]);else onDiretas([...diretas.filter(m=>m.entregavelId!==item.id),...(v?[{entregavelId:item.id,quantidade:normal}]:[])]);}}
 return <ModalContribuicaoDestino nome={ocorrencia?.titulo??item.nome} fechar={fechar}>{outro?<p role="status" className="text-xs text-foreground/70">Já existe uma contribuição percentual em outro vínculo deste entregável. Remova-a naquele destino antes de cadastrar outra.</p>:modo?<CampoContribuicaoDisponivel item={ocorrencia?.unidadeMedidaMarco?{...item,unidadeMedida:ocorrencia.unidadeMedidaMarco}:item} ocorrenciaId={ocorrencia?.id} meta={ocorrencia&&modo==='quantidade'?Number(ocorrencia.metaQuantidade):undefined} modo={modo} origem="ATIVIDADE" origemId={origemId} valor={valor} onValor={mudar}/>:<p className="text-xs text-foreground/65">Este vínculo não permite contribuição física adicional.</p>}<p className="text-xs text-foreground/65">A contribuição será contabilizada após aprovação.</p></ModalContribuicaoDestino>;
}
