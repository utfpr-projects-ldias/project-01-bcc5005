'use client';

import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { avisarMudancaAgendaOcorrencias } from '@/lib/inicio-temporal-ocorrencias';

/** Campos e enum fornecidos pela API HU09-01/02. */
export type StatusOcorrencia = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'PENDENTE_CONCLUSAO' | 'PENDENTE_ENCERRAMENTO' | 'EM_REVISAO' | 'CONCLUIDO' | 'CONCLUIDO_PARCIALMENTE' | 'PENDENTE_CONCLUSAO_PARCIAL' | 'ENCERRADA';
export type OrigemOcorrencia = 'RECORRENTE' | 'MANUAL_QUANTITATIVA' | 'MANUAL_DESCRITIVA';
export type Ocorrencia = {
  id: string; contratoId: string; entregavelId: string; titulo: string;
  periodoInicio: string | null; periodoFim: string | null;
  dataPrevista: string | null; dataRealizada: string | null;
  regularizacaoDocumentalSolicitada?: boolean;
  atrasado?: boolean; finalizadoComAtraso?: boolean;
  status: StatusOcorrencia; motivoEncerramento?: string | null; origem: OrigemOcorrencia; modoRegistro?: 'QUANTITATIVO' | 'DESCRITIVO';
  exigeAtividade?: boolean; minimoAtividadesVerificadas?:number; minimoEvidenciasVerificadas?:number; minimoFotos?:number|null; minimoRelatorios?:number|null; minimoEvidenciasLivres?:number|null; pesoPeriodo?:string|null; evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?: boolean;
  quantidadeManual?: number; quantidadeAtividadesRegistrada?: number; quantidadeAtividadesVerificada?: number;
  quantidadeExecutadaExata?: string; quantidadeRegistradaExata?: string; quantidadeRegistrada?: number; quantidadeRestante?: number | null; quantidadeDisponivel?: number | null; quantidadeDisponivelExata?:string|null; progressoPercentual?: number | null;
  atividadesVerificadas?: number; atividadesPendentes?: number; evidenciasFoto?: number; evidenciasRelatorio?: number; evidenciasOutras?: number;
  criteriosOperacionaisAtendidos?: boolean; documentacaoAtendida?: boolean; registrosExecucaoPendentes?: boolean;
  requisitosAtendidos?: boolean; metaAtingida?: boolean; situacaoComprovacao?: 'NAO_EXIGIDA'|'PARCIAL'|'APRESENTADA';
  quantidadeRealizada: string | null; metaQuantidade?: string | null; quantidadeExecutada?: string | null; quantidadeAprovada?: string | null; observacoes: string | null; substituidaEm?: string | null; atividades?: { id: string; titulo: string; status: string }[];
};
export type NovaOcorrenciaManual = {
  entregavelId: string; titulo: string; periodoInicio?: string;
  periodoFim?: string; dataPrevista?: string;
  quantidadeRealizada?: string; metaQuantidade?: string; exigeAtividade?:boolean; minimoAtividadesVerificadas?:number; minimoEvidenciasVerificadas?:number; minimoFotos?:number|null; minimoRelatorios?:number|null; minimoEvidenciasLivres?:number|null; pesoPeriodo?:string|null; evidenciaExigida?:'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?:boolean; modoRegistro?: 'QUANTITATIVO' | 'DESCRITIVO'; observacoes?: string;
};
export type ConfiguracaoOcorrencias = {
  entregavelId: string; contratoId: string;
  tipoOperacional: 'UNICO' | 'QUANTITATIVO' | 'RECORRENTE' | 'CONTINUO' | 'MARCO';
  quantidadePrevista: string | null; unidadeMedida: string | null;
  periodicidade: string | null; inicioPrevisto: string | null; terminoPrevisto: string | null; modoVisualizacao: 'LISTA' | 'CALENDARIO';
};
export type EdicaoOcorrencia = Partial<Pick<Ocorrencia, 'titulo' | 'dataPrevista' | 'dataRealizada' | 'status' | 'quantidadeRealizada' | 'observacoes' | 'exigeAtividade' | 'minimoAtividadesVerificadas' | 'minimoEvidenciasVerificadas' | 'minimoFotos' | 'minimoRelatorios' | 'minimoEvidenciasLivres' | 'pesoPeriodo' | 'evidenciaExigida' | 'permiteEncerramentoExcepcional'>>;

