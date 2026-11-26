'use client';
import {useState} from 'react';
import {createPortal} from 'react-dom';
import {AcaoVincularRegistro} from '@/app/components/acao-vincular-registro';
import {ModalEtapa} from './modal-etapa';
import {EditorVinculosLocaisEvidencia} from './editor-vinculos-locais-evidencia';
import {consultarEvidencia,validarDetalheEvidencia,ROTULO_STATUS,type DetalheEvidencia,type VinculoCompartilhado} from '@/lib/comprovantes';
import {destinosVinculadosEvidencia,registrosVinculadosEvidencia,totaisVinculosEvidencia,type AbaVinculosEvidencia,type DestinoVinculoEvidencia} from '@/lib/vinculos-evidencia';

const abas = [['contratos','Contratos'],['entregaveis','Entregáveis'],['ocorrencias','Ocorrências'],['atividades','Atividades']] as const;
const normalizar=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');

export function ModalVinculosEvidencia({dados,podeEditarLocal,somenteLeitura,ocupado,confirmando,fechar,atualizar,onVerificar}:{
  dados:DetalheEvidencia;podeEditarLocal:boolean;somenteLeitura:boolean;ocupado:boolean;confirmando:boolean;fechar:()=>void;
  atualizar:()=>void|Promise<void>;onVerificar:(v:VinculoCompartilhado)=>void;
}){
  const [aba,setAba]=useState<AbaVinculosEvidencia>('contratos');
  const [filtro,setFiltro]=useState(''),[busca,setBusca]=useState('');
  const [editor,setEditor]=useState<{dados:DetalheEvidencia;aba:'ocorrencias'|'atividades'}|null>(null),[consultando,setConsultando]=useState(false),[erro,setErro]=useState('');
  const destinos=destinosVinculadosEvidencia(dados),totais=totaisVinculosEvidencia(destinos);
  const contratos=[...new Map(destinos.map(d=>[d.contratoId,d.contrato])).entries()];
  const filtroAtivo=contratos.some(([id])=>id===filtro)?filtro:'';
  const visiveis=destinos.filter(d=>!filtroAtivo||d.contratoId===filtroAtivo);
  const termo=normalizar(busca.trim()),encontrado=(s:string)=>normalizar(s).includes(termo);
  const grupos=contratos.filter(([,nome])=>encontrado(nome));
  const entregaveis=visiveis.filter(d=>encontrado(`${d.entregavel} ${d.contrato}`));
  const registros=aba==='ocorrencias'||aba==='atividades'?registrosVinculadosEvidencia(visiveis,aba==='ocorrencias'?'ocorrencia':'atividade').filter(v=>encontrado(`${v.titulo} ${v.contrato} ${v.destinos.join(' ')}`)):[];
  const historicos=(dados.compartilhamentos??[]).filter(v=>!v.vigente&&(!filtroAtivo||v.contratoId===filtroAtivo)&&encontrado(`${v.entregavel} ${v.contrato}`));
  const podeEditar=(d:DestinoVinculoEvidencia)=>!somenteLeitura&&(d.atual?podeEditarLocal&&d.podeEditar:d.podeEditar);
  async function editar(d:DestinoVinculoEvidencia,abaInicial:'ocorrencias'|'atividades'='ocorrencias'){
    if(!podeEditar(d)||consultando||ocupado)return;
    setConsultando(true);setErro('');
    try{
      const atual=await consultarEvidencia(d.contratoId,d.entregavelId,d.esperadaId);
      validarDetalheEvidencia(atual);
      if(atual.id!==d.esperadaId||atual.contratoId!==d.contratoId||atual.entregavelId!==d.entregavelId||!Array.isArray(atual.vinculosAtuais)||atual.podeEditarVinculos===false||atual.status==='VERIFICADA'||atual.contextoPermiteAlterar===false||atual.arquivadoEm||atual.entregavelArquivadoEm||(!d.atual&&atual.versoes[0]?.id!==d.compartilhado?.comprovanteId))throw new Error('O destino mudou ou não permite edição. Atualize a consulta.');
      setEditor({dados:atual,aba:abaInicial});
    }catch(e){setErro(e instanceof Error?e.message:'Não foi possível consultar o destino.');}finally{setConsultando(false);}
  }
  function trocar(a:AbaVinculosEvidencia){setAba(a);setBusca('');if(a==='contratos')setFiltro('');}
  const editaveis=visiveis.filter(podeEditar);
  const chaveDestino=(d:DestinoVinculoEvidencia)=>`${d.contratoId}:${d.entregavelId}:${d.esperadaId}`;
  return createPortal(<><ModalEtapa titulo="Vínculos da evidência" contexto={dados.tipoEvidencia} rotuloFechar="Fechar vínculos" camada="edicao" larguraFormulario="atividade" ocupado={ocupado||consultando} bloqueadoPorSubmodal={!!editor||confirmando} onFechar={fechar}>
    <div className="pi-vinculos-consulta pi-vinculos-v21 pi-vinculos-estavel">
      <p className="text-xs text-foreground/65">Consulte todos os destinos visíveis desta evidência. A edição de ocorrências e atividades é individual por entregável.</p>
      <nav className="pi-atividade-vinculos-abas flex-wrap" aria-label="Tipos de vínculo da evidência">{abas.map(([a,rotulo])=><button key={a} type="button" aria-pressed={aba===a} aria-label={rotulo} onClick={()=>trocar(a)}>{rotulo}<span aria-hidden="true">{totais[a]??'—'}</span></button>)}</nav>
      <div className="pi-vinculos-filtros-estaveis">
        <label className="min-w-0"><span className="sr-only">Pesquisar vínculo</span><input type="search" className="w-full rounded-lg border border-current/20 px-3 py-2 text-sm" placeholder={`Localizar ${aba==='contratos'?'contrato':aba==='entregaveis'?'entregável':aba==='ocorrencias'?'ocorrência':'atividade'}…`} value={busca} onChange={e=>setBusca(e.target.value)}/></label>
        {aba!=='contratos'&&<select aria-label="Filtrar por contrato" className="w-full min-w-0 rounded-lg border border-current/20 px-3 py-2 text-sm" value={filtroAtivo} onChange={e=>setFiltro(e.target.value)}><option value="">Todos os contratos</option>{contratos.map(([id,nome])=><option key={id} value={id}>Contrato {nome}</option>)}</select>}
      </div>
      <div className="pi-vinculos-lista-estavel" key={aba}>
      {erro&&<p role="alert" className="text-sm text-error-text">{erro}</p>}
      {aba==='contratos'&&<div className="grid gap-2">{grupos.map(([id,nome])=>{const t=totaisVinculosEvidencia(destinos.filter(d=>d.contratoId===id));return <button type="button" key={id} className="pi-contrato-vinculo text-left" onClick={()=>{setFiltro(id);trocar('entregaveis');}}><strong>Contrato {nome}{id===dados.contratoId?' · Atual':''}</strong><span className="pi-vinculo-contadores">Entregáveis <b>{t.entregaveis}</b> Ocorrências <b>{t.ocorrencias??'—'}</b> Atividades <b>{t.atividades??'—'}</b></span></button>;})}{!grupos.length&&<p className="text-sm text-foreground/65">Nenhum contrato encontrado.</p>}</div>}
      {aba==='entregaveis'&&<div className="grid gap-2">{entregaveis.map(d=><article key={`${d.contratoId}:${d.esperadaId}`} className="pi-vinculo-card-v21"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="min-w-0 break-words">{d.entregavel}</strong><span className="pi-diario-etiqueta" data-situacao={d.status}>{ROTULO_STATUS[d.status]}</span></div><p className="text-xs text-foreground/65">Contrato {d.contrato}{d.atual?' · Atual':''}</p><div className="flex flex-wrap justify-end gap-2">{podeEditar(d)&&<button type="button" disabled={ocupado||consultando} className="rounded-lg border border-current/25 px-3 py-2 text-xs font-semibold" onClick={()=>void editar(d)}>Editar vínculos</button>}{!somenteLeitura&&!d.atual&&d.compartilhado?.podeVerificar&&<button type="button" disabled={ocupado||consultando} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white" onClick={()=>onVerificar(d.compartilhado!)}>Aprovar evidência</button>}</div></article>)}{!entregaveis.length&&<p className="text-sm text-foreground/65">Nenhum entregável encontrado.</p>}{!!historicos.length&&<details className="rounded-lg border border-current/15 p-3 text-sm"><summary className="cursor-pointer">Destinos históricos ({historicos.length})</summary>{historicos.map(v=><p key={v.comprovanteId} className="mt-2 break-words text-xs">{v.entregavel} · Contrato {v.contrato} · Versão histórica</p>)}</details>}</div>}
      {(aba==='ocorrencias'||aba==='atividades')&&<div className="grid gap-2"><AcaoVincularRegistro rotulo={aba==='ocorrencias'?'Vincular ocorrência':'Vincular atividade'} opcoes={editaveis.map(d=>({id:chaveDestino(d),nome:`${d.entregavel} · Contrato ${d.contrato}`}))} ocupado={ocupado||consultando} onVincular={id=>{const d=editaveis.find(d=>chaveDestino(d)===id);if(d)void editar(d,aba);}}/>{visiveis.some(d=>!Array.isArray(d.vinculos))&&<p role="status" className="text-xs text-foreground/65">Consulta incompleta em um ou mais destinos.</p>}{registros.map(v=><article key={`${v.contratoId}:${v.id}`} className="pi-vinculo-card-v21"><strong className="break-words">{v.titulo}</strong><p className="text-xs text-foreground/65">Contrato {v.contrato} · {v.destinos.join(' / ')}</p></article>)}{!registros.length&&visiveis.every(d=>Array.isArray(d.vinculos))&&<p className="text-sm text-foreground/65">Nenhum vínculo encontrado nesta consulta.</p>}</div>}
      </div>
    </div>
  </ModalEtapa>{editor&&<EditorVinculosLocaisEvidencia key={editor.dados.id} dados={editor.dados} abaInicial={editor.aba} fechar={()=>setEditor(null)} atualizar={atualizar}/>}</>,document.body);
}
