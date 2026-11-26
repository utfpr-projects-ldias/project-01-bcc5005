import { saldoParcelas } from './saldo-execucao.js';
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { In, IsNull, type EntityManager } from 'typeorm';
import { Ocorrencia } from '../ocorrencias/ocorrencia.entity.js';
import { Entregavel } from '../entregaveis/entregavel.entity.js';
import { ExecucaoLancamento } from './execucao-lancamento.entity.js';
import { AtividadeEntity } from '../atividades/atividade.entity.js';
import { ComprovanteEvidencia } from '../entregaveis/comprovante-evidencia.entity.js';
import { EvidenciaEsperada } from '../entregaveis/evidencia-esperada.entity.js';
import { PermissaoContrato } from '../autorizacao/permissao-contrato.entity.js';
import { permissoesEfetivas } from '../autorizacao/permissoes-granulares.js';
import type { UsuarioAutenticado } from '../autorizacao/usuario-autenticado.js';

export function centesimos(valor: unknown): number {
  if (typeof valor !== 'string' || !/^\d{1,3}(?:\.\d{1,2})?$/.test(valor)) throw new BadRequestException('Informe percentual positivo com até duas casas decimais.');
  const [i,f=''] = valor.split('.'); const n=Number(i)*100+Number(f.padEnd(2,'0'));
  if (n<1 || n>10000) throw new BadRequestException('Informe um percentual maior que zero e até 100%.');
  return n;
}
export const percentualDireto = (tipo:string) => tipo==='UNICO'||tipo==='CONTINUO';
export const aceitaParcelas = (tipo:string) => percentualDireto(tipo)||tipo==='RECORRENTE';
export type ParcelaPublica = ExecucaoLancamento & { situacao:'PENDENTE'|'APROVADO'|'REJEITADO'|'INATIVO'; reconhecido:number; reservado:number; titulo:string; evidenciaId?:string; situacaoRegistro?:string };
export async function parcelas(m:EntityManager,e:Entregavel,atividadeIds?:string[]):Promise<ParcelaPublica[]> {
  if (!e.execucoesIntegradas || atividadeIds?.length===0) return [];
  const linhas=await m.find(ExecucaoLancamento,{where:{contratoId:e.contratoId,entregavelId:e.id,...(atividadeIds?{origem:'ATIVIDADE' as const,origemId:In(atividadeIds)}:{})},order:{dataExecucao:'DESC',criadoEm:'DESC',id:'DESC'}});
  const atividades = new Map<string,Promise<AtividadeEntity|null>>();
  return Promise.all(linhas.map(async l=>{
    let situacao:ParcelaPublica['situacao']=l.status, titulo='Registro manual', evidenciaId:string|undefined, situacaoRegistro:string|undefined;
    let aprovado=l.centesimosAprovados ?? l.centesimos;
    if(l.origem==='ATIVIDADE') {
      let consulta=atividades.get(l.origemId!);
      if(!consulta){consulta=m.findOne(AtividadeEntity,{where:{id:l.origemId!,contratoId:e.contratoId},relations:{entregaveis:true,ocorrencias:true}});atividades.set(l.origemId!,consulta);}
      const a=await consulta;
      titulo=a?.titulo??'Atividade não disponível';
      situacao=!a||a.excluidaEm||a.status==='ARQUIVADA'||(!a.entregaveis.some(x=>x.id===e.id)||(l.ocorrenciaId&&a.ocorrenciaId!==l.ocorrenciaId&&!a.ocorrencias?.some(x=>x.id===l.ocorrenciaId)))?'INATIVO':a.status==='VERIFICADA'?'APROVADO':'PENDENTE';
      situacaoRegistro=situacao==='INATIVO'?(a?.excluidaEm?'EXCLUIDO':a?.status==='ARQUIVADA'?'ARQUIVADO':'SEM_EFEITO'):a?.status;
      aprovado=l.centesimos;
    } else if(l.origem==='EVIDENCIA') {
      const c=await m.findOneBy(ComprovanteEvidencia,{id:l.origemId!,contratoId:e.contratoId,entregavelId:e.id});
      const ev=c?await m.findOneBy(EvidenciaEsperada,{id:c.evidenciaEsperadaId,entregavelId:e.id}):null;
      const atual=ev?await m.findOne(ComprovanteEvidencia,{where:{evidenciaEsperadaId:ev.id,contratoId:e.contratoId,entregavelId:e.id},order:{criadoEm:'DESC',id:'DESC'}}):null;
      titulo=c?.nomeOriginal??'Evidência não disponível'; evidenciaId=ev?.id;
      situacao=!c||!ev||ev.arquivadoEm||atual?.id!==c.id?'INATIVO':c.status==='REJEITADA'?'REJEITADO':c.status==='VERIFICADA'&&!ev.reabertoEm&&c.verificadoEm&&(l.centesimosAprovados!=null||l.referenciaId!=null)?'APROVADO':'PENDENTE';
      situacaoRegistro=situacao==='INATIVO'?(ev?.arquivadoEm?'ARQUIVADO':c&&atual&&atual.id!==c.id?'SUBSTITUIDO':'SEM_EFEITO'):ev?.reabertoEm||c?.status==='REJEITADA'?'EM_REVISAO':c?.status;
    }
    if(l.ocorrenciaId && !await m.findOneBy(Ocorrencia,{id:l.ocorrenciaId,contratoId:e.contratoId,entregavelId:e.id,substituidaEm:IsNull()})){situacao='INATIVO';situacaoRegistro=situacaoRegistro==='ARQUIVADO'||situacaoRegistro==='EXCLUIDO'?situacaoRegistro:'SUBSTITUIDO';}
    return {...l,titulo,evidenciaId,situacao,situacaoRegistro,reconhecido:situacao==='APROVADO'&&!l.referenciaId?aprovado:0,reservado:situacao==='PENDENTE'&&!l.referenciaId?l.centesimos:0};
  }));
}
export async function resumoParcelas(m:EntityManager,e:Entregavel) {
  const itens=await parcelas(m,e), base=Math.round(Number(e.percentualExecucao??0)*100);
  const ids=[...new Set(itens.flatMap(i=>i.ocorrenciaId?[i.ocorrenciaId]:[]))];
  const saldosOcorrencias=ids.map(id=>({id,...saldoParcelas(e.tipo==='CONTINUO'?base:0,itens.filter(i=>i.ocorrenciaId===id))}));
  return {...saldoParcelas(base,e.tipo==='RECORRENTE'?[]:itens),base,itens,saldosOcorrencias};
}
export async function percentualComParcelas(m:EntityManager,e:Entregavel):Promise<number|null> {
  if (!e.execucoesIntegradas||!percentualDireto(e.tipo)) return e.percentualExecucao==null?null:Number(e.percentualExecucao);
  const r=await resumoParcelas(m,e);
  return r.reconhecido>10000?null:r.reconhecido/100;
}
async function carregarParcelasOcorrencia(m:EntityManager,o:Ocorrencia){
  const e=await m.findOneBy(Entregavel,{id:o.entregavelId,contratoId:o.contratoId});
  return e ? {e,r:await resumoParcelas(m,e)} : null;
}
export type CacheParcelasOcorrencia = Map<string,ReturnType<typeof carregarParcelasOcorrencia>>;
export async function resumoPercentualOcorrencia(m:EntityManager,o:Ocorrencia,cache?:CacheParcelasOcorrencia){
  if(!o.execucoesPercentuais)return null;
  const chave=`${o.contratoId}:${o.entregavelId}`;
  let promessa=cache?.get(chave);
  if(!promessa){promessa=carregarParcelasOcorrencia(m,o);cache?.set(chave,promessa);}
  const dados=await promessa;
  if(!dados)return null;
  const {e,r}=dados;
  const saldo = r.saldosOcorrencias.find(s=>s.id===o.id) ?? saldoParcelas(e.tipo==='CONTINUO'?r.base:0,[]);
  const itens=r.itens.filter(i=>i.ocorrenciaId===o.id);
  return {...saldo, emRevisao:itens.some(i=>i.situacao==='REJEITADO'),pendente:itens.some(i=>i.situacao==='PENDENTE')};
}
export async function exigirOcorrenciaParcela(m:EntityManager,e:Entregavel,id:string|null|undefined){
  if(e.tipo==='UNICO'){if(id)throw new ConflictException('Entregável único não recebe ocorrência.');return null;}
  if(e.tipo==='CONTINUO'&&!id && !await m.findOneBy(Ocorrencia,{contratoId:e.contratoId,entregavelId:e.id,substituidaEm:IsNull()}))return null;
  if(!id)throw new ConflictException('Selecione a ocorrência descritiva de destino.');
  const o=await m.findOneBy(Ocorrencia,{id,contratoId:e.contratoId,entregavelId:e.id,substituidaEm:IsNull()});
  if(!o||o.modoRegistro!=='DESCRITIVO'||['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(o.status))throw new ConflictException('A ocorrência não está disponível para novos lançamentos percentuais.');
  return o;
}
export async function exigirPermissaoParcela(m:EntityManager,contratoId:string,ator:UsuarioAutenticado,aprovar=false) {
  if(ator.perfil==='ADMINISTRADOR')return;
  const v=await m.findOneBy(PermissaoContrato,{contratoId,usuarioId:ator.id});
  if(!v||!permissoesEfetivas(ator.perfil,v.podeEditar,v.permissoesDetalhadas)[aprovar?'aprovarExecucaoManual':'editarExecucaoFisica']) throw new ForbiddenException('Sem permissão para esta operação de execução.');
}
/** Chamado sob o mesmo lock contratual da operação de origem. */
export async function criarParcela(m:EntityManager,e:Entregavel,ator:UsuarioAutenticado,dados:{origem:ExecucaoLancamento['origem'];origemId?:string;valor?:string;referenciaId?:string;data:string;ocorrenciaId?:string;observacao?:string|null;id?:string;pedidoOriginal?:import('./pedido-manual.js').PedidoManual}) {
  if(!aceitaParcelas(e.tipo)||e.arquivadoEm||['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??'')) throw new ConflictException('Este entregável não permite parcelas percentuais diretas.');
  if(Boolean(dados.referenciaId)===Boolean(dados.valor))throw new BadRequestException('Informe nova contribuição ou uma referência, não ambas.');
  const o=await exigirOcorrenciaParcela(m,e,dados.ocorrenciaId);
  const r=await resumoParcelas(m,e);
  const saldo=o&&e.tipo==='RECORRENTE'?(r.saldosOcorrencias.find(s=>s.id===o.id)?.saldo??10000):r.saldo;
  if(dados.referenciaId){if(dados.origem==='MANUAL'||!r.itens.some(i=>i.id===dados.referenciaId&&i.reconhecido>0&&i.ocorrenciaId===(o?.id??null)))throw new ConflictException('Selecione uma execução reconhecida deste entregável.');}
  else await exigirPermissaoParcela(m,e.contratoId,ator);
  const n=dados.referenciaId?0:centesimos(dados.valor);
  if(n>saldo)throw new ConflictException('A contribuição excede o saldo disponível, incluindo registros pendentes.');
  const linha=m.create(ExecucaoLancamento,{...(dados.id?{id:dados.id}:{}),contratoId:e.contratoId,entregavelId:e.id,ocorrenciaId:o?.id??null,origem:dados.origem,origemId:dados.origemId??null,referenciaId:dados.referenciaId??null,centesimos:n,centesimosAprovados:null,status:'PENDENTE',dataExecucao:dados.data,observacao:dados.observacao??null,autorId:ator.id,autorNome:(ator.nome||ator.email).slice(0,255),decididoPor:null,decididoEm:null});
  // IDs de operações são fornecidos pelo cliente; INSERT nunca sobrescreve uma
  // parcela de outro contrato numa corrida de UUID. As demais origens têm ID gerado.
  if(dados.pedidoOriginal)linha.pedidoOriginal=dados.pedidoOriginal;
  let salvo:ExecucaoLancamento;
  if(dados.id){
    try { await m.insert(ExecucaoLancamento,linha); }
    catch(erro){if((erro as {code?:string}).code==='23505')throw new ConflictException('Identificador de lançamento já utilizado.');throw erro;}
    salvo=await m.findOneByOrFail(ExecucaoLancamento,{id:dados.id,contratoId:e.contratoId,entregavelId:e.id});
  } else salvo=await m.save(ExecucaoLancamento,linha);
  if(!e.execucoesIntegradas){await m.update(Entregavel,{id:e.id,contratoId:e.contratoId},{execucoesIntegradas:true});e.execucoesIntegradas=true;}
  if(o&&!o.execucoesPercentuais)await m.update(Ocorrencia,{id:o.id,contratoId:e.contratoId},{execucoesPercentuais:true});
  return salvo;
}
export async function validarSaldoParcelas(m:EntityManager,e:Entregavel) {
  if(!e.execucoesIntegradas)return;
  const r=await resumoParcelas(m,e);
  if(r.reconhecido+r.reservado>10000||r.saldosOcorrencias.some(s=>s.reconhecido+s.reservado>10000))throw new ConflictException('O registro excederia o saldo de execução disponível.');
}