export type LancamentoOcorrencia = {id:string;versao?:string;quantidade:string;justificativa:string|null;criadoEm:string;criadoPor:string;alteradoEm:string|null;alteradoPor:string|null;bloqueadoEm:string|null;bloqueadoPor:string|null;situacao?:'APROVADO'|'PENDENTE'|'REJEITADO';dataExecucao?:string;observacao?:string|null};
export type ComprovanteOcorrencia = {id:string;esperadaId?:string;criadoEm?:string;nomeOriginal:string;tipoEvidencia:string;status:string;vinculado:boolean};
export type EventoHistoricoOcorrencia = {id:string;acao:string;registradoEm:string;ator?:string|null;autorNome?:string|null;dadosAnteriores:Record<string,unknown>|null;dadosPosteriores:Record<string,unknown>|null};
const rotaOcorrencia=(contratoId:string,ocorrenciaId:string)=>`${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias/${encodeURIComponent(ocorrenciaId)}`;
export class ErroOperacaoOcorrencia extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
async function chamadaJson<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{credentials:'include',cache:'no-store',...init,
    headers:{Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}});
  if(!r.ok)throw new ErroOperacaoOcorrencia(await mensagemErro(r,'Não foi possível atualizar a ocorrência.'), r.status);
  return await r.json() as T;
}
export const editarExigenciasOcorrencia=(c:string,o:string,dados:EdicaoOcorrencia)=>
  chamadaJson<Ocorrencia>(`${rotaOcorrencia(c,o)}/exigencias`,{method:'PATCH',body:JSON.stringify(dados)});
export const editarMetaOcorrencia=(c:string,o:string,metaQuantidade:string,justificativa?:string)=>
  chamadaJson<Ocorrencia>(`${rotaOcorrencia(c,o)}/meta`,{method:'PATCH',body:JSON.stringify({metaQuantidade,...(justificativa?.trim()?{justificativa:justificativa.trim()}: {})})});
export const editarPesoOcorrencia=(c:string,o:string,pesoPeriodo:string|null)=>
  chamadaJson<Ocorrencia>(`${rotaOcorrencia(c,o)}/peso`,{method:'PATCH',body:JSON.stringify({pesoPeriodo})});
export const listarLancamentosOcorrencia=(c:string,o:string)=>chamadaJson<LancamentoOcorrencia[]>(`${rotaOcorrencia(c,o)}/lancamentos`);
export const criarLancamentoOcorrencia=(c:string,o:string,id:string,quantidade:string,justificativa='',dados?:{data:string;observacao:string})=>
  chamadaJson<{id:string;quantidadeExecutada?:number;repetido?:boolean;excluido?:boolean}>(`${rotaOcorrencia(c,o)}/lancamentos`,{method:'POST',body:JSON.stringify({id,quantidade,justificativa,...dados})});
