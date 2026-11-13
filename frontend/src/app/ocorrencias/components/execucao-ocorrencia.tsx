'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { alteracoesLegiveis, rotuloEventoOcorrencia } from './historico-legivel';
import {
  criarLancamentoOcorrencia, corrigirLancamentoOcorrencia, listarLancamentosOcorrencia,
  listarComprovantesOcorrencia, vincularComprovanteOcorrencia, desvincularComprovanteOcorrencia,
  listarHistoricoOcorrencia, type Ocorrencia, type LancamentoOcorrencia,
  type ComprovanteOcorrencia, type EventoHistoricoOcorrencia,
} from '@/hooks/use-ocorrencias';

const CAMPO='w-full min-w-0 rounded-lg border border-current/25 bg-background px-3 py-2 text-sm outline-none focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25';
const ACAO='rounded-lg border border-current/30 px-3 py-2 text-xs font-semibold hover:bg-current/[0.07] focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35';
const CONFIRMAR='rounded-lg bg-brand-green px-4 py-2 text-xs font-semibold text-on-brand-green hover:brightness-110 disabled:opacity-40';
const formatar=(n:number)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:3}).format(n);
const aberta=(o:Ocorrencia)=>!o.substituidaEm && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(o.status);
const naoNegativa=(v:string)=>/^\d{1,12}(?:\.\d{1,3})?$/.test(v);
const positiva=(v:string)=>/^(?!0+(?:\.0+)?$)\d{1,12}(?:\.\d{1,3})?$/.test(v);

