'use client';
import { CampoDuracao } from './campo-duracao';

import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useCallback, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { MedicoesDiretas, type MedicaoDireta } from './medicoes-diretas';
import { SeletorVinculosMultiplos } from './seletor-vinculos-multiplos';
import { SeletorEntregavel } from '@/app/ocorrencias/components/seletor-entregavel';
import { SeletorOcorrencia } from './seletor-ocorrencia';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { CampoDataCivil } from '@/app/components/campo-data-civil';
import {CampoContribuicaoDisponivel} from '@/app/contratos/components/campo-contribuicao-disponivel';
import { ModalContribuicaoDestino } from '@/app/contratos/components/modal-contribuicao-destino';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { SeletorResponsavel, type OpcaoResponsavel } from '@/app/contratos/components/seletor-responsavel';
import { useAcessoContrato, useContrato, useListaContratos } from '@/hooks/use-contratos';
import { valorContribuicaoValido } from '@/lib/validacao-contribuicao';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { pesquisarResponsaveisAtividade, useAtividades, type DadosAtividade } from '@/hooks/use-atividades';
import { criarCompartilhada, type VinculoCompartilhado } from '@/lib/atividades-compartilhadas';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { atividadeSchema, TIPOS_ATIVIDADE, type FormularioAtividade } from '@/lib/validacao-atividade';