export const corrigirLancamentoOcorrencia=(c:string,o:string,id:string,quantidade:string,justificativa:string,dados?:{data:string;observacao:string;versaoEsperada?:string})=>
  chamadaJson<{id:string;quantidade:string}>(`${rotaOcorrencia(c,o)}/lancamentos/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({quantidade,justificativa,...dados})});
export const decidirLancamentoOcorrencia=(c:string,o:string,id:string,decisao:'APROVADO'|'REJEITADO',motivo?:string,versaoEsperada?:string)=>
  chamadaJson<{id:string;situacao:string}>(`${rotaOcorrencia(c,o)}/lancamentos/${encodeURIComponent(id)}/decidir`,{method:'POST',body:JSON.stringify({decisao,motivo,versaoEsperada})});
export const bloquearLancamentoOcorrencia=(c:string,o:string,id:string,bloqueado:boolean)=>
  chamadaJson<{id:string;bloqueado:boolean}>(`${rotaOcorrencia(c,o)}/lancamentos/${encodeURIComponent(id)}/bloqueio`,{method:'PATCH',body:JSON.stringify({bloqueado})});
export const excluirLancamentoOcorrencia=(c:string,o:string,id:string,justificativa:string)=>
  chamadaJson<{id:string;excluido:boolean}>(`${rotaOcorrencia(c,o)}/lancamentos/${encodeURIComponent(id)}`,{method:'DELETE',body:JSON.stringify({justificativa})});
export const listarComprovantesOcorrencia=(c:string,o:string)=>chamadaJson<{vinculadas:ComprovanteOcorrencia[];disponiveis:ComprovanteOcorrencia[]}>(`${rotaOcorrencia(c,o)}/evidencias`);
export const vincularComprovanteOcorrencia=(c:string,o:string,comprovanteId:string)=>chamadaJson<{vinculado:boolean}>(`${rotaOcorrencia(c,o)}/evidencias`,{method:'POST',body:JSON.stringify({comprovanteId})});
export const desvincularComprovanteOcorrencia=(c:string,o:string,comprovanteId:string)=>chamadaJson<{desvinculado:boolean}>(`${rotaOcorrencia(c,o)}/evidencias/${encodeURIComponent(comprovanteId)}`,{method:'DELETE'});
export const listarHistoricoOcorrencia=(c:string,o:string)=>chamadaJson<EventoHistoricoOcorrencia[]>(`${rotaOcorrencia(c,o)}/historico`);
export type Replanejamento = { inicioFuturo: string; terminoPrevisto: string; periodicidade: string; modoRegistro?: 'DESCRITIVO'|'QUANTITATIVO'; metaQuantidade?: string; unidadeMedida?: string; alterarPrazo?: boolean; confirmacao?: string };
export type ImpactoAgenda = {
  confirmacao: string;
  prazoAlterado?: {anterior: string | null; novo: string};
  substituir: {id: string; inicio: string; fim: string; possuiAtividades?: boolean}[];
  novas: {inicio: string; fim: string; pesoPeriodo?: string | null}[];
  criteriosHerdados?: {exigeAtividade: boolean; minimoAtividadesVerificadas: number;
    evidenciaExigida: string; minimoEvidenciasVerificadas: number;
    minimoFotos: number | null; minimoRelatorios: number | null; minimoEvidenciasLivres: number | null;
    permiteEncerramentoExcepcional: boolean; pesoPeriodo: string | null};
  modoRegistro?: 'DESCRITIVO'|'QUANTITATIVO'; metaQuantidade?: string | null;
  reativar: number; preservadas: number; total: number; aplicado: boolean;
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

async function mensagemErro(resposta: Response, padrao: string) {
  if (resposta.status === 401 || resposta.status === 403) return 'Você não tem permissão para esta operação.';
  if (resposta.status === 400 || resposta.status === 409) { try { const corpo = await resposta.json(); if (typeof corpo.message === 'string') return corpo.message; if (Array.isArray(corpo.message)) return corpo.message.filter((m:unknown)=>typeof m==='string').join(' · '); } catch { /* resposta sem mensagem */ } }
  if (resposta.status === 409) return 'Os dados foram alterados ou estão em conflito. Atualize a agenda.';
  if (resposta.status === 404) return 'Recurso não encontrado ou módulo HU09 ainda não disponível neste ambiente.';
  return `${padrao} (HTTP ${resposta.status}). Confira as migrations e os logs do backend.`;
}

export async function consultarConfiguracaoOcorrencias(contratoId: string, entregavelId: string): Promise<ConfiguracaoOcorrencias> {
  const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/configuracao`;
  const resposta = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível consultar a configuração de ocorrências.'));
  return await resposta.json() as ConfiguracaoOcorrencias;
}
export async function salvarConfiguracaoOcorrencias(contratoId: string, entregavelId: string, dados: Omit<ConfiguracaoOcorrencias, 'entregavelId' | 'contratoId'>) {
  const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/configuracao`;
  const resposta = await fetch(url, { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível salvar a configuração de ocorrências.'));
  return await resposta.json() as ConfiguracaoOcorrencias;
}

export function useOcorrencias(contratoId: string, habilitada = true) {
  const cache = useRepositorioConsultasOpcional();
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias`;
  const consulta = useConsulta(['ocorrencias', contratoId], async signal => {
    const resposta = await fetch(base, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível consultar a agenda do contrato.'));
    const dados: unknown = await resposta.json();
    if (Array.isArray(dados)) return dados as Ocorrencia[];
    if (dados && typeof dados === 'object' && 'data' in dados && Array.isArray(dados.data)) return dados.data as Ocorrencia[];
    throw new Error('A API devolveu um formato de agenda inválido.');
  }, { habilitada: Boolean(contratoId) && habilitada });
  const atualizarDependencias = async () => {
    cache?.invalidar(['ocorrencias', contratoId]);
    cache?.invalidar(['execucao', contratoId]);
    cache?.invalidar(['entregaveis', 'contrato', contratoId]);
    cache?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', {detail:{contratoId}}));
    }
    try { await consulta.atualizar(); } catch { /* Escrita confirmada; a consulta mantém seu próprio erro. */ }
  };
  return {
    consultarDetalhe: async (id: string) => {
      const r = await fetch(`${base}/${encodeURIComponent(id)}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) throw new Error(await mensagemErro(r,'Não foi possível consultar o detalhe.'));
      return await r.json() as Ocorrencia;
    },
    replanejar: async (entregavelId: string, dados: Replanejamento): Promise<ImpactoAgenda> => {
      const r = await fetch(`${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/replanejar`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'},body:JSON.stringify(dados) });
      if (!r.ok) throw new Error(await mensagemErro(r,'Não foi possível replanejar.'));
      const impacto = await r.json() as ImpactoAgenda;
      if (impacto.aplicado) { avisarMudancaAgendaOcorrencias(contratoId); await atualizarDependencias(); }
      return impacto;
    },
    ocorrencias: consulta.dados ?? [], loading: consulta.carregando,
    erro: consulta.erro ? (consulta.erro instanceof Error ? consulta.erro.message : 'Falha ao consultar ocorrências.') : null,
    atualizar: consulta.atualizar,
    criarOcorrenciaManual: async (dados: NovaOcorrenciaManual) => {
      if (!contratoId || !dados.entregavelId) throw new Error('Selecione um contrato e um entregável.');
      const { entregavelId, ...corpo } = dados;
      // O ID do entregável pertence à rota, não ao DTO (whitelist do NestJS).
      const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias`;
      const resposta = await fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível registrar a ocorrência.'));
      const criada = await resposta.json() as Ocorrencia;
      avisarMudancaAgendaOcorrencias(contratoId);
      await atualizarDependencias();
      return criada;
    },
    gerarOcorrenciasRecorrentes: async (entregavelId: string, requisitos?: {
      recuperarFaltantes?: boolean; minimoAtividadesVerificadas?: number; minimoEvidenciasVerificadas?: number;
      minimoFotos?:number; minimoRelatorios?:number; minimoEvidenciasLivres?:number;
      modoRegistro?:'DESCRITIVO'|'QUANTITATIVO'; metaQuantidade?:string;
      evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?: boolean;
    }): Promise<number> => {
      if (!contratoId || !entregavelId) throw new Error('Selecione um contrato e um entregável recorrente.');
      const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/gerar`;
      const resposta = await fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forcarRegeneracaoFuturas: false, ...requisitos }) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível gerar períodos recorrentes.'));
      const resultado: unknown = await resposta.json();
      avisarMudancaAgendaOcorrencias(contratoId);
      await atualizarDependencias();
      return resultado && typeof resultado === 'object' && 'novasGeradas' in resultado && typeof resultado.novasGeradas === 'number'
        ? resultado.novasGeradas : 0;
    },
    transicionarOcorrencia: async (id: string, acao: 'iniciar' | 'solicitar-conclusao' | 'solicitar-conclusao-parcial' | 'concluir' | 'reabrir' | 'solicitar-encerramento' | 'aprovar-encerramento', justificativa?: string) => {
      const resposta = await fetch(`${base}/${encodeURIComponent(id)}/${acao}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acao === 'reabrir' ? { justificativa } : acao === 'solicitar-encerramento' ? { motivo: justificativa } : {}) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível alterar a situação da ocorrência.'));
      const confirmado = await resposta.json() as Ocorrencia;
      await atualizarDependencias();
      return confirmado;
    },
    editarOcorrencia: async (id: string, dados: EdicaoOcorrencia) => {
      if (!contratoId || !id) throw new Error('Selecione uma ocorrência válida.');
      const resposta = await fetch(`${base}/${encodeURIComponent(id)}`, {
        method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dados),
      });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível atualizar a ocorrência.'));
      await atualizarDependencias();
    },
  };
}