/** Detalhamento da execução física: lançamento manual é independente da medição aprovada por atividade. */
export function ExecucaoOcorrencia({ contratoId, ocorrencia, unidade, podeRegistrar, onAtualizar }: {
  contratoId:string; ocorrencia:Ocorrencia; unidade:string; podeRegistrar:boolean; onAtualizar:()=>Promise<unknown>;
}) {
  const [lancamentos,setLancamentos]=useState<LancamentoOcorrencia[]>([]);
  const [carregando,setCarregando]=useState(false);const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState(''); const [quantidade,setQuantidade]=useState('');
  const [justificativa,setJustificativa]=useState('');
  const [corrigindo,setCorrigindo]=useState<string|null>(null);
  const [quantidadeCorrecao,setQuantidadeCorrecao]=useState('');
  const [motivoCorrecao,setMotivoCorrecao]=useState('');
  // Em retry de rede, reutilizar a MESMA chave idempotente.
  const chavePendente=useRef<string|null>(null);
  useEffect(()=>{
    let ativo=true;setCarregando(true);setErro('');
    void listarLancamentosOcorrencia(contratoId,ocorrencia.id).then(itens=>{if(ativo)setLancamentos(itens);})
      .catch(f=>{if(ativo)setErro(f instanceof Error?f.message:'Não foi possível consultar lançamentos.');})
      .finally(()=>{if(ativo)setCarregando(false);});
    return ()=>{ativo=false;};
  },[contratoId,ocorrencia.id]);
  const quantitativa=ocorrencia.modoRegistro==='QUANTITATIVO' && ocorrencia.metaQuantidade!=null;
  const meta=Number(ocorrencia.metaQuantidade??0);
  const realizado=Number(ocorrencia.quantidadeExecutada??0);
  const comprometido=Number(ocorrencia.quantidadeRegistrada??0);
  const restante=Math.max(0,meta-realizado);
  const percentual=meta>0?Math.min(100,(realizado/meta)*100):0;
  async function registrar(e:FormEvent){
    e.preventDefault();if(ocupado||!positiva(quantidade))return;
    chavePendente.current??=crypto.randomUUID();
    setOcupado(true);setErro('');
    try {
      await criarLancamentoOcorrencia(contratoId,ocorrencia.id,chavePendente.current,quantidade,justificativa.trim());
      chavePendente.current=null;setQuantidade('');setJustificativa('');
      setLancamentos(await listarLancamentosOcorrencia(contratoId,ocorrencia.id));await onAtualizar();
    } catch(f){setErro(f instanceof Error?f.message:'Falha no lançamento.');}
    finally{setOcupado(false);}
  }
  async function corrigir(e:FormEvent){
    e.preventDefault();if(ocupado||!corrigindo||!naoNegativa(quantidadeCorrecao)||motivoCorrecao.trim().length<15)return;
    setOcupado(true);setErro('');
    try{await corrigirLancamentoOcorrencia(contratoId,ocorrencia.id,corrigindo,quantidadeCorrecao,motivoCorrecao.trim());
      setCorrigindo(null);setMotivoCorrecao('');setLancamentos(await listarLancamentosOcorrencia(contratoId,ocorrencia.id));await onAtualizar();}
    catch(f){setErro(f instanceof Error?f.message:'Não foi possível corrigir o lançamento.');}
    finally{setOcupado(false);}
  }
  if(!quantitativa)return <p className="rounded-lg border border-current/20 p-3 text-sm text-foreground/70">Esta ocorrência registra atividades e descrições sem meta numérica.</p>;
  return <section className="space-y-4" aria-label="Progresso quantitativo da ocorrência">
    <div className="rounded-xl border border-current/20 bg-current/[0.035] p-3 sm:p-4">
      <h4 className="text-sm font-semibold">Progresso da meta</h4>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt className="text-xs text-foreground/65">Meta</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatar(meta)}</dd></div>
        <div><dt className="text-xs text-foreground/65">Executado aprovado</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatar(realizado)}</dd></div>
        <div><dt className="text-xs text-foreground/65">Falta realizar</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatar(restante)}</dd></div>
        <div><dt className="text-xs text-foreground/65">Avanço</dt><dd className="mt-1 text-lg font-bold tabular-nums">{formatar(percentual)}%</dd></div>
      </dl>
      <div role="progressbar" aria-label="Avanço quantitativo da ocorrência" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100}
        className="mt-3 h-2.5 overflow-hidden rounded-full bg-current/10"><div className="h-full rounded-full bg-brand-green" style={{width:`${percentual}%`}}/></div>
      <p className="mt-2 text-xs text-foreground/65">Unidade: {unidade}. {formatar(Number(ocorrencia.quantidadeManual??0))} lançados diretamente + {formatar(Number(ocorrencia.quantidadeAtividadesVerificada??0))} de atividades verificadas.
        {comprometido>realizado?` Há ${formatar(comprometido-realizado)} registrados em atividades ainda não aprovadas.`:''}</p>
    </div>
    <div className="rounded-xl border border-current/20 p-3 sm:p-4">
      <h4 className="text-sm font-semibold">Registrar execução diretamente</h4>
      <p className="mt-1 text-xs text-foreground/65">Informe o que foi realizado <strong>agora</strong>, não o total acumulado. Um novo lançamento soma à execução, enquanto corrigir um anterior substitui apenas aquele valor.</p>
      {aberta(ocorrencia)&&podeRegistrar?<form onSubmit={registrar} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] sm:items-end">
        <label className="text-xs font-semibold">Quantidade realizada agora
          <input className={`mt-1 ${CAMPO}`} type="number" min="0.001" step="0.001" inputMode="decimal" placeholder="Ex.: 19" value={quantidade}
            onChange={e=>{setQuantidade(e.target.value);chavePendente.current=null;}} required /></label>
        <label className="text-xs font-semibold">Observação do lançamento (opcional)
          <input className={`mt-1 ${CAMPO}`} maxLength={200} placeholder="Ex.: manutenção do lote 2" value={justificativa}
            onChange={e=>{setJustificativa(e.target.value);chavePendente.current=null;}} /></label>
        <button type="submit" className={`${CONFIRMAR} min-h-9`} disabled={ocupado||!positiva(quantidade)}>{ocupado?'Registrando…':'Registrar'}</button>
      </form>:<p className="mt-2 text-xs text-foreground/65">{!podeRegistrar?'Você não possui autorização para registrar progresso físico.':'Ocorrência bloqueada até reabertura autorizada.'}</p>}
      {erro&&<p role="alert" className="mt-3 rounded-lg border border-red-500/40 p-2 text-xs text-error-text">{erro}</p>}
      <div className="mt-4 space-y-2">
        <h5 className="text-xs font-semibold">Lançamentos identificáveis</h5>
        {carregando?<p role="status" className="text-xs text-foreground/65">Consultando lançamentos…</p>:
          lancamentos.length===0?<p className="text-xs text-foreground/60">Nenhum lançamento manual. Medições de atividades aparecem no total aprovado acima.</p>:
          <ul className="space-y-2">{lancamentos.map(item=><li key={item.id} className="rounded-lg border border-current/15 p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><div>
              <strong className="tabular-nums">{formatar(Number(item.quantidade))} {unidade}</strong>
              <p className="text-xs text-foreground/60">{new Date(item.criadoEm).toLocaleString('pt-BR')}{item.alteradoEm?' · corrigido posteriormente':''}</p>
              {item.justificativa&&<p className="mt-1 break-words text-xs text-foreground/70">{item.justificativa}</p>}
            </div>
            {aberta(ocorrencia)&&podeRegistrar&&<button type="button" className={ACAO} onClick={()=>{setCorrigindo(item.id);setQuantidadeCorrecao(item.quantidade);setMotivoCorrecao('');}}>Corrigir</button>}</div>
            {corrigindo===item.id&&<form onSubmit={corrigir} className="mt-3 grid gap-2 border-t border-current/15 pt-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Novo valor absoluto<input className={`mt-1 ${CAMPO}`} type="number" min="0" step="0.001" value={quantidadeCorrecao} onChange={e=>setQuantidadeCorrecao(e.target.value)}/></label>
              <label className="text-xs font-semibold">Justificativa (15–200 caracteres)<input className={`mt-1 ${CAMPO}`} maxLength={200} value={motivoCorrecao} onChange={e=>setMotivoCorrecao(e.target.value)} /></label>
              <div className="flex gap-2 sm:col-span-2"><button className={ACAO} type="button" onClick={()=>setCorrigindo(null)}>Cancelar</button><button className={CONFIRMAR} type="submit" disabled={ocupado||!naoNegativa(quantidadeCorrecao)||motivoCorrecao.trim().length<15}>Salvar correção</button></div>
            </form>}
          </li>)}</ul>}
      </div>
    </div>
  </section>;
}

