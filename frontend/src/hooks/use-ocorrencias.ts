'use client';

import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';

/** Campos e enum fornecidos pela API HU09-01/02. */
export type StatusOcorrencia = 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'PENDENTE_CONCLUSAO' | 'PENDENTE_ENCERRAMENTO' | 'EM_REVISAO' | 'CONCLUIDO' | 'ENCERRADA';
export type OrigemOcorrencia = 'RECORRENTE' | 'MANUAL_QUANTITATIVA' | 'MANUAL_DESCRITIVA';
export type Ocorrencia = {
  id: string; contratoId: string; entregavelId: string; titulo: string;
  periodoInicio: string | null; periodoFim: string | null;
  dataPrevista: string | null; dataRealizada: string | null;
  status: StatusOcorrencia; motivoEncerramento?: string | null; origem: OrigemOcorrencia; modoRegistro?: 'QUANTITATIVO' | 'DESCRITIVO';
  exigeAtividade?: boolean; minimoAtividadesVerificadas?:number; minimoEvidenciasVerificadas?:number; evidenciaExigida?: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?: boolean;
  quantidadeManual?: number; quantidadeAtividadesRegistrada?: number; quantidadeAtividadesVerificada?: number;
  quantidadeRegistrada?: number; quantidadeRestante?: number | null; progressoPercentual?: number | null;
  atividadesVerificadas?: number; atividadesPendentes?: number; evidenciasFoto?: number; evidenciasRelatorio?: number;
  requisitosAtendidos?: boolean; metaAtingida?: boolean; situacaoComprovacao?: 'NAO_EXIGIDA'|'PARCIAL'|'APRESENTADA';
  quantidadeRealizada: string | null; metaQuantidade?: string | null; quantidadeExecutada?: string | null; quantidadeAprovada?: string | null; observacoes: string | null; substituidaEm?: string | null; atividades?: { id: string; titulo: string; status: string }[];
};
export type NovaOcorrenciaManual = {
  entregavelId: string; titulo: string; periodoInicio?: string;
  periodoFim?: string; dataPrevista?: string;
  quantidadeRealizada?: string; metaQuantidade?: string; exigeAtividade?:boolean; minimoAtividadesVerificadas?:number; minimoEvidenciasVerificadas?:number; evidenciaExigida?:'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional?:boolean; modoRegistro?: 'QUANTITATIVO' | 'DESCRITIVO'; observacoes?: string;
};
export type ConfiguracaoOcorrencias = {
  entregavelId: string; contratoId: string;
  tipoOperacional: 'UNICO' | 'QUANTITATIVO' | 'RECORRENTE' | 'CONTINUO' | 'MARCO';
  quantidadePrevista: string | null; unidadeMedida: string | null;
  periodicidade: string | null; inicioPrevisto: string | null; terminoPrevisto: string | null; modoVisualizacao: 'LISTA' | 'CALENDARIO';
};
export type EdicaoOcorrencia = Partial<Pick<Ocorrencia, 'titulo' | 'dataPrevista' | 'dataRealizada' | 'status' | 'quantidadeRealizada' | 'metaQuantidade' | 'observacoes' | 'exigeAtividade' | 'minimoAtividadesVerificadas' | 'minimoEvidenciasVerificadas' | 'evidenciaExigida' | 'permiteEncerramentoExcepcional'>>;

export type LancamentoOcorrencia = {id:string;quantidade:string;justificativa:string|null;criadoEm:string;criadoPor:string;alteradoEm:string|null;alteradoPor:string|null};
export type ComprovanteOcorrencia = {id:string;nomeOriginal:string;tipoEvidencia:string;status:string;vinculado:boolean};
export type EventoHistoricoOcorrencia = {id:string;acao:string;registradoEm:string;ator:string;autorNome?:string|null;dadosAnteriores:Record<string,unknown>|null;dadosPosteriores:Record<string,unknown>|null};
const rotaOcorrencia=(contratoId:string,ocorrenciaId:string)=>`${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias/${encodeURIComponent(ocorrenciaId)}`;
async function chamadaJson<T>(url:string,init?:RequestInit):Promise<T>{
  const r=await fetch(url,{credentials:'include',cache:'no-store',...init,
    headers:{Accept:'application/json',...(init?.body?{'Content-Type':'application/json'}:{}),...init?.headers}});
  if(!r.ok)throw new Error(await mensagemErro(r,'Não foi possível atualizar a ocorrência.'));
  return await r.json() as T;
}
export const listarLancamentosOcorrencia=(c:string,o:string)=>chamadaJson<LancamentoOcorrencia[]>(`${rotaOcorrencia(c,o)}/lancamentos`);
export const criarLancamentoOcorrencia=(c:string,o:string,id:string,quantidade:string,justificativa='')=>
  chamadaJson<{id:string;quantidadeExecutada:number}>(`${rotaOcorrencia(c,o)}/lancamentos`,{method:'POST',body:JSON.stringify({id,quantidade,justificativa})});
