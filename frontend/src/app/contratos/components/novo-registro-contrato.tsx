'use client';

import { useEffect, useRef, useState } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';
import type { OperacaoPermissao } from '@/lib/admin-usuarios';
import { SeletorEntregavel } from '@/app/ocorrencias/components/seletor-entregavel';
import { ModalEtapa } from './modal-etapa';
import { IconeOrigemExecucao, type OrigemExecucao } from './execucoes-entregavel';

const opcoes: {id:OrigemExecucao;nome:string}[] = [{id:'MANUAL',nome:'Manual'},{id:'ATIVIDADE',nome:'Atividade'},{id:'EVIDENCIA',nome:'Evidência'},{id:'OCORRENCIA',nome:'Ocorrência'}];
const encerrados = ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO','ENCERRADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CANCELADO','CANCELADA'];

/** Seleciona o contexto antes de abrir o formulário operacional existente. */
export function NovoRegistroContrato({contratoId,contexto,bloqueado,abrir}:{contratoId:string;contexto:'ocorrencias'|'atividades'|'evidencias'|'manuais';bloqueado:boolean;abrir:(id:string,origem:OrigemExecucao,gatilho?:HTMLElement|null)=>void}) {
  const [aberto,setAberto]=useState(false),[etapa,setEtapa]=useState(''),[entregavel,setEntregavel]=useState(''),[origem,setOrigem]=useState<OrigemExecucao>('ATIVIDADE');
  const botao=useRef<HTMLButtonElement>(null);
  const [destino,setDestino]=useState<{id:string;origem:OrigemExecucao}|null>(null);
  useEffect(()=>{if(aberto||!destino)return;const quadro=requestAnimationFrame(()=>{setDestino(null);abrir(destino.id,destino.origem,botao.current);});return()=>cancelAnimationFrame(quadro);},[aberto,destino,abrir]);
  const acesso=useAcessoContrato(contratoId),perfil=useMeuPerfil();
  const etapas=useEtapas(contratoId,aberto),entregaveis=useEntregaveis(contratoId,aberto);
  const pode=(k:OperacaoPermissao)=>Boolean(!bloqueado&&perfil.dados?.ativo&&!acesso.erro&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.[k]));
  const disponivel:Record<OrigemExecucao,boolean>={MANUAL:pode('editarExecucaoFisica')||pode('registrarExecucaoOcorrencia'),ATIVIDADE:pode('registrarAtividades'),EVIDENCIA:pode('criarEvidencias')||pode('editarEvidencias'),OCORRENCIA:pode('criarOcorrencias')};
  const etapasValidas=(etapas.dados??[]).filter(e=>!e.arquivadoEm&&!encerrados.includes(e.status));
  const itens=(entregaveis.dados??[]).filter(e=>!e.arquivadoEm&&!encerrados.includes(e.statusExecucao??'')&&etapasValidas.some(t=>t.id===e.etapaId)&&(!etapa||e.etapaId===etapa)&&(origem!=='OCORRENCIA'||!['UNICO','RECORRENTE'].includes(e.tipo))&&(origem!=='MANUAL'||e.tipo!=='MARCO'));
  const iniciar=()=>{const preferida:OrigemExecucao=contexto==='ocorrencias'?'OCORRENCIA':contexto==='evidencias'?'EVIDENCIA':contexto==='manuais'?'MANUAL':'ATIVIDADE';setOrigem(disponivel[preferida]?preferida:opcoes.find(o=>disponivel[o.id])?.id??preferida);setEtapa('');setEntregavel('');setAberto(true);};
  return <><button ref={botao} type="button" data-pi-acao="primaria" disabled={!Object.values(disponivel).some(Boolean)} onClick={iniciar} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green disabled:opacity-40"><span aria-hidden="true">+</span> Novo registro</button>
    {aberto&&<ModalEtapa ocupado={false} titulo="Novo registro" contexto="Selecione a origem e o entregável" larguraFormulario="registro" camada="edicao" focoRetorno={botao.current} onFechar={()=>setAberto(false)}>
      <form data-pi-formulario className="pi-form-registro space-y-4" onSubmit={e=>{e.preventDefault();if(!disponivel[origem]||!itens.some(i=>i.id===entregavel))return;setDestino({id:entregavel,origem});setAberto(false);}}>
        <div role="group" aria-label="Origem do registro" className="pi-escolhas-registro">{opcoes.map(o=><button key={o.id} type="button" disabled={!disponivel[o.id]} aria-pressed={origem===o.id} className="pi-filtro-agenda pi-opcao-registro inline-flex items-center gap-2 disabled:opacity-40" onClick={()=>{setOrigem(o.id);setEntregavel('');}}><IconeOrigemExecucao origem={o.id}/>{o.nome}</button>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><SeletorEntregavel itens={etapasValidas.map(e=>({id:e.id,nome:`${String(e.sequencia).padStart(2,'0')} · ${e.nome}`}))} valor={etapa} onChange={id=>{setEtapa(id);setEntregavel('');}} rotulo="Etapa" placeholder="Pesquisar etapa..." opcaoTodos rotuloTodos="Todas as etapas"/><SeletorEntregavel itens={itens} valor={entregavel} onChange={setEntregavel} rotulo="Entregável" placeholder="Pesquisar entregável..."/></div>
        {(etapas.carregando||entregaveis.carregando)&&<p role="status" className="text-xs text-foreground/70">Consultando vínculos disponíveis...</p>}
        {(etapas.erro||entregaveis.erro)&&<p role="alert" className="text-xs text-error-text">Não foi possível consultar os vínculos.</p>}
        <p className="text-xs text-foreground/65">O registro será aberto com o entregável selecionado.</p>
        <div className="pi-rodape-formulario flex justify-end gap-2 border-t border-current/15 pt-3"><button type="button" className="rounded-lg border border-current/25 px-3 py-2 text-sm" onClick={()=>setAberto(false)}>Cancelar</button><button type="submit" data-pi-acao="primaria" disabled={!disponivel[origem]||!itens.some(i=>i.id===entregavel)||Boolean(etapas.erro||entregaveis.erro)} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-40">Continuar</button></div>
      </form>
    </ModalEtapa>}</>;
}