export function EvidenciasOcorrencia({ contratoId, ocorrencia, podeVincular, onAtualizar }: {
  contratoId:string;ocorrencia:Ocorrencia;podeVincular:boolean;onAtualizar:()=>Promise<unknown>;
}) {
  const [vinculadas,setVinculadas]=useState<ComprovanteOcorrencia[]>([]);
  const [disponiveis,setDisponiveis]=useState<ComprovanteOcorrencia[]>([]);
  const [carregando,setCarregando]=useState(true);const [ocupado,setOcupado]=useState(false);const [erro,setErro]=useState('');
  const [abrirVinculo,setAbrirVinculo]=useState(false);
  useEffect(()=>{let ativo=true;setCarregando(true);setErro('');void listarComprovantesOcorrencia(contratoId,ocorrencia.id)
    .then(r=>{if(ativo){setVinculadas(r.vinculadas);setDisponiveis(r.disponiveis);}})
    .catch(e=>{if(ativo)setErro(e instanceof Error?e.message:'Falha ao consultar comprovantes.');})
    .finally(()=>{if(ativo)setCarregando(false);});return ()=>{ativo=false;};},[contratoId,ocorrencia.id]);
  async function executar(comprovanteId:string,remover:boolean){setOcupado(true);setErro('');try{
    if(remover)await desvincularComprovanteOcorrencia(contratoId,ocorrencia.id,comprovanteId);
    else await vincularComprovanteOcorrencia(contratoId,ocorrencia.id,comprovanteId);
    const r=await listarComprovantesOcorrencia(contratoId,ocorrencia.id);setVinculadas(r.vinculadas);setDisponiveis(r.disponiveis);await onAtualizar();
  }catch(e){setErro(e instanceof Error?e.message:'Falha ao alterar vínculo.');}finally{setOcupado(false);}}
  return <section className="space-y-3" aria-label="Evidências da ocorrência">
    <p className="text-xs text-foreground/70">Vincule comprovantes já verificados e pertencentes ao mesmo entregável. O arquivo original é reaproveitado, sem duplicação.</p>
    <p className="rounded-lg border border-current/20 bg-current/[0.025] p-3 text-xs">Evidências verificadas exigidas: <strong>{ocorrencia.minimoEvidenciasVerificadas ?? (ocorrencia.evidenciaExigida==='AMBOS'?2:ocorrencia.evidenciaExigida==='NENHUMA'?0:1)}</strong>. Apenas comprovantes vinculados e verificados são contabilizados.</p>
    <div className="grid gap-2 sm:grid-cols-2"><div className="rounded-lg border border-current/20 p-3 text-xs">Foto exigida: <strong>{ocorrencia.evidenciaExigida==='FOTO'||ocorrencia.evidenciaExigida==='AMBOS'?'Sim':'Não'}</strong> · vinculadas: <strong>{ocorrencia.evidenciasFoto??0}</strong></div>
      <div className="rounded-lg border border-current/20 p-3 text-xs">Relatório exigido: <strong>{ocorrencia.evidenciaExigida==='RELATORIO'||ocorrencia.evidenciaExigida==='AMBOS'?'Sim':'Não'}</strong> · vinculados: <strong>{ocorrencia.evidenciasRelatorio??0}</strong></div></div>
    {carregando?<p role="status" className="text-xs">Consultando evidências…</p>:<>
      <h4 className="text-sm font-semibold">Comprovantes vinculados</h4>
      {!vinculadas.length?<p className="text-xs text-foreground/60">Nenhum comprovante vinculado.</p>:<ul className="space-y-2">{vinculadas.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/20 p-3 text-xs">
        <span className="min-w-0 break-all"><strong>{c.nomeOriginal}</strong> · {c.tipoEvidencia} · {c.status}</span>
        {aberta(ocorrencia)&&podeVincular&&<button className={ACAO} type="button" disabled={ocupado} onClick={()=>void executar(c.id,true)}>Desvincular</button>}
      </li>)}</ul>}
      {aberta(ocorrencia)&&podeVincular&&<div className="rounded-2xl border border-current/20 bg-current/[0.025] p-2">
        <button type="button" aria-expanded={abrirVinculo} onClick={()=>setAbrirVinculo(valor=>!valor)}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition hover:bg-current/[0.07] focus-visible:outline-2 focus-visible:outline-current">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/30 bg-current/[0.07] text-2xl font-medium" aria-hidden="true">+</span>
          <span className="min-w-0 flex-1"><strong className="block text-sm">Vincular evidência</strong><span className="block text-xs text-foreground/65">Associe um comprovante verificado deste entregável.</span></span>
          <span aria-hidden="true" className="text-lg text-foreground/50">{abrirVinculo?'⌄':'›'}</span>
        </button>
        {abrirVinculo && <div className="border-t border-current/15 px-3 pb-3 pt-3">
          {!disponiveis.length?<p className="text-xs text-foreground/60">Nenhum comprovante disponível. Envie e verifique o arquivo no entregável primeiro.</p>:<ul className="max-h-60 space-y-2 overflow-y-auto">{disponiveis.map(c=><li key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-current/20 p-3 text-xs">
            <span className="min-w-0 break-all"><strong>{c.nomeOriginal}</strong> · {c.tipoEvidencia}</span><button type="button" className={CONFIRMAR} disabled={ocupado} onClick={()=>void executar(c.id,false)}>Vincular</button>
          </li>)}</ul>}
        </div>}
      </div>}
    </>}
    {erro&&<p role="alert" className="rounded-lg border border-red-500/40 p-2 text-xs text-error-text">{erro}</p>}
  </section>;
}