export const corrigirLancamentoOcorrencia=(c:string,o:string,id:string,quantidade:string,justificativa:string)=>
  chamadaJson<{id:string;quantidade:string}>(`${rotaOcorrencia(c,o)}/lancamentos/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({quantidade,justificativa})});
export const listarComprovantesOcorrencia=(c:string,o:string)=>chamadaJson<{vinculadas:ComprovanteOcorrencia[];disponiveis:ComprovanteOcorrencia[]}>(`${rotaOcorrencia(c,o)}/evidencias`);
export const vincularComprovanteOcorrencia=(c:string,o:string,comprovanteId:string)=>chamadaJson<{vinculado:boolean}>(`${rotaOcorrencia(c,o)}/evidencias`,{method:'POST',body:JSON.stringify({comprovanteId})});
export const desvincularComprovanteOcorrencia=(c:string,o:string,comprovanteId:string)=>chamadaJson<{desvinculado:boolean}>(`${rotaOcorrencia(c,o)}/evidencias/${encodeURIComponent(comprovanteId)}`,{method:'DELETE'});
export const listarHistoricoOcorrencia=(c:string,o:string)=>chamadaJson<EventoHistoricoOcorrencia[]>(`${rotaOcorrencia(c,o)}/historico`);
export type Replanejamento = { inicioFuturo: string; terminoPrevisto: string; periodicidade: string; confirmacao?: string };
export type ImpactoAgenda = { confirmacao: string; substituir: {id: string; inicio: string; fim: string}[]; novas: {inicio: string; fim: string}[]; reativar: number; preservadas: number; total: number; aplicado: boolean };
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

async function mensagemErro(resposta: Response, padrao: string) {
  if (resposta.status === 401 || resposta.status === 403) return 'Você não tem permissão para esta operação.';
  if (resposta.status === 400 || resposta.status === 409) { try { const corpo = await resposta.json(); if (typeof corpo.message === 'string') return corpo.message; } catch { /* resposta sem mensagem */ } }
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

export function useOcorrencias(contratoId: string) {
  const cache = useRepositorioConsultasOpcional();
  const base = `${API}/contratos/${encodeURIComponent(contratoId)}/ocorrencias`;
  const consulta = useConsulta(['ocorrencias', contratoId], async signal => {
    const resposta = await fetch(base, { credentials: 'include', cache: 'no-store', signal });
    if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível consultar a agenda do contrato.'));
    const dados: unknown = await resposta.json();
    if (Array.isArray(dados)) return dados as Ocorrencia[];
    if (dados && typeof dados === 'object' && 'data' in dados && Array.isArray(dados.data)) return dados.data as Ocorrencia[];
    throw new Error('A API devolveu um formato de agenda inválido.');
  }, { habilitada: Boolean(contratoId) });
  const atualizarDependencias = async () => {
    cache?.invalidar(['execucao', contratoId]);
    cache?.invalidar(['entregaveis', 'contrato', contratoId]);
    await consulta.atualizar();
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
      if (impacto.aplicado) await atualizarDependencias();
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
      await atualizarDependencias();
      return await resposta.json() as Ocorrencia;
    },
    gerarOcorrenciasRecorrentes: async (entregavelId: string, requisitos?: {
      minimoAtividadesVerificadas: number; minimoEvidenciasVerificadas: number;
      evidenciaExigida: 'NENHUMA'|'FOTO'|'RELATORIO'|'AMBOS'; permiteEncerramentoExcepcional: boolean;
    }): Promise<number> => {
      if (!contratoId || !entregavelId) throw new Error('Selecione um contrato e um entregável recorrente.');
      const url = `${API}/contratos/${encodeURIComponent(contratoId)}/entregaveis/${encodeURIComponent(entregavelId)}/ocorrencias/gerar`;
      const resposta = await fetch(url, { method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ forcarRegeneracaoFuturas: false, ...requisitos }) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível gerar períodos recorrentes.'));
      const resultado: unknown = await resposta.json();
      await atualizarDependencias();
      return resultado && typeof resultado === 'object' && 'novasGeradas' in resultado && typeof resultado.novasGeradas === 'number'
        ? resultado.novasGeradas : 0;
    },
    transicionarOcorrencia: async (id: string, acao: 'iniciar' | 'solicitar-conclusao' | 'concluir' | 'reabrir' | 'solicitar-encerramento' | 'aprovar-encerramento', justificativa?: string) => {
      const resposta = await fetch(`${base}/${encodeURIComponent(id)}/${acao}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(acao === 'reabrir' ? { justificativa } : acao === 'solicitar-encerramento' ? { motivo: justificativa } : {}) });
      if (!resposta.ok) throw new Error(await mensagemErro(resposta, 'Não foi possível alterar a situação da ocorrência.'));
      await atualizarDependencias();
      return await resposta.json() as Ocorrencia;
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
