'use client';
import { BotaoExcluirModal, BotaoEditarModal } from '@/app/components/botoes-modal';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';

import { PainelComprovacaoEvidencia } from '@/app/contratos/components/painel-comprovacao-evidencia';
import { CampoDataCivil } from '@/app/components/campo-data-civil';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { CampoBuscaSugestoes } from '@/app/components/campo-busca-sugestoes';
import { contadoresOcorrencia, comprovacaoOcorrencia } from '@/lib/resumo-agenda-contrato';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { alteracoesLegiveis, rotuloEventoOcorrencia } from './historico-legivel';
import { AnelProgresso } from './anel-progresso';
import { usePedidoExecucaoPendente } from '@/hooks/use-pedido-execucao-pendente';
import { quantidadeBRParaApi, quantidadeApiParaBR, milesimosApi, maxQuantidade, formatarMilesimos, percentualQuantidadeExata } from '@/lib/numero-quantidade-br';
import {
  ErroOperacaoOcorrencia, criarLancamentoOcorrencia, corrigirLancamentoOcorrencia, decidirLancamentoOcorrencia, bloquearLancamentoOcorrencia, excluirLancamentoOcorrencia, listarLancamentosOcorrencia,
  listarComprovantesOcorrencia, vincularComprovanteOcorrencia, desvincularComprovanteOcorrencia,
  listarHistoricoOcorrencia, type Ocorrencia, type LancamentoOcorrencia,
  type ComprovanteOcorrencia, type EventoHistoricoOcorrencia,
} from '@/hooks/use-ocorrencias';

const CAMPO='w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2 text-sm outline-none focus-visible:border-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/25';
const ACAO='rounded-lg border border-current/30 px-3 py-2 text-xs font-semibold hover:bg-current/[0.07] focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35';
const CONFIRMAR='rounded-lg border border-slate-500/40 bg-[#355d6b] px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-40';
const formatar=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
const aberta=(o:Ocorrencia)=>!o.substituidaEm && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status);
const naoNegativa=(v:string)=>quantidadeBRParaApi(v)!==null;
const positiva=(v:string)=>{const n=quantidadeBRParaApi(v);return n!==null && milesimosApi(n)>BigInt(0);};
const zero=BigInt(0);
const executada=(o:Ocorrencia)=>o.quantidadeExecutada ?? o.quantidadeExecutadaExata ?? "0";
const reservada=(o:Ocorrencia)=>milesimosApi(o.quantidadeRegistradaExata??o.quantidadeRegistrada??executada(o));

/** Indicador único de avanço físico, compartilhando a mesma superfície dos requisitos. */
export function ResumoExecucaoOcorrencia({ocorrencia, unidade}:{ocorrencia:Ocorrencia;unidade:string}) {
  const quantitativa=ocorrencia.modoRegistro==='QUANTITATIVO';
  const percentual=ocorrencia.progressoPercentual ?? (quantitativa && ocorrencia.metaQuantidade!=null ? percentualQuantidadeExata(milesimosApi(executada(ocorrencia)),milesimosApi(ocorrencia.metaQuantidade)) : null);
  return <div className="flex min-w-0 items-center justify-start gap-4" aria-label="Resumo físico da ocorrência">
    <div className="min-w-0">
      <p className="text-xs text-foreground/65">{ocorrencia.modoRegistro==='QUANTITATIVO'?`Executado (${unidade})`:'Executado'}</p>
      <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{quantitativa?`${quantidadeApiParaBR(executada(ocorrencia))}${ocorrencia.metaQuantidade!=null?` / ${quantidadeApiParaBR(ocorrencia.metaQuantidade)}`:''}`:percentual==null?'—':`${formatar(percentual)}%`}</p>
    </div>
    <AnelProgresso atual={percentual??0} total={percentual==null?0:100} rotulo="Avanço físico" tamanho={64}/>
  </div>;
}