export function HistoricoOcorrencia({contratoId,ocorrenciaId}:{contratoId:string;ocorrenciaId:string}) {
  const [eventos,setEventos]=useState<EventoHistoricoOcorrencia[]>([]);const [erro,setErro]=useState('');const [carregando,setCarregando]=useState(true);
  useEffect(()=>{let ativo=true;setCarregando(true);setErro('');void listarHistoricoOcorrencia(contratoId,ocorrenciaId)
    .then(v=>{if(ativo)setEventos(v);}).catch(e=>{if(ativo)setErro(e instanceof Error?e.message:'Não foi possível consultar o histórico.');})
    .finally(()=>{if(ativo)setCarregando(false);});return()=>{ativo=false;};},[contratoId,ocorrenciaId]);
  return <section className="space-y-3" aria-label="Histórico auditável da ocorrência">
    <p className="text-xs text-foreground/70">Registros imutáveis de alterações diretas, lançamentos, solicitações e decisões. Cada evento conserva autor, data/hora e valores anteriores e novos.</p>
    {carregando?<p role="status" className="text-xs">Consultando eventos…</p>:eventos.length===0?<p className="text-xs text-foreground/65">Nenhum evento auditado encontrado.</p>:
      <ol className="space-y-3">{eventos.map(e=>{
        const alteracoes=alteracoesLegiveis(e.dadosAnteriores,e.dadosPosteriores);
        return <li key={e.id} className="min-w-0 rounded-xl border border-current/20 bg-current/[0.025] p-3 text-xs">
          <div className="flex flex-wrap items-start justify-between gap-2"><strong className="text-sm">{rotuloEventoOcorrencia(e.acao)}</strong><time className="text-foreground/65">{new Date(e.registradoEm).toLocaleString('pt-BR')}</time></div>
          <p className="mt-1 text-foreground/65">Por: <strong>{e.autorNome || 'Usuário identificado'}</strong></p>
          {!alteracoes.length?<p className="mt-2 text-foreground/65">Evento registrado sem alteração de campos.</p>:<dl className="mt-3 space-y-2">
            {alteracoes.map(a=><div key={a.campo} className="min-w-0 rounded-lg border border-current/10 p-2">
              <dt className="font-semibold">{a.campo}</dt><dd className="mt-1 grid min-w-0 gap-2 sm:grid-cols-2">
                <div className="min-w-0"><span className="text-foreground/55">Antes</span><p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.antes}</p></div>
                <div className="min-w-0"><span className="text-foreground/55">Depois</span><p className="max-h-28 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{a.depois}</p></div>
              </dd>
            </div>)}</dl>}
          <details className="mt-3 border-t border-current/15 pt-2"><summary className="cursor-pointer text-foreground/65">Dados técnicos da auditoria</summary>
            <p className="mt-2 break-all text-foreground/60">Identificador do autor: {e.ator}</p>
            <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-current/[0.05] p-2">{JSON.stringify({antes:e.dadosAnteriores,depois:e.dadosPosteriores},null,2)}</pre>
          </details>
        </li>;
      })}</ol>}
    {erro&&<p role="alert" className="text-xs text-error-text">{erro}</p>}
  </section>;
}
