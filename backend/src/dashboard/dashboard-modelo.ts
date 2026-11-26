import type { Contrato } from '../contratos/contrato.entity.js';
import type { ExecucaoService } from '../execucao/execucao.service.js';
import type { EntregaveisService } from '../entregaveis/entregaveis.service.js';
import type { Etapa } from '../etapas/etapa.entity.js';
import type { Entregavel } from '../entregaveis/entregavel.entity.js';
import type { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';

export type Progresso = Awaited<ReturnType<ExecucaoService['consultar']>>;
export type Documental = Awaited<ReturnType<EntregaveisService['resumoDocumental']>>;
export type Prazo = { tipo: 'ETAPA' | 'ENTREGAVEL' | 'OCORRENCIA'; id: string; entregavelId: string | null; nome: string; data: string; atrasado: boolean; aberto: boolean };
export type Alerta = { tipo: 'ATRASO' | 'PRAZO_PROXIMO' | 'EVIDENCIA_PENDENTE' | 'COMPROVACAO_INCOMPLETA' | 'ENCERRAMENTO_PROXIMO' | 'VIGENCIA_VENCIDA'; severidade: 'Atenção' | 'Prioritário'; objeto: 'CONTRATO' | Prazo['tipo']; id: string; entregavelId: string | null; data: string | null; motivo: string };
export const FINAL_CONTRATO = ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO'];
/** Mesmo agrupamento da carteira: encerramento não equivale a execução integral. */
export const finalizado = (c: Pick<Contrato, 'status' | 'arquivadoEm' | 'reabertoEm'>) =>
  !c.arquivadoEm && !c.reabertoEm && FINAL_CONTRATO.includes(c.status);
const FINAL_ITEM = ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADA','CONCLUIDA','FINALIZADA'];
export const ativo = (c: Contrato) => !c.arquivadoEm && !['CANCELADO','SUSPENSO'].includes(c.status) && (!FINAL_CONTRATO.includes(c.status) || Boolean(c.reabertoEm));
export const diasEntre = (inicio: string, fim: string) => Math.round((Date.parse(`${fim}T00:00:00Z`) - Date.parse(`${inicio}T00:00:00Z`))/86400000);
const pendente = (status: string, reaberto = false) => reaberto || !FINAL_ITEM.includes(status);
export function projetarContrato(c: Contrato, progresso: Progresso, documental: Documental, etapas: Etapa[], ocorrencias: Ocorrencia[], atividades: { total: number; verificadas: number }, hoje: string, limite: number, metadados: Pick<Entregavel,'id'|'etapaId'|'unidadeMedida'>[] = [], responsavel: string | null = null) {
  const abertos = progresso.entregaveis.filter(e => pendente(e.statusEntregavel, Boolean(e.reabertoEm || e.regularizacaoDocumentalSolicitada)));
  const ativosIds = new Set(progresso.entregaveis.map(e => e.entregavelId));
  const prazos: Prazo[] = [];
  function prazo(tipo: Prazo['tipo'], id: string, entregavelId: string | null, nome: string, data: string | null, aberto: boolean, atrasoCalculado?:boolean) {
    if (data) prazos.push({tipo,id,entregavelId,nome,data,aberto,atrasado:aberto && (atrasoCalculado??data < hoje)});
  }
  for (const e of etapas) prazo('ETAPA',e.id,null,e.nome,e.terminoPrevisto,pendente(e.status,Boolean(e.reabertoEm)));
  for (const e of progresso.entregaveis) prazo('ENTREGAVEL',e.entregavelId,e.entregavelId,e.nome,e.terminoPrevisto,abertos.includes(e),e.tipo==='CONTINUO'?false:undefined);
  for (const o of ocorrencias) if (ativosIds.has(o.entregavelId)) prazo('OCORRENCIA',o.id,o.entregavelId,o.titulo,o.dataPrevista ?? o.periodoFim,pendente(o.status));
  prazos.sort((a,b)=>a.data.localeCompare(b.data)||a.nome.localeCompare(b.nome,'pt-BR')||a.id.localeCompare(b.id));
  const alertas: Alerta[] = [];
  const diasRestantes = diasEntre(hoje,c.terminoVigencia);
  // Suspensão não congela nem reprograma o calendário. Cancelados/arquivados ficam fora da carteira operacional.
  const monitorar = !c.arquivadoEm && c.status !== 'CANCELADO' && (!FINAL_CONTRATO.includes(c.status)||Boolean(c.reabertoEm));
  if (monitorar) {
    for (const p of prazos) {
      if (p.aberto && (p.atrasado || (p.data>=hoje && diasEntre(hoje,p.data)<=limite))) alertas.push({tipo:p.atrasado?'ATRASO':'PRAZO_PROXIMO',severidade:p.atrasado?'Prioritário':'Atenção',objeto:p.tipo,id:p.id,entregavelId:p.entregavelId,data:p.data,motivo:p.atrasado?`${p.nome} — prazo vencido`:`${p.nome} — prazo próximo`});
    }
    if (diasRestantes <= limite) alertas.push({tipo:diasRestantes<0?'VIGENCIA_VENCIDA':'ENCERRAMENTO_PROXIMO',severidade:diasRestantes<0?'Prioritário':'Atenção',objeto:'CONTRATO',id:c.id,entregavelId:null,data:c.terminoVigencia,motivo:diasRestantes<0?'Vigência vencida':'Término da vigência próximo'});
  }
  let evidenciasTotal=0,evidenciasVerificadas=0,exigencias=0,atendidas=0;
  const documentalDisponivel=progresso.entregaveis.every(e=>Boolean(documental[e.entregavelId]));
  for (const e of progresso.entregaveis) {
    const d=documental[e.entregavelId]; if (!d) continue;
    evidenciasTotal+=d.total; evidenciasVerificadas+=d.verificadasTotal;
    exigencias+=d.exigenciasDocumentaisTotal; atendidas+=d.exigenciasDocumentaisAtendidas;
    if (!c.arquivadoEm && c.status!=='CANCELADO' && d.exigenciasDocumentaisAtendidas<d.exigenciasDocumentaisTotal) {
      const incompleta=e.percentualExecucao===100 || e.statusEntregavel==='CONCLUIDO_PARCIALMENTE' || d.exigenciasDocumentaisAtendidas>0;
      alertas.push({tipo:incompleta?'COMPROVACAO_INCOMPLETA':'EVIDENCIA_PENDENTE',severidade:e.percentualExecucao===100?'Prioritário':'Atenção',objeto:'ENTREGAVEL',id:e.entregavelId,entregavelId:e.entregavelId,data:e.terminoPrevisto,motivo:`${e.nome} — ${d.exigenciasDocumentaisAtendidas} de ${d.exigenciasDocumentaisTotal} exigências atendidas`});
    }
  }
  const proximas = monitorar ? prazos.filter(p=>p.aberto && p.data>=hoje && diasEntre(hoje,p.data)<=limite) : [];
  const atrasos = monitorar ? prazos.filter(p=>p.atrasado) : [];
  const {id,codigoPublico,numeroContrato,orgaoContratante,objeto,inicioVigencia,terminoVigencia,status,arquivadoEm,reabertoEm,conclusaoSolicitadaEm,conclusaoParcialSolicitada,encerramentoSolicitado}=c;
  return { responsavel, contrato:{id,codigoPublico,numeroContrato,orgaoContratante,objeto,inicioVigencia,terminoVigencia,status,arquivadoEm,reabertoEm,conclusaoSolicitadaEm,conclusaoParcialSolicitada,encerramentoSolicitado}, ativo:ativo(c), diasRestantes, avanco:progresso.configuracaoPendente?null:progresso.avanco, configuracaoPendente:progresso.configuracaoPendente,
    etapas:{total:etapas.length,concluidas:etapas.filter(e=>!pendente(e.status,Boolean(e.reabertoEm))).length},
    entregaveis:{total:progresso.entregaveis.length,pendentes:abertos.length,concluidos:progresso.entregaveis.filter(e=>!abertos.includes(e)&&['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(e.statusEntregavel)).length,emAndamento:abertos.filter(e=>e.statusEntregavel==='EM_ANDAMENTO').length,atrasados:abertos.filter(e=>e.atrasado).length},
    atividades, evidencias:documentalDisponivel?{feitas:evidenciasVerificadas,total:evidenciasTotal}:null, comprovacao:documentalDisponivel?{feitas:atendidas,total:exigencias}:null,
    proxima:monitorar?prazos.find(p=>p.aberto&&p.data>=hoje)??null:null, proximas:proximas.length, atrasos:atrasos.length, alertas, prazos,
    matriz:progresso.entregaveis.map(e=>{const meta=metadados.find(m=>m.id===e.entregavelId);const d=documental[e.entregavelId];return {...e,etapa:etapas.find(et=>et.id===meta?.etapaId)?.nome??null,unidadeMedida:meta?.unidadeMedida??null,comprovacao:d?.situacaoComprovacao??null,exigenciasDocumentais:d?{feitas:d.exigenciasDocumentaisAtendidas,total:d.exigenciasDocumentaisTotal}:null};}) };
}
export type LinhaDashboard = ReturnType<typeof projetarContrato>;
export function resumirCarteira(linhas: LinhaDashboard[], limite: number) {
  const ativos=linhas.filter(l=>l.ativo);
  const calculaveis=ativos.filter(l=>l.avanco!==null);
  return { ativos:ativos.length, planejamento:ativos.filter(l=>l.contrato.status==='PLANEJAMENTO').length,
    encerramento:ativos.filter(l=>l.diasRestantes>=0&&l.diasRestantes<=limite).length,
    atrasados:ativos.filter(l=>l.atrasos>0).length, concluidos:linhas.filter(l=>finalizado(l.contrato)).length,
    pendentes:ativos.reduce((s,l)=>s+l.entregaveis.pendentes,0), proximas:ativos.reduce((s,l)=>s+l.proximas,0),
    avanco:calculaveis.length?calculaveis.reduce((s,l)=>s+(l.avanco??0),0)/calculaveis.length:null, baseAvanco:calculaveis.length };
}