export function ResumoLateralOcorrencia({ocorrencia,unidade,entregavel,periodo}:{ocorrencia:Ocorrencia;unidade:string;entregavel:string;periodo?:string|null}) {
  const c=contadoresOcorrencia(ocorrencia), prova=comprovacaoOcorrencia(ocorrencia);
  const metricas=[{nome:'Atividades',...c.atividades},{nome:'Evidências',...c.evidencias}];
  return <aside className="pi-ocorrencia-resumo" aria-label="Resumo da ocorrência">
    <h3>Planejamento da ocorrência</h3>
    <div className="pi-ocorrencia-meta-info"><span>Entregável</span><strong className="pi-ocorrencia-nome-completo" title={entregavel}>{entregavel}</strong>{periodo&&<><span>Período</span><strong>{periodo}</strong></>}<span>Realizado em</span><strong>{ocorrencia.dataRealizada?ocorrencia.dataRealizada.slice(0,10).split('-').reverse().join('/'):'Não informado'}</strong></div>
    <div className="pi-ocorrencia-indicadores">{metricas.map(m=><div key={m.nome}><span>{m.nome}</span>{m.total>0&&m.feitas!==undefined?<AnelProgresso atual={m.feitas} total={m.total} rotulo={m.nome} tamanho={64}/>:<strong className="pi-ocorrencia-sem-dados">—</strong>}</div>)}</div>
    <div className="pi-ocorrencia-resumo-divisor pi-ocorrencia-metricas-finais"><div><h3>Execução física</h3><strong className="pi-ocorrencia-valor">{ocorrencia.modoRegistro==='QUANTITATIVO'?`${quantidadeApiParaBR(executada(ocorrencia))}${ocorrencia.metaQuantidade!=null?` / ${quantidadeApiParaBR(ocorrencia.metaQuantidade)}`:''}`:ocorrencia.progressoPercentual==null?'—':`${formatar(ocorrencia.progressoPercentual)}%`}</strong><span className="text-xs text-foreground/65">{ocorrencia.modoRegistro==='QUANTITATIVO'?unidade:'Avanço'}</span>{ocorrencia.modoRegistro==='QUANTITATIVO'&&<span className="text-xs text-foreground/65">{ocorrencia.progressoPercentual??0}% de avanço</span>}</div><div><h3>Comprovação</h3><strong className={`pi-ocorrencia-valor ${prova.cor}`}>{prova.texto}</strong></div></div>
    {ocorrencia.observacoes&&<div className="pi-ocorrencia-resumo-divisor"><h3>Observações</h3><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-xs text-foreground/70">{ocorrencia.observacoes}</p></div>}
  </aside>;
}

/** Detalhamento da execução física: lançamento manual é independente da medição aprovada por atividade. */
export function ExecucaoOcorrencia({ contratoId, ocorrencia, unidade, podeRegistrar, podeCorrigir, podeCorrigirAprovada=false, podeBloquear, podeExcluir, podeAprovar=false, usuarioId, onAtualizar }: {
  contratoId:string; ocorrencia:Ocorrencia; unidade:string; podeRegistrar:boolean; podeCorrigir:boolean; podeCorrigirAprovada?:boolean; podeBloquear:boolean; podeExcluir:boolean; podeAprovar?:boolean; usuarioId?:string; onAtualizar:()=>Promise<unknown>;
}) {
  const [lancamentos,setLancamentos]=useState<LancamentoOcorrencia[]>([]);
  const [carregando,setCarregando]=useState(false);const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState(''); const [quantidade,setQuantidade]=useState('');
  const [justificativa,setJustificativa]=useState('');
  const dataCivil=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const [dataRegistro,setDataRegistro]=useState(dataCivil);
  const [corrigindo,setCorrigindo]=useState<string|null>(null);
  const [quantidadeCorrecao,setQuantidadeCorrecao]=useState('');
  const [motivoCorrecao,setMotivoCorrecao]=useState('');
  const [dataCorrecao,setDataCorrecao]=useState(''),[obsCorrecao,setObsCorrecao]=useState('');
  const [rejeitando,setRejeitando]=useState<string|null>(null),[motivoRejeicao,setMotivoRejeicao]=useState('');
  const [excluindo,setExcluindo]=useState<string|null>(null);
  const [motivoExclusao,setMotivoExclusao]=useState('');
  const [desbloqueando,setDesbloqueando]=useState<string|null>(null);
  // Em retry de rede, reutilizar a MESMA chave idempotente.
  const {pedido:pedidoPendente,definir:setPedidoPendente,pronto:pedidoPronto}=usePedidoExecucaoPendente(usuarioId?`${usuarioId}:${contratoId}:ocorrencia:${ocorrencia.id}`:null);
  const trava=useRef(false);
  const versaoCorrecao=useRef<string|undefined>(undefined), versaoRejeicao=useRef<string|undefined>(undefined);
  async function atualizarLancamentos(){
    const consultas=await Promise.allSettled([listarLancamentosOcorrencia(contratoId,ocorrencia.id),Promise.resolve().then(onAtualizar)]);
    if(consultas[0].status==='fulfilled')setLancamentos(consultas[0].value);
    if(consultas.some(r=>r.status==='rejected'))setErro('Alteração salva, mas não foi possível atualizar todos os indicadores. Atualize a ocorrência.');
  }
  async function decidir(id:string,decisao:'APROVADO'|'REJEITADO'){
    if(ocupado)return;setOcupado(true);setErro('');
    try{await decidirLancamentoOcorrencia(contratoId,ocorrencia.id,id,decisao,decisao==='REJEITADO'?motivoRejeicao:undefined,decisao==='REJEITADO'?versaoRejeicao.current:lancamentos.find(l=>l.id===id)?.versao);setRejeitando(null);await atualizarLancamentos();}catch(e){setErro(e instanceof Error?e.message:'Não foi possível decidir o lançamento.');}finally{setOcupado(false);}
  }
  useEffect(()=>{
    if(ocorrencia.modoRegistro!=='QUANTITATIVO'||ocorrencia.metaQuantidade==null)return;
    let ativo=true;queueMicrotask(()=>{if(ativo){setCarregando(true);setErro('');}});
    void listarLancamentosOcorrencia(contratoId,ocorrencia.id).then(itens=>{if(ativo)setLancamentos(itens);})
      .catch(f=>{if(ativo)setErro(f instanceof Error?f.message:'Não foi possível consultar lançamentos.');})
      .finally(()=>{if(ativo)setCarregando(false);});
    return ()=>{ativo=false;};
  },[contratoId,ocorrencia.id,ocorrencia.modoRegistro,ocorrencia.metaQuantidade]);
  const quantitativa=ocorrencia.modoRegistro==='QUANTITATIVO' && ocorrencia.metaQuantidade!=null;
  const totalReservado=reservada(ocorrencia);
  const meta=milesimosApi(ocorrencia.metaQuantidade);
  const saldoQuantidade=quantitativa?(ocorrencia.quantidadeDisponivelExata!=null?milesimosApi(ocorrencia.quantidadeDisponivelExata):maxQuantidade(zero,meta-totalReservado)):zero;
  const digitada=milesimosApi(quantidadeBRParaApi(quantidade));
  const itemCorrecao=lancamentos.find(item=>item.id===corrigindo);
  const reservaAnterior=itemCorrecao&&itemCorrecao.situacao!=='REJEITADO'?milesimosApi(itemCorrecao.quantidade):zero;
  const saldoCorrecao=maxQuantidade(zero,maxQuantidade(meta,totalReservado)-totalReservado+reservaAnterior);
  const correcaoPermitida=(valor:bigint)=>valor<=saldoCorrecao&&(totalReservado<=meta||valor<reservaAnterior);
  const correcaoDigitada=milesimosApi(quantidadeBRParaApi(quantidadeCorrecao));
  async function registrar(e:FormEvent){
    e.preventDefault();if(ocupado||trava.current||!pedidoPronto)return;
    let pedido=pedidoPendente;
    if(!pedido){
      if(!aberta(ocorrencia)||!podeRegistrar)return;
      const quantidadeApi=quantidadeBRParaApi(quantidade);
      if(quantidadeApi===null || milesimosApi(quantidadeApi)<=zero){setErro('Informe uma quantidade positiva. Use vírgula para decimais e ponto para milhar.');return;}
      if(milesimosApi(quantidadeApi)>saldoQuantidade){setErro('A quantidade excede o saldo disponível.');return;}
      if(!dataRegistro||dataRegistro>dataCivil()){setErro('Informe uma data de execução não futura.');return;}
      pedido={id:crypto.randomUUID(),valor:quantidadeApi,data:dataRegistro,observacao:justificativa.trim(),ocorrenciaId:ocorrencia.id,endpoint:'OCORRENCIA'};
      setPedidoPendente(pedido);
    }
    trava.current=true;setOcupado(true);setErro('');
    try {
      const r=await criarLancamentoOcorrencia(contratoId,ocorrencia.id,pedido.id,pedido.valor,'',{data:pedido.data,observacao:pedido.observacao});
      setPedidoPendente(null);setQuantidade('');setJustificativa('');
      await atualizarLancamentos();
      if(r.excluido)setErro('O pedido original foi registrado e posteriormente excluído. Nenhuma quantidade foi adicionada novamente.');
    } catch(f){
      // Resposta perdida, erro 5xx ou sessão expirada não provam que a gravação falhou.
      if(f instanceof ErroOperacaoOcorrencia && [400,409,422].includes(f.status))setPedidoPendente(null);
      setErro(f instanceof Error?f.message:'Falha no lançamento.');
    } finally{trava.current=false;setOcupado(false);}
  }
  async function corrigir(e:FormEvent){
    e.preventDefault();const quantidadeApi=quantidadeBRParaApi(quantidadeCorrecao);
    if(ocupado||!corrigindo||quantidadeApi===null||motivoCorrecao.trim().length<15)return;
    if(!correcaoPermitida(milesimosApi(quantidadeApi))||!dataCorrecao||dataCorrecao>dataCivil()){setErro('Confira a quantidade disponível e a data da execução.');return;}
    setOcupado(true);setErro('');
    try{await corrigirLancamentoOcorrencia(contratoId,ocorrencia.id,corrigindo,quantidadeApi,motivoCorrecao.trim(),{data:dataCorrecao,observacao:obsCorrecao,versaoEsperada:versaoCorrecao.current});
      setCorrigindo(null);setMotivoCorrecao('');await atualizarLancamentos();}
    catch(f){setErro(f instanceof Error?f.message:'Não foi possível corrigir o lançamento.');}
    finally{setOcupado(false);}
  }
  async function alterarBloqueio(id:string,bloqueado:boolean){
    if(ocupado)return;setOcupado(true);setErro('');
    try{
      await bloquearLancamentoOcorrencia(contratoId,ocorrencia.id,id,bloqueado);setDesbloqueando(null);
      await atualizarLancamentos();
    }catch(f){setDesbloqueando(null);setErro(f instanceof Error?f.message:'Falha ao alterar bloqueio do lançamento.');}
    finally{setOcupado(false);}
  }
  async function excluir(e:FormEvent){
    e.preventDefault();if(ocupado||!excluindo||motivoExclusao.trim().length<15||motivoExclusao.trim().length>200)return;
    setOcupado(true);setErro('');
    try{
      await excluirLancamentoOcorrencia(contratoId,ocorrencia.id,excluindo,motivoExclusao.trim());
      setExcluindo(null);setMotivoExclusao('');
      await atualizarLancamentos();
    }catch(f){setErro(f instanceof Error?f.message:'Falha ao excluir lançamento.');}
    finally{setOcupado(false);}
  }
  if(!quantitativa&&!pedidoPendente)return <p className="rounded-lg border border-current/20 p-3 text-sm text-foreground/70">Esta ocorrência registra atividades e descrições sem meta numérica.</p>;
  return <section className="space-y-4" aria-label="Progresso quantitativo da ocorrência">
    <div className="pi-lancamentos-ocorrencia min-w-0">
      {aberta(ocorrencia) && podeRegistrar && <><h4 className="text-sm font-semibold">Registrar execução diretamente</h4>
      <p className="mt-1 text-xs text-foreground/65">Informe o que realizou agora. Corrigir um lançamento anterior substitui somente aquele valor.</p></>}
      {(pedidoPendente||pedidoPronto&&aberta(ocorrencia)&&podeRegistrar&&saldoQuantidade>zero)?<form onSubmit={registrar} className="pi-linha-registro pi-ocorrencia-registro-manual mt-3">
        <label className="text-xs font-semibold">Data da execução<CampoDataCivil className={CAMPO} value={pedidoPendente?.data??dataRegistro} max={dataCivil()} disabled={ocupado||Boolean(pedidoPendente)} required onChange={e=>{setDataRegistro(e.target.value);}}/></label>
        <label className="text-xs font-semibold">Quantidade realizada agora
          <input className={`mt-1 ${CAMPO}`} type="text" inputMode="decimal" maxLength={24} placeholder="Ex.: 19 ou 1.000,5" value={pedidoPendente?quantidadeApiParaBR(pedidoPendente.valor):quantidade}
            disabled={ocupado||Boolean(pedidoPendente)} onChange={e=>{const n=quantidadeBRParaApi(e.target.value);if(n!==null&&milesimosApi(n)>saldoQuantidade)return;setQuantidade(e.target.value);}} required /><span className="block text-xs font-normal text-foreground/65" aria-live="polite">Disponível: {formatarMilesimos(saldoQuantidade-digitada)} {unidade}</span></label>
        <label className="pi-registro-obs text-xs font-semibold">Observação do lançamento (opcional)
          <input className={`mt-1 ${CAMPO}`} maxLength={300} placeholder="Ex.: lote 2" value={pedidoPendente?.observacao??justificativa} disabled={ocupado||Boolean(pedidoPendente)}
            onChange={e=>{setJustificativa(e.target.value);}} /><span className="block text-right text-[11px] font-normal text-foreground/60">{justificativa.length}/300</span></label>
        <button type="submit" className={`${CONFIRMAR} min-h-9`} disabled={ocupado||(!pedidoPendente&&(!positiva(quantidade)||digitada>saldoQuantidade||!dataRegistro||dataRegistro>dataCivil()))}>{ocupado?'Registrando…':pedidoPendente?'Confirmar reenvio':'Registrar'}</button>
      </form>:null}
      {pedidoPendente&&<p role="status" className="text-xs">Resultado ainda não confirmado. Reenvie o mesmo pedido, sem criar outra quantidade.</p>}
      {aberta(ocorrencia)&&podeRegistrar&&saldoQuantidade===zero&&!pedidoPendente&&<p className="text-xs text-foreground/65">Não há saldo físico disponível para novos lançamentos.</p>}
      {erro&&<p role="alert" className="mt-3 rounded-lg border border-red-500/40 p-2 text-xs text-error-text">{erro}</p>}
      <div className="mt-4 space-y-2">
        <h5 className="text-xs font-semibold">Registros manuais</h5>
        {carregando&&lancamentos.length===0?<p role="status" className="text-xs text-foreground/65">Consultando lançamentos…</p>:
          lancamentos.length===0?(erro?null:<p className="text-xs text-foreground/60">Nenhum lançamento manual registrado.</p>):
          <ul className="space-y-2">{lancamentos.map(item=><li key={item.id} className="pi-lancamento-card-v18 rounded-lg border border-current/15 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
              <strong className="tabular-nums">{quantidadeApiParaBR(item.quantidade)} {unidade}</strong>
              <p className="text-xs text-foreground/60">{item.dataExecucao?`Realizado em ${item.dataExecucao.slice(0,10).split('-').reverse().join('/')}`:`Registrado em ${new Date(item.criadoEm).toLocaleString('pt-BR')}`}{item.alteradoEm?' · corrigido posteriormente':''}</p>
              <p className="text-xs text-foreground/65">{item.situacao==='PENDENTE'?'Pendente de aprovação':item.situacao==='REJEITADO'?'Em revisão':'Aprovado'}</p>{item.observacao&&<p className="text-xs break-words">{item.observacao}</p>}{item.justificativa&&<p className="mt-1 break-words text-xs text-foreground/70">{item.justificativa}</p>}
            </div>
            <div className="pi-lancamento-acoes-v18">
              {aberta(ocorrencia)&&podeAprovar&&['PENDENTE','REJEITADO'].includes(item.situacao??'APROVADO')&&!item.bloqueadoEm&&<><button type="button" className={`${ACAO} text-green-400 border-green-500/40`} disabled={ocupado} onClick={()=>void decidir(item.id,'APROVADO')}>Aprovar</button>{item.situacao==='PENDENTE'&&<button type="button" className={`${ACAO} text-error-text border-red-500/40`} disabled={ocupado} onClick={()=>{versaoRejeicao.current=item.versao;setRejeitando(item.id);setMotivoRejeicao('');}}>Rejeitar</button>}</>}

              {(item.bloqueadoEm||aberta(ocorrencia)&&podeBloquear)&&<button type="button" aria-label={item.bloqueadoEm?'Desbloquear lançamento':'Bloquear lançamento'}
                title={item.bloqueadoEm?'Desbloquear lançamento':'Bloquear lançamento'} className={`${ACAO} ${item.bloqueadoEm?'pi-lancamento-topo-v18':'pi-lancamento-bloquear-v18'}`} disabled={ocupado||!aberta(ocorrencia)||!podeBloquear}
                onClick={()=>item.bloqueadoEm?setDesbloqueando(item.id):void alterarBloqueio(item.id,true)}>
                <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="5" y="10" width="14" height="11" rx="2"/>
                  {item.bloqueadoEm?<path d="M8 10V7a4 4 0 0 1 8 0v3"/>:<path d="M8 10V7a4 4 0 0 1 7.5-2"/>}
                </svg>
              </button>}
              {aberta(ocorrencia)&&podeCorrigir&&(['PENDENTE','REJEITADO'].includes(item.situacao??'APROVADO')||podeCorrigirAprovada)&&!item.bloqueadoEm&&<BotaoEditarModal rotulo="Editar lançamento" className="pi-editar-registro pi-lancamento-topo-v18" onClick={()=>{versaoCorrecao.current=item.versao;setCorrigindo(item.id);setQuantidadeCorrecao(quantidadeApiParaBR(item.quantidade));setMotivoCorrecao('');setDataCorrecao(item.dataExecucao??item.criadoEm.slice(0,10));setObsCorrecao(item.observacao??'');}}/>}
              {aberta(ocorrencia)&&podeExcluir&&!item.bloqueadoEm&&<BotaoExcluirModal rotulo="Excluir lançamento" disabled={ocupado} className="pi-lancamento-excluir-v18" onClick={()=>{setCorrigindo(null);setExcluindo(item.id);setMotivoExclusao('');}}/>}
            </div></div>
            {rejeitando===item.id&&<form onSubmit={ev=>{ev.preventDefault();void decidir(item.id,'REJEITADO');}} className="mt-2 space-y-2"><label className="block text-xs">Justificativa<input className={CAMPO} value={motivoRejeicao} maxLength={300} required onChange={ev=>setMotivoRejeicao(ev.target.value)}/></label><button type="button" className={ACAO} onClick={()=>setRejeitando(null)}>Cancelar</button> <button type="submit" className={ACAO} disabled={ocupado||!motivoRejeicao.trim()}>Confirmar rejeição</button></form>}
            {excluindo===item.id&&<form onSubmit={excluir} className="mt-3 rounded-lg border border-red-700/60 p-3">
              <p className="text-xs font-semibold">Excluir este lançamento? A quantidade deixará de contar, mas o histórico permanecerá.</p>
              <label className="mt-2 block text-xs">Justificativa (15–200 caracteres)
                <input className={`mt-1 ${CAMPO}`} maxLength={200} minLength={15} value={motivoExclusao} onChange={e=>setMotivoExclusao(e.target.value)} required />
              </label>
              <div className="mt-2 flex justify-end gap-2">
                <button className={ACAO} type="button" onClick={()=>setExcluindo(null)}>Cancelar</button>
                <button className="rounded-lg bg-red-700 px-3 py-2 text-xs font-semibold text-white hover:bg-red-800 disabled:opacity-40" type="submit" disabled={ocupado||motivoExclusao.trim().length<15||motivoExclusao.trim().length>200}>Excluir lançamento</button>
              </div>
            </form>}
            {corrigindo===item.id&&!item.bloqueadoEm&&createPortal(<ModalEtapa titulo="Editar execução manual" contexto={ocorrencia.titulo} camada="edicao" larguraFormulario="registro" ocupado={ocupado} onFechar={()=>setCorrigindo(null)}><form onSubmit={corrigir} className="pi-edicao-registro-modal">
              <label className="text-xs font-semibold">Quantidade ({unidade})<input className={`mt-1 ${CAMPO}`} type="text" inputMode="decimal" maxLength={24} value={quantidadeCorrecao} onChange={e=>{const n=quantidadeBRParaApi(e.target.value);if(n===null||correcaoPermitida(milesimosApi(n)))setQuantidadeCorrecao(e.target.value);}}/><span className="block font-normal text-foreground/65" aria-live="polite">Disponível: {formatarMilesimos(saldoCorrecao-correcaoDigitada)} {unidade}</span></label>
              <label className="text-xs font-semibold">Data da execução<CampoDataCivil className={CAMPO} value={dataCorrecao} max={dataCivil()} onChange={e=>setDataCorrecao(e.target.value)} required/></label><label className="pi-edicao-registro-largo text-xs font-semibold">Observação ({obsCorrecao.length}/300 caracteres)<textarea className={CAMPO} maxLength={300} value={obsCorrecao} onChange={e=>setObsCorrecao(e.target.value)}/></label><label className="pi-edicao-registro-largo text-xs font-semibold">Justificativa (15–200 caracteres · {motivoCorrecao.length}/200)<input className={`mt-1 ${CAMPO}`} minLength={15} maxLength={200} value={motivoCorrecao} onChange={e=>setMotivoCorrecao(e.target.value)} /></label>
              <div className="flex gap-2 sm:col-span-2"><button className={ACAO} type="button" onClick={()=>setCorrigindo(null)}>Cancelar</button><button className={CONFIRMAR} type="submit" disabled={ocupado||!naoNegativa(quantidadeCorrecao)||motivoCorrecao.trim().length<15||!dataCorrecao||dataCorrecao>dataCivil()||!correcaoPermitida(correcaoDigitada)}>Salvar correção</button></div>{erro&&<p role="alert" className="text-error-text">{erro}</p>}
            </form></ModalEtapa>,document.body)}
          </li>)}</ul>}
      </div>
      {desbloqueando&&<ConfirmacaoSimples titulo="Desbloquear lançamento?" descricao="O registro voltará a permitir correções e exclusão por usuários autorizados. O valor aprovado não será alterado pelo desbloqueio." confirmar="Desbloquear" neutro ocupado={ocupado} onCancelar={()=>setDesbloqueando(null)} onConfirmar={()=>void alterarBloqueio(desbloqueando,false)}/>}
    </div>
  </section>;
}

export function EvidenciasOcorrencia({ contratoId, ocorrencia, podeVincular, onAtualizar, ativa=true }: {
  contratoId:string;ocorrencia:Ocorrencia;podeVincular:boolean;onAtualizar:()=>Promise<unknown>;ativa?:boolean;
}) {
  const [vinculadas,setVinculadas]=useState<ComprovanteOcorrencia[]>([]);
  const [disponiveis,setDisponiveis]=useState<ComprovanteOcorrencia[]>([]);
  const [carregando,setCarregando]=useState(true);const [ocupado,setOcupado]=useState(false);const [erro,setErro]=useState('');
  const [abrirVinculo,setAbrirVinculo]=useState(false);
  const [detalheEvidencia,setDetalheEvidencia]=useState<ComprovanteOcorrencia|null>(null);
  const [busca,setBusca]=useState('');
  const opcoes=disponiveis.map(c=>({id:c.id,rotulo:`${c.nomeOriginal.slice(0,72)} · ${c.id.slice(0,8)} · ${c.status==='VERIFICADA'?'Verificada':'Pendente de verificação'}`}));
  const selecionada=opcoes.find(c=>c.rotulo===busca);
  useEffect(()=>{if(!ativa)return;let ativo=true;queueMicrotask(()=>{if(ativo){setCarregando(true);setErro('');}});void listarComprovantesOcorrencia(contratoId,ocorrencia.id)
    .then(r=>{if(ativo){setVinculadas(r.vinculadas);setDisponiveis(r.disponiveis);}})
    .catch(e=>{if(ativo)setErro(e instanceof Error?e.message:'Falha ao consultar comprovantes.');})
    .finally(()=>{if(ativo)setCarregando(false);});return ()=>{ativo=false;};},[contratoId,ocorrencia.id,ativa,ocorrencia.evidenciasFoto,ocorrencia.evidenciasRelatorio,ocorrencia.evidenciasOutras]);
  async function executar(comprovanteId:string,remover:boolean){setOcupado(true);setErro('');try{
    if(remover)await desvincularComprovanteOcorrencia(contratoId,ocorrencia.id,comprovanteId);
    else await vincularComprovanteOcorrencia(contratoId,ocorrencia.id,comprovanteId);
    setAbrirVinculo(false);setBusca('');
    const consultas=await Promise.allSettled([listarComprovantesOcorrencia(contratoId,ocorrencia.id),Promise.resolve().then(onAtualizar)]);
    if(consultas[0].status==='fulfilled'){setVinculadas(consultas[0].value.vinculadas);setDisponiveis(consultas[0].value.disponiveis);}
    if(consultas.some(r=>r.status==='rejected'))setErro('Vínculo alterado, mas não foi possível atualizar todos os dados.');
  }catch(e){setErro(e instanceof Error?e.message:'Falha ao alterar vínculo.');}finally{setOcupado(false);}}
  return <section className="space-y-3" aria-label="Evidências da ocorrência">
    {carregando&&vinculadas.length===0?<p role="status" className="text-xs">Consultando evidências…</p>:<>

      {!vinculadas.length?<p className="text-xs text-foreground/65">Nenhuma evidência vinculada.</p>:<ul className="pi-lista-vinculos-v18 space-y-2">{vinculadas.map(c=><li key={c.id} className="pi-card-vinculo-v18 flex min-w-0 items-center gap-3 rounded-lg border p-3 text-xs">
        <button type="button" disabled={!c.esperadaId} onClick={()=>setDetalheEvidencia(c)} className="flex min-w-0 flex-1 items-center gap-3 text-left"><span className="pi-diario-icone" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M6 3h8l4 4v14H6zM14 3v5h5M9 12h6M9 16h6"/></svg></span><span className="min-w-0 flex-1"><strong className="block truncate" title={c.nomeOriginal}>{c.nomeOriginal}</strong><span className="mt-1 block text-foreground/60">{c.tipoEvidencia}{c.criadoEm?` · ${new Date(c.criadoEm).toLocaleDateString('pt-BR')}`:''}</span></span></button><span className="pi-diario-etiqueta shrink-0" data-situacao={c.status}>{c.status==='VERIFICADA'?'Verificada':c.status==='REJEITADA'?'Em revisão':'Pendente de verificação'}</span>
        {aberta(ocorrencia)&&podeVincular&&<button className={ACAO} type="button" disabled={ocupado} onClick={()=>void executar(c.id,true)}>Desvincular</button>}
      </li>)}</ul>}
      {(aberta(ocorrencia)||ocorrencia.status==='CONCLUIDO_PARCIALMENTE')&&podeVincular&&<button type="button" className="pi-ocorrencia-vincular" onClick={()=>{setBusca('');setErro('');setAbrirVinculo(true);}}>+ Vincular evidência</button>}
      {detalheEvidencia?.esperadaId&&createPortal(<ModalEtapa titulo={detalheEvidencia.nomeOriginal} contexto="Detalhes da evidência" estadoContextual="normal" larguraFormulario="evidencia" camada="edicao" ocupado={false} onFechar={()=>setDetalheEvidencia(null)}><p className="mb-3 text-xs text-foreground/65">Arquivo vinculado: {detalheEvidencia.nomeOriginal} · {detalheEvidencia.status==='VERIFICADA'?'Verificada':detalheEvidencia.status==='REJEITADA'?'Em revisão':'Pendente de verificação'}. Consulte também as versões do requisito abaixo.</p><PainelComprovacaoEvidencia contratoId={contratoId} entregavelId={ocorrencia.entregavelId} esperadaId={detalheEvidencia.esperadaId} podeEditar={false} podeEnviar={false} ocultarArquivamento onComprovanteAlterado={()=>{void listarComprovantesOcorrencia(contratoId,ocorrencia.id).then(r=>{setVinculadas(r.vinculadas);setDisponiveis(r.disponiveis);}).catch(()=>setErro('Não foi possível atualizar os vínculos.'));void onAtualizar();}}/></ModalEtapa>,document.body)}
      {abrirVinculo&&createPortal(<ModalEtapa titulo="Vincular evidência" contexto={ocorrencia.titulo} estadoContextual="normal" larguraFormulario="registro" camada="edicao" ocupado={ocupado} onFechar={()=>{if(!ocupado)setAbrirVinculo(false);}}>
        <div className="space-y-4"><p className="text-xs text-foreground/70">Selecione um comprovante existente. Somente após verificação ele contará para a comprovação.</p>
          <p className="text-xs font-semibold">Pesquisar evidência</p><CampoBuscaSugestoes contextual rotulo="Pesquisar evidência" valor={busca} onChange={setBusca} opcoes={opcoes.map(c=>c.rotulo)} placeholder="Digite o nome do arquivo..." maximo={8}/>
          {!opcoes.length&&<p className="text-xs text-foreground/65">Nenhum comprovante disponível neste entregável.</p>}
          {erro&&<p role="alert" className="text-error-text text-xs">{erro}</p>}
          <div className="flex justify-end gap-2 border-t border-current/15 pt-3"><button type="button" className={ACAO} disabled={ocupado} onClick={()=>setAbrirVinculo(false)}>Cancelar</button><button type="button" className="pi-ocorrencia-confirmar-vinculo" disabled={ocupado||!selecionada} onClick={()=>selecionada&&void executar(selecionada.id,false)}>Confirmar vínculo</button></div>
        </div></ModalEtapa>,document.body)}
    </>}
    {erro&&<p role="alert" className="rounded-lg border border-red-500/40 p-2 text-xs text-error-text">{erro}</p>}
  </section>;
}

export function HistoricoOcorrencia({contratoId,ocorrenciaId}:{contratoId:string;ocorrenciaId:string}) {
  const [eventos,setEventos]=useState<EventoHistoricoOcorrencia[]>([]);const [erro,setErro]=useState('');const [carregando,setCarregando]=useState(true);
  useEffect(()=>{let ativo=true;queueMicrotask(()=>{if(ativo){setCarregando(true);setErro('');setEventos([]);}});void listarHistoricoOcorrencia(contratoId,ocorrenciaId)
    .then(v=>{if(ativo)setEventos(v);}).catch(e=>{if(ativo)setErro(e instanceof Error?e.message:'Não foi possível consultar o histórico.');})
    .finally(()=>{if(ativo)setCarregando(false);});return()=>{ativo=false;};},[contratoId,ocorrenciaId]);
  return <section className="space-y-3" aria-label="Histórico auditável da ocorrência">

    {carregando?<p role="status" className="text-xs">Consultando eventos…</p>:erro?null:eventos.length===0?<p className="text-xs text-foreground/65">Nenhum evento auditado encontrado.</p>:
      <ol className="space-y-3">{eventos.map(e=>{
        const alteracoes=alteracoesLegiveis(e.dadosAnteriores,e.dadosPosteriores);
        return <li key={e.id} className="pi-historico-ocorrencia-item min-w-0 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm">{rotuloEventoOcorrencia(e.acao)}</strong><time className="text-foreground/65">{new Date(e.registradoEm).toLocaleString('pt-BR')}</time></div>
          <p className="mt-1 text-foreground/65">Por: <strong>{e.autorNome || 'Usuário identificado'}</strong></p>
          {!alteracoes.length?<p className="mt-2 text-foreground/65">Evento registrado sem alteração de campos.</p>:<dl className="mt-3 space-y-2">
            {alteracoes.map(a=><div key={a.campo} className="pi-historico-alteracao min-w-0">
              <dt className="font-semibold">{a.campo}</dt><dd className="pi-historico-antes-depois">
                <div className="min-w-0"><span className="text-foreground/55">Antes</span><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.antes}</p></div>
                <div className="min-w-0"><span className="text-foreground/55">Depois</span><p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.depois}</p></div>
              </dd>
            </div>)}</dl>}

        </li>;
      })}</ol>}
    {erro&&<p role="alert" className="text-xs text-error-text">{erro}</p>}
  </section>;
}
