'use client';

import { useEffect, useState } from 'react';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';
import type { OperacaoPermissao } from '@/lib/admin-usuarios';
import { SeletorEntregavel } from '@/app/ocorrencias/components/seletor-entregavel';
import { ModalEtapa } from './modal-etapa';
import { IconeOrigemExecucao, type OrigemExecucao } from './execucoes-entregavel';

const opcoes: {id:OrigemExecucao;nome:string}[] = [{id:'MANUAL',nome:'Manual'},{id:'ATIVIDADE',nome:'Atividade'},{id:'EVIDENCIA',nome:'Evidência'},{id:'OCORRENCIA',nome:'Ocorrência'}];
const encerrados = ['CONCLUIDA','CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADA','FINALIZADO','ENCERRADO','ENCERRADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CANCELADO','CANCELADA'];

/** Seleciona o contexto antes de abrir o formulário operacional existente. */
export function NovoRegistroContrato({contratoId,contexto,bloqueado,abrir}:{contratoId:string;contexto:'ocorrencias'|'atividades'|'evidencias'|'manuais';bloqueado:boolean;abrir:(id:string,origem:OrigemExecucao,gatilho?:HTMLElement|null)=>void}) {
  const [aberto,setAberto]=useState(false),[etapa,setEtapa]=useState(''),[entregavel,setEntregavel]=useState(''),[origem,setOrigem]=useState<OrigemExecucao>('ATIVIDADE');
  const [botao,setBotao]=useState<HTMLButtonElement|null>(null);
  const [destino,setDestino]=useState<{id:string;origem:OrigemExecucao}|null>(null);
  useEffect(()=>{if(aberto||!destino)return;const quadro=requestAnimationFrame(()=>{setDestino(null);abrir(destino.id,destino.origem,botao);});return()=>cancelAnimationFrame(quadro);},[aberto,destino,abrir,botao]);
  const acesso=useAcessoContrato(contratoId),perfil=useMeuPerfil();
  const etapas=useEtapas(contratoId,aberto),entregaveis=useEntregaveis(contratoId,aberto);
  const pode=(k:OperacaoPermissao)=>Boolean(!bloqueado&&perfil.dados?.ativo&&!acesso.erro&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.[k]));
  const disponivel:Record<OrigemExecucao,boolean>={MANUAL:pode('editarExecucaoFisica')||pode('registrarExecucaoOcorrencia'),ATIVIDADE:pode('registrarAtividades'),EVIDENCIA:pode('criarEvidencias')||pode('editarEvidencias'),OCORRENCIA:pode('criarOcorrencias')};
  const etapasValidas=(etapas.dados??[]).filter(e=>!e.arquivadoEm&&!e.conclusaoSolicitadaEm&&!e.encerramentoSolicitadoEm&&!encerrados.includes(e.status));
  const elegiveis=(entregaveis.dados??[]).filter(e=>!e.arquivadoEm&&!e.regularizacaoDocumentalSolicitada&&!encerrados.includes(e.statusExecucao??'')&&etapasValidas.some(t=>t.id===e.etapaId));
  const aceitaOrigem=(e: (typeof elegiveis)[number], tipo: OrigemExecucao)=>disponivel[tipo]&&(tipo!=='OCORRENCIA'||!['UNICO','RECORRENTE'].includes(e.tipo))&&(tipo!=='MANUAL'||e.tipo!=='MARCO');
  const destinosOrigem=elegiveis.filter(e=>aceitaOrigem(e,origem));
  const etapasOrigem=etapasValidas.filter(e=>destinosOrigem.some(d=>d.etapaId===e.id));
  const itens=destinosOrigem.filter(e=>!etapa||e.etapaId===etapa);
  const consultando=etapas.carregando||entregaveis.carregando||etapas.dados===undefined||entregaveis.dados===undefined;
  const falha=Boolean(etapas.erro||entregaveis.erro);
  const semDestino=!consultando&&!falha&&!elegiveis.some(e=>opcoes.some(o=>aceitaOrigem(e,o.id)));
  const avisoSemDestino=!etapasValidas.length?'Para prosseguir, primeiro crie uma etapa referente a este registro.':!elegiveis.length?'Para prosseguir, primeiro crie um entregável disponível em uma etapa ativa.':'Nenhum entregável disponível aceita os tipos de registro permitidos neste contrato.';
  const iniciar=()=>{const preferida:OrigemExecucao=contexto==='ocorrencias'?'OCORRENCIA':contexto==='evidencias'?'EVIDENCIA':contexto==='manuais'?'MANUAL':'ATIVIDADE';setOrigem(disponivel[preferida]?preferida:opcoes.find(o=>disponivel[o.id])?.id??preferida);setEtapa('');setEntregavel('');setAberto(true);};
  return <><button type="button" data-pi-acao="primaria" disabled={!Object.values(disponivel).some(Boolean)} onClick={e=>{setBotao(e.currentTarget);iniciar();}} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green disabled:opacity-40"><span aria-hidden="true">+</span> Novo registro</button>
    {aberto&&<ModalEtapa ocupado={false} titulo="Novo registro" contexto={semDestino?"Planejamento necessário":"Selecione a origem e o entregável"} larguraFormulario="registro" camada="edicao" focoRetorno={botao} onFechar={()=>setAberto(false)}>
      {falha?<div className="space-y-4"><p role="alert" className="text-sm text-error-text">Não foi possível consultar os vínculos disponíveis.</p><button type="button" data-pi-acao="primaria" className="rounded-lg px-4 py-2 text-sm" onClick={()=>{void Promise.allSettled([etapas.atualizar(),entregaveis.atualizar()]);}}>Tentar novamente</button></div>:consultando?<p role="status" className="text-sm text-foreground/70">Consultando vínculos disponíveis…</p>:semDestino?<div className="space-y-4"><p role="status" className="text-sm text-amber-700 dark:text-amber-300">{avisoSemDestino}</p><div className="flex justify-end"><button type="button" data-pi-acao="primaria" className="rounded-lg px-4 py-2 text-sm font-semibold" onClick={()=>setAberto(false)}>Entendi</button></div></div>:<form data-pi-formulario className="pi-form-registro space-y-4" onSubmit={e=>{e.preventDefault();if(!disponivel[origem]||!itens.some(i=>i.id===entregavel))return;setDestino({id:entregavel,origem});setAberto(false);}}>
        <div role="group" aria-label="Origem do registro" className="pi-escolhas-registro">{opcoes.map(o=><button key={o.id} type="button" disabled={!disponivel[o.id]} aria-pressed={origem===o.id} className="pi-filtro-agenda pi-opcao-registro inline-flex items-center gap-2 disabled:opacity-40" onClick={()=>{setOrigem(o.id);setEtapa('');setEntregavel('');}}><IconeOrigemExecucao origem={o.id}/>{o.nome}</button>)}</div>
        <div className="grid gap-4 sm:grid-cols-2"><SeletorEntregavel itens={etapasOrigem.map(e=>({id:e.id,nome:`${String(e.sequencia).padStart(2,'0')} · ${e.nome}`}))} valor={etapa} onChange={id=>{setEtapa(id);setEntregavel('');}} rotulo="Etapa" limiteRotulo={28} placeholder="Pesquisar etapa..." opcaoTodos rotuloTodos="Todas as etapas"/><SeletorEntregavel itens={itens} valor={entregavel} onChange={setEntregavel} rotulo="Entregável" limiteRotulo={28} placeholder="Pesquisar entregável..."/></div>
        {!itens.length&&<p role="status" className="text-xs text-foreground/65">Nenhum entregável disponível para esta seleção. Escolha outra etapa ou origem.</p>}
        <p className="text-xs text-foreground/65">O registro será aberto com o entregável selecionado.</p>
        <div className="pi-rodape-formulario flex justify-end gap-2 border-t border-current/15 pt-3"><button type="button" className="rounded-lg border border-current/25 px-3 py-2 text-sm" onClick={()=>setAberto(false)}>Cancelar</button><button type="submit" data-pi-acao="primaria" disabled={!disponivel[origem]||!itens.some(i=>i.id===entregavel)||Boolean(etapas.erro||entregaveis.erro)} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green disabled:opacity-40">Continuar</button></div>
      </form>}
    </ModalEtapa>}</>;
}