const vazio = (entregavelId: string): FormularioAtividade => ({
  titulo: '', dataHora: '', descricao: '', tipo: 'Reunião', responsavel: '',
  participantes: '', local: '', duracao: '', observacoes: '', quantidadeExecucao: null, ocorrenciaIds: [], medicoes: [],
  entregavelIds: entregavelId ? [entregavelId] : [],
});
const vinculoVazio=(contratoId:string):VinculoCompartilhado=>({contratoId,entregavelIds:[],ocorrenciaIds:[],medicoes:[]});
function VinculoAdicional({vinculo,nome,aba,onChange}:{vinculo:VinculoCompartilhado;nome:string;aba:'entregaveis'|'ocorrencias'|'medicoes';onChange:(v:VinculoCompartilhado)=>void}){
  const [alvo,setAlvo]=useState<string|null>(null); const [periodo,setPeriodo]=useState<string>('');
  const acesso=useAcessoContrato(vinculo.contratoId),perfil=useMeuPerfil();
  const permitido=Boolean(perfil.dados?.ativo&&!acesso.erro&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.registrarAtividades));
  const entregaveis=useEntregaveis(vinculo.contratoId,permitido),etapas=useEtapas(vinculo.contratoId,permitido),agenda=useOcorrencias(vinculo.contratoId,permitido);
  if(!permitido)return aba==='medicoes'?null:<p role="status" className="text-xs text-foreground/70">{nome}: {acesso.carregando?'Consultando acesso…':'Sem autorização para registrar.'}</p>;
  const abertas=new Set((etapas.dados??[]).filter(e=>!e.arquivadoEm&&!e.conclusaoSolicitadaEm&&!e.encerramentoSolicitadoEm&&!['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(e.status)).map(e=>e.id));
  const opcoes=(entregaveis.dados??[]).filter(e=>!e.arquivadoEm&&abertas.has(e.etapaId)&&!['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??''));
  const podePercentual=Boolean(perfil.dados?.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.editarExecucaoFisica);
  const destinos=opcoes.filter(e=>vinculo.entregavelIds.includes(e.id)&&(e.tipo==='UNICO'||['RECORRENTE','CONTINUO'].includes(e.tipo)&&agenda.ocorrencias.some(o=>o.entregavelId===e.id&&o.modoRegistro==='DESCRITIVO'&&vinculo.ocorrenciaIds.includes(o.id))));

  const podeVincular=perfil.dados?.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.vincularAtividadesOcorrencia;
  const podeMedir=perfil.dados?.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.registrarExecucaoOcorrencia;
  const eAlvo=opcoes.find(e=>e.id===alvo);
  const idsAlvo=new Set(agenda.ocorrencias.filter(o=>o.entregavelId===alvo).map(o=>o.id));
  const resumo=(id:string)=>[...(vinculo.medicoesDiretas??[]).filter(m=>m.entregavelId===id).map(m=>`${m.quantidade} ${opcoes.find(e=>e.id===id)?.unidadeMedida??'unidades'}`),...vinculo.medicoes.filter(m=>agenda.ocorrencias.some(o=>o.id===m.ocorrenciaId&&o.entregavelId===id)&&Number(m.quantidade)>0).map(m=>`${m.quantidade} ${opcoes.find(e=>e.id===id)?.unidadeMedida??'unidades'}`),...(vinculo.parcelasPercentuais??[]).filter(p=>p.entregavelId===id).map(p=>`${p.percentual}%`)].join(' · ');
  return <div className="space-y-2 min-w-0">{aba==='medicoes'&&podePercentual&&!agenda.loading&&!agenda.erro&&<MedicoesDiretas entregaveis={opcoes} ocorrencias={agenda.ocorrencias} selecionados={vinculo.entregavelIds} valores={vinculo.medicoesDiretas??[]} onChange={medicoesDiretas=>onChange({...vinculo,medicoesDiretas})}/>}{aba==='entregaveis'?<SeletorVinculosMultiplos rotulo={`Entregáveis de ${nome}`} placeholder="Localizar entregável…" itens={opcoes.map(e=>({id:e.id,nome:e.nome,detalhe:etapas.dados?.find(t=>t.id===e.etapaId)?.nome,contribuicao:resumo(e.id)}))} onConfigurar={podePercentual||podeMedir?setAlvo:undefined} valores={vinculo.entregavelIds} onChange={ids=>{const validas=new Set(agenda.ocorrencias.filter(o=>ids.includes(o.entregavelId)).map(o=>o.id));onChange({...vinculo,entregavelIds:ids,ocorrenciaIds:vinculo.ocorrenciaIds.filter(id=>validas.has(id)),medicoes:vinculo.medicoes.filter(m=>validas.has(m.ocorrenciaId)),medicoesDiretas:vinculo.medicoesDiretas?.filter(m=>ids.includes(m.entregavelId)),parcelasPercentuais:vinculo.parcelasPercentuais?.filter(p=>ids.includes(p.entregavelId)),...(!ids.includes(vinculo.entregavelExecucaoId??'')?{entregavelExecucaoId:undefined,percentualExecucao:undefined,ocorrenciaExecucaoId:undefined}:{})});}}/>:aba==='ocorrencias'&&!podeVincular?<p className="text-xs text-foreground/65">Sem permissão para vincular ocorrências.</p>:aba==='medicoes'&&!podeMedir?<p className="text-xs text-foreground/65">Sem permissão para registrar quantidades.</p>:<SeletorOcorrencia contratoId={vinculo.contratoId} entregavelIds={vinculo.entregavelIds} valores={vinculo.ocorrenciaIds} medicoes={vinculo.medicoes} somenteVinculos={aba==='ocorrencias'} somenteMedicoes={aba==='medicoes'} unidades={Object.fromEntries(opcoes.map(e=>[e.id,e.unidadeMedida||'unidades']))} onChange={()=>{}} onChangeMultiplas={ids=>onChange({...vinculo,ocorrenciaIds:ids,medicoes:vinculo.medicoes.filter(m=>ids.includes(m.ocorrenciaId)),parcelasPercentuais:vinculo.parcelasPercentuais?.filter(p=>!p.ocorrenciaId||ids.includes(p.ocorrenciaId)),...(!ids.includes(vinculo.ocorrenciaExecucaoId??'')?{ocorrenciaExecucaoId:undefined}:{})})} onMedicoesChange={medicoes=>onChange({...vinculo,medicoes})}/>} {eAlvo&&<ModalContribuicaoDestino nome={eAlvo.nome} fechar={()=>{setAlvo(null);setPeriodo('');}}>{podePercentual&&!agenda.loading&&!agenda.erro&&<MedicoesDiretas entregaveis={[eAlvo]} ocorrencias={agenda.ocorrencias} selecionados={[eAlvo.id]} valores={(vinculo.medicoesDiretas??[]).filter(m=>m.entregavelId===eAlvo.id)} onChange={ms=>onChange({...vinculo,medicoesDiretas:[...(vinculo.medicoesDiretas??[]).filter(m=>m.entregavelId!==eAlvo.id),...ms]})}/>}{podeMedir&&<SeletorOcorrencia somenteMedicoes contratoId={vinculo.contratoId} entregavelIds={[eAlvo.id]} valores={vinculo.ocorrenciaIds.filter(id=>idsAlvo.has(id))} medicoes={vinculo.medicoes.filter(m=>idsAlvo.has(m.ocorrenciaId))} unidades={{[eAlvo.id]:eAlvo.unidadeMedida??'unidades'}} onChange={()=>{}} onChangeMultiplas={()=>{}} onMedicoesChange={ms=>onChange({...vinculo,medicoes:[...vinculo.medicoes.filter(m=>!idsAlvo.has(m.ocorrenciaId)),...ms]})}/>}{podePercentual&&destinos.some(e=>e.id===eAlvo.id)&&<div className="space-y-2"><CampoContribuicaoDisponivel item={eAlvo} modo="percentual" origem="ATIVIDADE" ocorrenciaId={(vinculo.parcelasPercentuais?.find(p=>p.entregavelId===eAlvo.id)?.ocorrenciaId??(periodo||agenda.ocorrencias.find(o=>o.entregavelId===eAlvo.id&&o.modoRegistro==='DESCRITIVO'&&vinculo.ocorrenciaIds.includes(o.id)&&!o.substituidaEm)?.id))}   valor={vinculo.parcelasPercentuais?.find(p=>p.entregavelId===eAlvo.id)?.percentual??''} onValor={v=>onChange({...vinculo,parcelasPercentuais:[...(vinculo.parcelasPercentuais??[]).filter(p=>p.entregavelId!==eAlvo.id),...(v?[{entregavelId:eAlvo.id,percentual:v.replace(',','.'),ocorrenciaId:(vinculo.parcelasPercentuais?.find(p=>p.entregavelId===eAlvo.id)?.ocorrenciaId??(periodo||agenda.ocorrencias.find(o=>o.entregavelId===eAlvo.id&&o.modoRegistro==='DESCRITIVO'&&vinculo.ocorrenciaIds.includes(o.id)&&!o.substituidaEm)?.id))}]:[])]})}/>{eAlvo.tipo!=='UNICO'&&<SeletorEntregavel rotulo="Ocorrência de destino" itens={agenda.ocorrencias.filter(o=>o.entregavelId===eAlvo.id&&o.modoRegistro==='DESCRITIVO'&&vinculo.ocorrenciaIds.includes(o.id)).map(o=>({id:o.id,nome:o.titulo}))} valor={(vinculo.parcelasPercentuais?.find(p=>p.entregavelId===eAlvo.id)?.ocorrenciaId??(periodo||agenda.ocorrencias.find(o=>o.entregavelId===eAlvo.id&&o.modoRegistro==='DESCRITIVO'&&vinculo.ocorrenciaIds.includes(o.id)&&!o.substituidaEm)?.id))??''} onChange={id=>{setPeriodo(id);onChange({...vinculo,parcelasPercentuais:(vinculo.parcelasPercentuais??[]).filter(p=>p.entregavelId!==eAlvo.id)});}}/>}</div>}<p className="text-xs text-foreground/65">Reconhecimento após aprovação.</p></ModalContribuicaoDestino>}</div>;
}
const CAMPO = 'mt-1 w-full min-w-0 rounded-xl border border-brand-green/25 bg-background/80 px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon';

type Props = { contratoId: string; entregavelId?: string; origem?: HTMLElement | null; estadoContextual?: EstadoContextual;
  execucaoInicial?: { percentual?: string; comprovaExecucaoId?: string; ocorrenciaId?: string; quantidade?: string; referenciaQuantitativa?:string };
  onFechar: () => void; onSalvo?: () => void | Promise<unknown> };

/** Compartilhado com a consulta contratual: nunca redireciona para /atividades.
 * A API revalida contrato, etapas, entregáveis e permissões sob transação. */
export function ModalCadastroAtividade({ contratoId, entregavelId = '', origem, onFechar, onSalvo, execucaoInicial, estadoContextual = 'normal' }: Props) {
  const [form, setForm] = useState<FormularioAtividade>(() => ({...vazio(entregavelId), ...(execucaoInicial?.ocorrenciaId ? {ocorrenciaIds:[execucaoInicial.ocorrenciaId], medicoes:execucaoInicial.referenciaQuantitativa ? [{ocorrenciaId:execucaoInicial.ocorrenciaId,quantidade:"0"}] : execucaoInicial.quantidade ? [{ocorrenciaId:execucaoInicial.ocorrenciaId,quantidade:execucaoInicial.quantidade}] : []} : {})}));
  const perfil=useMeuPerfil();const contrato=useContrato(contratoId);const cache=useRepositorioConsultasOpcional();
  const [adicionais,setAdicionais]=useState<VinculoCompartilhado[]>([]);
  const contratos=useListaContratos();
  const [diretas,setDiretas]=useState<MedicaoDireta[]>([]);
  const [extra,setExtra]=useState<string|null>(null);
  const [buscaContrato,setBuscaContrato]=useState('');
  const [abaExtra,setAbaExtra]=useState<'entregaveis'|'ocorrencias'>('entregaveis');
  const adicionalAberto=adicionais.find(a=>a.contratoId===extra);
  const nomeContrato=(id:string)=>{const c=contratos.dados?.find(c=>c.id===id);return c?`Contrato ${c.numeroContrato}`:'Contrato selecionado';};
  const alterarAdicional=(v:VinculoCompartilhado)=>setAdicionais(atuais=>atuais.map(a=>a.contratoId===v.contratoId?v:a));
  const [responsavel,setResponsavel]=useState<OpcaoResponsavel|null>(null);
  const [responsavelAlterado,setResponsavelAlterado]=useState(false);
  const selecionadoResponsavel=responsavelAlterado?responsavel:(perfil.dados?.id?{id:perfil.dados.id,email:perfil.dados.email}:null);
  const buscarResponsavel=useCallback((termo:string,signal:AbortSignal)=>pesquisarResponsaveisAtividade(contratoId,termo,signal),[contratoId]);
  const [alvoContribuicao,setAlvoContribuicao]=useState<string|null>(null); const [periodoLocal,setPeriodoLocal]=useState<string>('');
  const [abaVinculos,setAbaVinculos]=useState<'contratos'|'entregaveis'|'ocorrencias'>('entregaveis');
  const [parcelasPercentuais,setParcelasPercentuais]=useState<NonNullable<DadosAtividade['parcelasPercentuais']>>(()=>execucaoInicial?.percentual?[{entregavelId,percentual:execucaoInicial.percentual,ocorrenciaId:execucaoInicial.ocorrenciaId}]:[]);
  const acesso = useAcessoContrato(contratoId);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [erros, setErros] = useState<Record<string, string>>({});
  const entregaveisConsulta = useEntregaveis(contratoId);
  const agenda = useOcorrencias(contratoId);
  const etapasConsulta = useEtapas(contratoId);
  const diario = useAtividades(contratoId, { page: 1, limit: 20 });
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e =>
    !e.arquivadoEm && !e.conclusaoSolicitadaEm && !e.encerramentoSolicitadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(e.status)).map(e => e.id));
  const elegiveis = (entregaveisConsulta.dados ?? []).filter(ent => !ent.arquivadoEm &&
    !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(ent.statusExecucao ?? '') && etapasAbertas.has(ent.etapaId));
  const origemNaoElegivel = Boolean(entregavelId && !elegiveis.some(e => e.id === entregavelId));

  const destinosPercentuais = elegiveis.filter(e=>form.entregavelIds.includes(e.id) && (e.tipo==='UNICO'||(['RECORRENTE','CONTINUO'].includes(e.tipo)&&agenda.ocorrencias.some(o=>o.entregavelId===e.id&&o.modoRegistro==='DESCRITIVO'&&!o.substituidaEm&&(form.ocorrenciaIds??[]).includes(o.id)))));

  const alvoEditor=elegiveis.find(e=>e.id===alvoContribuicao);
  const idsMedicaoAlvo=new Set(agenda.ocorrencias.filter(o=>o.entregavelId===alvoContribuicao).map(o=>o.id));
  const resumoContribuicao=(id:string)=>[...diretas.filter(d=>d.entregavelId===id).map(d=>`${d.quantidade} ${elegiveis.find(e=>e.id===id)?.unidadeMedida??'unidades'}`),...(form.medicoes??[]).filter(m=>agenda.ocorrencias.some(o=>o.id===m.ocorrenciaId&&o.entregavelId===id)&&Number(m.quantidade)>0).map(m=>`${m.quantidade} ${elegiveis.find(e=>e.id===id)?.unidadeMedida??'unidades'}`),...parcelasPercentuais.filter(p=>p.entregavelId===id).map(p=>`${p.percentual}%`)].join(' · ');

  const podeMedirLocal = Boolean(perfil.dados?.ativo && (perfil.dados.perfil==='ADMINISTRADOR' || acesso.dados?.permissoes?.registrarExecucaoOcorrencia));
  const podeEscolherPercentual = !execucaoInicial?.percentual && !execucaoInicial?.comprovaExecucaoId && !execucaoInicial?.quantidade && !execucaoInicial?.referenciaQuantitativa && !acesso.erro && (perfil.dados?.perfil==='ADMINISTRADOR'||!!acesso.dados?.permissoes.editarExecucaoFisica);

  async function salvar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    if (salvando) return;
    const parsed = atividadeSchema.safeParse(form);
    if (!parsed.success) {
      const mapa: Record<string, string> = {};
      for (const problema of parsed.error.issues) mapa[String(problema.path[0])] ??= problema.message;
      setErros(mapa); setErro('Confira os campos destacados.'); return;
    }
    if (origemNaoElegivel || parsed.data.entregavelIds.some(id => !elegiveis.some(e => e.id === id))) {
      setErro('Reabra o contrato, a etapa ou o entregável antes de registrar a atividade.'); return;
    }
    if ((execucaoInicial?.percentual || execucaoInicial?.comprovaExecucaoId) && !parsed.data.entregavelIds.includes(entregavelId)) {setErro('Preserve o vínculo do entregável que recebe a contribuição.');return;}
    if(execucaoInicial?.referenciaQuantitativa&&(!execucaoInicial.ocorrenciaId||!parsed.data.ocorrenciaIds?.includes(execucaoInicial.ocorrenciaId)||!parsed.data.entregavelIds.includes(entregavelId)||parsed.data.medicoes?.some(m=>m.ocorrenciaId===execucaoInicial.ocorrenciaId&&Number(m.quantidade)>0))){setErro('Preserve a ocorrência referenciada, sem acrescentar quantidade.');return;}
    if(execucaoInicial?.quantidade && !execucaoInicial.referenciaQuantitativa && (!execucaoInicial.ocorrenciaId || !parsed.data.ocorrenciaIds?.includes(execucaoInicial.ocorrenciaId) || !parsed.data.medicoes?.some(m=>m.ocorrenciaId===execucaoInicial.ocorrenciaId&&Number(m.quantidade)>0))) {setErro('Mantenha a ocorrência e informe sua quantidade, ou cancele para cadastrar sem contribuição.');return;}
    if(parcelasPercentuais.some(p=>!destinosPercentuais.some(e=>e.id===p.entregavelId)||(!execucaoInicial?.percentual&&!podeEscolherPercentual)||!valorContribuicaoValido(p.percentual,false,10000)||(destinosPercentuais.find(e=>e.id===p.entregavelId)?.tipo!=='UNICO'&&!agenda.ocorrencias.some(o=>o.id===p.ocorrenciaId&&o.entregavelId===p.entregavelId&&o.modoRegistro==='DESCRITIVO'&&(form.ocorrenciaIds??[]).includes(o.id))))){setErro('Confira o percentual e a ocorrência de cada entregável.');return;}

    if(adicionais.length&&(execucaoInicial?.comprovaExecucaoId||execucaoInicial?.referenciaQuantitativa)){setErro('Contribuições percentuais e comprovações referenciadas precisam ser registradas no contrato de origem.');return;}
    if(adicionais.some(v=>!v.entregavelIds.length||v.medicoes.some(m=>!/^\d{1,12}(?:\.\d{1,3})?$/.test(m.quantidade)))){setErro('Selecione ao menos um entregável em cada contrato e confira as quantidades.');return;}
    if(!podeMedirLocal && (parsed.data.medicoes??[]).some(m=>Number(m.quantidade)>0)){setErro('Sem permissão para registrar execução em ocorrências.');return;}
    const medicoesDiretas=diretas.filter(d=>parsed.data.entregavelIds.includes(d.entregavelId)&&Number(d.quantidade)>0);
    if(diretas.some(d=>parsed.data.entregavelIds.includes(d.entregavelId)&&!/^\d{1,15}(?:\.\d{1,3})?$/.test(d.quantidade))||adicionais.some(v=>(v.medicoesDiretas??[]).some(d=>!/^\d{1,15}(?:\.\d{1,3})?$/.test(d.quantidade)||Number(d.quantidade)<=0)||(v.parcelasPercentuais??[]).some(p=>!valorContribuicaoValido(p.percentual,false,10000)))){setErro('Confira as contribuições de todos os contratos.');return;}
    const dados: DadosAtividade = { ...parsed.data, contratoId, medicoesDiretas, ...(responsavelAlterado&&selecionadoResponsavel?{responsavelId:selecionadoResponsavel.id}:{}),
      ...(execucaoInicial?.referenciaQuantitativa ? {referenciaQuantitativa:execucaoInicial.referenciaQuantitativa,ocorrenciaReferenciaId:execucaoInicial.ocorrenciaId}:{}),
      parcelasPercentuais:parcelasPercentuais.map(p=>({...p,percentual:p.percentual.replace(',','.')})),
      ...(execucaoInicial?.comprovaExecucaoId ? {comprovaExecucaoId:execucaoInicial.comprovaExecucaoId,entregavelExecucaoId:entregavelId,ocorrenciaExecucaoId:execucaoInicial.ocorrenciaId} : {}),
      dataHora: new Date(parsed.data.dataHora).toISOString(),
      participantes: parsed.data.participantes.split(',').map(s => s.trim()).filter(Boolean),
    };
    setSalvando(true); setErro(''); setErros({});
    try {
      if(adicionais.length){
        const vinculos=[{contratoId,entregavelIds:parsed.data.entregavelIds,ocorrenciaIds:parsed.data.ocorrenciaIds??[],medicoes:parsed.data.medicoes??[],medicoesDiretas,parcelasPercentuais:dados.parcelasPercentuais},...adicionais];
        await criarCompartilhada({titulo:dados.titulo,dataHora:dados.dataHora,descricao:dados.descricao,tipo:dados.tipo,participantes:dados.participantes,responsavel:dados.responsavel,responsavelId:dados.responsavelId,local:dados.local,duracao:dados.duracao,observacoes:dados.observacoes,vinculos});
        for(const v of vinculos){cache?.invalidar(['atividades',v.contratoId]);cache?.invalidar(['ocorrencias',v.contratoId]);cache?.invalidar(['execucao',v.contratoId]);cache?.invalidar(['entregaveis','contrato',v.contratoId]);cache?.invalidar(['etapas','contrato',v.contratoId]);cache?.invalidar(['contratos','elegibilidade-conclusao',v.contratoId]);window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada',{detail:{contratoId:v.contratoId}}));}
      }else await diario.criarAtividade(dados);
      onFechar(); await Promise.resolve().then(()=>onSalvo?.()).catch(() => {});
    }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível registrar a atividade.'); }
    finally { setSalvando(false); }
  }
  const campo = <K extends keyof FormularioAtividade>(nome: K, valor: FormularioAtividade[K]) =>
    setForm(prev => ({ ...prev, [nome]: valor }));

  return createPortal(<ModalEtapa estadoContextual={estadoContextual} titulo="Nova atividade" contexto="Diário de execução"
    ocupado={salvando} larguraFormulario="atividade" formularioHorizontal cabecalhoUmaLinha camada={entregavelId ? 'edicao' : 'principal'} focoRetorno={origem} onFechar={onFechar} rotuloFechar="Fechar cadastro de atividade">
    <form data-pi-formulario aria-label="Formulário de atividade" onSubmit={salvar} noValidate className="pi-form-atividade space-y-3">
      {erro && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-sm text-error-text">{erro}</p>}
      <div className="pi-form-colunas"><section className="min-w-0 space-y-3" aria-label="Dados da atividade">
      <div className="grid min-w-0 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,.55fr)]"><label className="block min-w-0 text-sm font-medium">Título *
        <input required maxLength={50} className={CAMPO} value={form.titulo} onChange={e => campo('titulo', e.target.value)} aria-invalid={Boolean(erros.titulo)} />
        <span className="block text-right text-[11px] text-foreground/50">{form.titulo.length}/50</span>
      {erros.titulo && <span className="block text-xs text-error-text">{erros.titulo}</span>}</label>
        <label className="block text-sm font-medium">Tipo *
          <select className={`${CAMPO} pi-select pr-10 max-w-[15rem]`} value={form.tipo} onChange={e => campo('tipo', e.target.value as FormularioAtividade['tipo'])}>
            {TIPOS_ATIVIDADE.map(tipo => <option key={tipo}>{tipo}</option>)}
          </select>
        </label>
      </div>
      <div className="pi-atividade-tempo"><label className="block min-w-0 text-sm font-medium">Data da atividade *
        <CampoDataCivil className={`${CAMPO} tec08-data-hora`} required value={form.dataHora.split('T')[0]??''} onChange={e=>campo('dataHora',`${e.target.value}T${form.dataHora.split('T')[1]??''}`)} aria-invalid={Boolean(erros.dataHora)}/></label>
        <label className="block min-w-0 text-sm font-medium">Horário *<input type="time" required className={`${CAMPO} tec08-data-hora`} value={form.dataHora.split('T')[1]??''} onChange={e=>campo('dataHora',`${form.dataHora.split('T')[0]??''}T${e.target.value}`)} aria-invalid={Boolean(erros.dataHora)}/></label>
        <label className="block min-w-0 text-sm font-medium">Duração<CampoDuracao className={CAMPO} valor={form.duracao} onValor={v=>campo('duracao',v)} /></label>
      </div>{erros.dataHora && <p className="text-xs text-error-text">{erros.dataHora}</p>}
      <label className="block min-w-0 text-sm font-medium">Descrição *
        <textarea required rows={2} maxLength={500} className={CAMPO} value={form.descricao} onChange={e => campo('descricao', e.target.value)} />
        <span className="block text-right text-[11px] text-foreground/50">{form.descricao.length}/500</span>
      </label>{erros.descricao && <p className="text-xs text-error-text">{erros.descricao}</p>}
      <label className="block min-w-0 text-sm font-medium">Participantes
        <input maxLength={500} placeholder="Separe por vírgulas" className={CAMPO} value={form.participantes} onChange={e => campo('participantes', e.target.value)} />
      </label>
      <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2">
        <SeletorResponsavel semprePesquisar rotulo="Responsável" valor={selecionadoResponsavel?.id??null} selecionado={selecionadoResponsavel} pesquisar={buscarResponsavel} desabilitado={salvando} onChange={(_,usuario)=>{setResponsavelAlterado(true);setResponsavel(usuario??null);}}/>
        <label className="block text-sm font-medium">Local<input maxLength={50} className={CAMPO} value={form.local} onChange={e => campo('local', e.target.value)} /></label>
      </div>
      <details className="text-sm text-foreground/70"><summary className="cursor-pointer">Observações (opcional)</summary>
        <label className="block mt-2"><span className="sr-only">Observações</span><textarea rows={2} maxLength={200} className={CAMPO} value={form.observacoes} onChange={e => campo('observacoes', e.target.value)} /><span className="block text-right text-[11px] text-foreground/55">{form.observacoes.length}/200</span></label>
      </details>
      {execucaoInicial?.referenciaQuantitativa && <p className="text-xs text-foreground/65">Comprovação de execução já reconhecida. Não acrescenta unidades à ocorrência.</p>}
      {execucaoInicial?.comprovaExecucaoId && <p className="text-sm text-foreground/70">Vinculada a uma execução existente, sem contribuição adicional.</p>}
        </section><section className="min-w-0 space-y-3" aria-label="Vínculos e execução">
      <div className="pi-atividade-vinculos-abas" role="group" aria-label="Vínculos da atividade">{(['contratos','entregaveis','ocorrencias'] as const).map(aba=><button key={aba} type="button" aria-pressed={abaVinculos===aba} onClick={()=>setAbaVinculos(aba)}>{aba==='contratos'?'Contratos':aba==='entregaveis'?'Entregáveis':'Ocorrências'}<span>{aba==='contratos'?1+adicionais.length:aba==='entregaveis'?form.entregavelIds.length:(form.ocorrenciaIds??[]).length}</span></button>)}</div>
      {abaVinculos==='contratos'&&<div className="space-y-2"><div className="pi-busca-vinculos"><label className="relative block"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></svg><input type="search" aria-label="Localizar contrato" placeholder="Localizar contrato…" className={`${CAMPO} pl-9`} value={buscaContrato} onChange={e=>setBuscaContrato(e.target.value)}/></label><span className="text-xs text-foreground/65">{1+adicionais.length} selecionado(s)</span></div>
      <div className="pi-vinculos-opcoes"><div className="pi-contrato-vinculo" data-selecionado="true"><strong>Contrato {contrato.dados?.numeroContrato??'atual'} · Atual</strong><span className="truncate text-xs text-foreground/65">{contrato.dados?.objeto}</span><span className="pi-vinculo-contadores">Entregáveis <b>{form.entregavelIds.length}</b> Ocorrências <b>{form.ocorrenciaIds?.length??0}</b></span></div>
      {!execucaoInicial?.comprovaExecucaoId&&!execucaoInicial?.referenciaQuantitativa&&(contratos.dados??[]).filter(c=>c.id!==contratoId&&!c.arquivadoEm&&!c.conclusaoSolicitadaEm&&['PLANEJAMENTO','EM_EXECUCAO'].includes(c.status)&&(`${c.numeroContrato} ${c.objeto}`.toLocaleLowerCase('pt-BR').includes(buscaContrato.toLocaleLowerCase('pt-BR'))||adicionais.some(v=>v.contratoId===c.id))).map(c=>{const v=adicionais.find(v=>v.contratoId===c.id);return <div key={c.id} className="pi-contrato-vinculo" data-selecionado={Boolean(v)}><button type="button" className="min-w-0 text-left" onClick={()=>{if(!v){if(adicionais.length>=19){setErro('Selecione no máximo 20 contratos.');return;}setAdicionais(a=>[...a,vinculoVazio(c.id)]);}setAbaExtra('entregaveis');setExtra(c.id);}}><strong className="block truncate">Contrato {c.numeroContrato}</strong><span className="block truncate text-xs text-foreground/65">{c.objeto}</span></button><div className="flex items-center justify-between gap-2">{v&&<button type="button" className="text-xs text-foreground/65 hover:underline" onClick={()=>setAdicionais(a=>a.filter(x=>x.contratoId!==c.id))}>Remover</button>}<span className="pi-vinculo-contadores ml-auto">Entregáveis <b>{v?.entregavelIds.length??0}</b> Ocorrências <b>{v?.ocorrenciaIds.length??0}</b></span></div>{v&&<span className="text-xs text-foreground/65">{v.parcelasPercentuais?.length?`${v.parcelasPercentuais.length} parcelas percentuais · `:''}{v.medicoes.length+(v.medicoesDiretas?.length??0)} medições quantitativas</span>}</div>;})}</div></div>}
      <div hidden={abaVinculos!=='entregaveis'} className="space-y-2" aria-label="Vincular ao(s) entregável(is)">
        {entregaveisConsulta.carregando || etapasConsulta.carregando ? <p role="status" className="text-sm">Carregando entregáveis...</p> :
          elegiveis.length === 0 ? <p role="alert" className="text-sm text-foreground/70">Nenhum entregável aberto e autorizado para o registro.</p> :
          <SeletorVinculosMultiplos rotulo="Pesquisar entregáveis para vínculo" placeholder="Localizar entregável…" itens={elegiveis.map(ent=>({id:ent.id,nome:ent.nome,detalhe:etapasConsulta.dados?.find(e=>e.id===ent.etapaId)?.nome,contribuicao:resumoContribuicao(ent.id)}))} onConfigurar={perfil.dados?.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.editarExecucaoFisica||acesso.dados?.permissoes?.registrarExecucaoOcorrencia?setAlvoContribuicao:undefined} valores={form.entregavelIds} onChange={ids=>{const validas=new Set(agenda.ocorrencias.filter(o=>ids.includes(o.entregavelId)).map(o=>o.id));setForm(prev=>({...prev,entregavelIds:ids,ocorrenciaIds:(prev.ocorrenciaIds??[]).filter(id=>validas.has(id)),medicoes:(prev.medicoes??[]).filter(m=>validas.has(m.ocorrenciaId)),ocorrenciaId:validas.has(prev.ocorrenciaId??'')?prev.ocorrenciaId:null,quantidadeExecucao:validas.has(prev.ocorrenciaId??'')?prev.quantidadeExecucao:null}));setParcelasPercentuais(ps=>ps.filter(p=>ids.includes(p.entregavelId)));setDiretas(ds=>ds.filter(d=>ids.includes(d.entregavelId)));}}/>}
{erros.entregavelIds && <p className="text-xs text-error-text">{erros.entregavelIds}</p>}
      </div>
      <div hidden={abaVinculos!=='ocorrencias'}>
      <SeletorOcorrencia somenteVinculos contratoId={contratoId} entregavelIds={form.entregavelIds}
        valor={form.ocorrenciaId} valores={form.ocorrenciaIds ?? []} medicoes={form.medicoes ?? []}
        unidades={Object.fromEntries((entregaveisConsulta.dados ?? []).map(ent => [ent.id, ent.unidadeMedida?.trim() || 'unidades']))}
        onMedicoesChange={medicoes => setForm(anterior => ({...anterior, medicoes}))}
        onChangeMultiplas={ids => {setParcelasPercentuais(ps=>ps.filter(p=>!p.ocorrenciaId||ids.includes(p.ocorrenciaId)));setForm(anterior => ({...anterior,
          ocorrenciaIds: ids,
          medicoes: (anterior.medicoes ?? []).filter(m => ids.includes(m.ocorrenciaId)),
          ocorrenciaId: ids.includes(anterior.ocorrenciaId ?? '') ? anterior.ocorrenciaId : null,
          quantidadeExecucao: ids.includes(anterior.ocorrenciaId ?? '') ? anterior.quantidadeExecucao : null,
        }));}}
        onChange={v => { campo('ocorrenciaId', v); campo('quantidadeExecucao', null); }} />
</div>
        </section>
      </div>
      {alvoEditor&&<ModalContribuicaoDestino nome={alvoEditor.nome} fechar={()=>{setAlvoContribuicao(null);setPeriodoLocal('');}}>
        {podeEscolherPercentual&&!agenda.loading&&!agenda.erro&&<MedicoesDiretas entregaveis={[alvoEditor]} ocorrencias={agenda.ocorrencias} selecionados={[alvoEditor.id]} valores={diretas.filter(d=>d.entregavelId===alvoEditor.id)} onChange={ds=>setDiretas(v=>[...v.filter(d=>d.entregavelId!==alvoEditor.id),...ds])}/>}
        {podeMedirLocal&&<SeletorOcorrencia somenteMedicoes contratoId={contratoId} entregavelIds={[alvoEditor.id]} valores={(form.ocorrenciaIds??[]).filter(id=>idsMedicaoAlvo.has(id))} medicoes={(form.medicoes??[]).filter(m=>idsMedicaoAlvo.has(m.ocorrenciaId))} unidades={{[alvoEditor.id]:alvoEditor.unidadeMedida??'unidades'}} onChange={()=>{}} onChangeMultiplas={()=>{}} onMedicoesChange={ms=>setForm(prev=>({...prev,medicoes:[...(prev.medicoes??[]).filter(m=>!idsMedicaoAlvo.has(m.ocorrenciaId)),...ms]}))}/>}
        {destinosPercentuais.some(e=>e.id===alvoEditor.id)&&(podeEscolherPercentual||parcelasPercentuais.some(p=>p.entregavelId===alvoEditor.id))&&<div className="space-y-2"><CampoContribuicaoDisponivel item={alvoEditor} modo="percentual" origem="ATIVIDADE" ocorrenciaId={(parcelasPercentuais.find(p=>p.entregavelId===alvoEditor.id)?.ocorrenciaId??(periodoLocal||agenda.ocorrencias.find(o=>o.entregavelId===alvoEditor.id&&o.modoRegistro==='DESCRITIVO'&&(form.ocorrenciaIds??[]).includes(o.id)&&!o.substituidaEm)?.id))}  valor={parcelasPercentuais.find(p=>p.entregavelId===alvoEditor.id)?.percentual??''} onValor={v=>setParcelasPercentuais(ps=>[...ps.filter(p=>p.entregavelId!==alvoEditor.id),...(v?[{entregavelId:alvoEditor.id,percentual:v,ocorrenciaId:alvoEditor.tipo==='UNICO'?undefined:(ps.find(p=>p.entregavelId===alvoEditor.id)?.ocorrenciaId??(periodoLocal||agenda.ocorrencias.find(o=>o.entregavelId===alvoEditor.id&&o.modoRegistro==='DESCRITIVO'&&(form.ocorrenciaIds??[]).includes(o.id)&&!o.substituidaEm)?.id))}]:[])])} />{alvoEditor.tipo!=='UNICO'&&<SeletorEntregavel rotulo="Ocorrência de destino" itens={agenda.ocorrencias.filter(o=>o.entregavelId===alvoEditor.id&&o.modoRegistro==='DESCRITIVO'&&(form.ocorrenciaIds??[]).includes(o.id)&&!o.substituidaEm).map(o=>({id:o.id,nome:o.titulo}))} valor={(parcelasPercentuais.find(p=>p.entregavelId===alvoEditor.id)?.ocorrenciaId??(periodoLocal||agenda.ocorrencias.find(o=>o.entregavelId===alvoEditor.id&&o.modoRegistro==='DESCRITIVO'&&(form.ocorrenciaIds??[]).includes(o.id)&&!o.substituidaEm)?.id))??''} onChange={id=>{setPeriodoLocal(id);setParcelasPercentuais(ps=>ps.filter(p=>p.entregavelId!==alvoEditor.id));}}/>}</div>}
        {!destinosPercentuais.some(e=>e.id===alvoEditor.id)&&!(alvoEditor.tipo==='QUANTITATIVO'&&!agenda.ocorrencias.some(o=>o.entregavelId===alvoEditor.id&&!o.substituidaEm))&&!agenda.ocorrencias.some(o=>o.entregavelId===alvoEditor.id&&o.modoRegistro==='QUANTITATIVO'&&(form.ocorrenciaIds??[]).includes(o.id))?<p className="text-sm text-foreground/65">Este entregável não permite contribuição física direta nesta configuração. Se houver ocorrências mensuráveis, vincule uma delas primeiro.</p>:<p className="text-xs text-foreground/65">A contribuição será contabilizada após aprovação.</p>}
      </ModalContribuicaoDestino>}
      <div className="flex justify-end gap-2 border-t border-brand-green/20 pt-4">
        <button data-pi-acao="secundaria" type="button" onClick={onFechar} disabled={salvando} className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300">Cancelar</button>
        <button data-pi-acao="primaria" type="submit" aria-busy={salvando} disabled={salvando || !elegiveis.length || origemNaoElegivel}
          className="min-h-10 min-w-36 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green">
          Registrar atividade</button>
      </div>
    </form>
    {adicionalAberto&&createPortal(<ModalEtapa titulo={nomeContrato(adicionalAberto.contratoId)} contexto="Vínculos da atividade" camada="edicao" larguraFormulario="atividade" ocupado={salvando} onFechar={()=>setExtra(null)}><div className="space-y-3"><section className="min-w-0 space-y-3"><div className="pi-atividade-vinculos-abas"><button type="button" aria-pressed={abaExtra==='entregaveis'} onClick={()=>setAbaExtra('entregaveis')}>Entregáveis <span>{adicionalAberto.entregavelIds.length}</span></button><button type="button" aria-pressed={abaExtra==='ocorrencias'} onClick={()=>setAbaExtra('ocorrencias')}>Ocorrências <span>{adicionalAberto.ocorrenciaIds.length}</span></button></div><VinculoAdicional vinculo={adicionalAberto} nome={nomeContrato(adicionalAberto.contratoId)} aba={abaExtra} onChange={alterarAdicional}/></section></div><div className="mt-4 flex justify-end"><button type="button" data-pi-acao="primaria" className="rounded-lg px-4 py-2 text-sm font-semibold" onClick={()=>setExtra(null)}>Concluir</button></div></ModalEtapa>,document.body)}
  </ModalEtapa>, document.body);
}
