import type { DadosPlanejamentoEntregavel } from './validacao-entregavel';

/** HU07-03/HU07-04 — leitura e escrita do planejamento real da API HU07-02. */
export type TipoEntregavel = 'UNICO' | 'QUANTITATIVO' | 'RECORRENTE' | 'CONTINUO' | 'MARCO';
export type PeriodicidadeEntregavel = 'DIARIA' | 'SEMANAL' | 'MENSAL' | 'TRIMESTRAL' | 'SEMESTRAL' | 'ANUAL';
export const ROTULOS_TIPO: Record<TipoEntregavel, string> = {
  UNICO: 'Único', QUANTITATIVO: 'Quantitativo', RECORRENTE: 'Recorrente',
  CONTINUO: 'Contínuo', MARCO: 'Marco',
};
export const ROTULOS_PERIODICIDADE: Record<PeriodicidadeEntregavel, string> = {
  DIARIA: 'Diária', SEMANAL: 'Semanal', MENSAL: 'Mensal',
  TRIMESTRAL: 'Trimestral', SEMESTRAL: 'Semestral', ANUAL: 'Anual',
};
export type EvidenciaEsperada = {
  id: string; tipoEvidencia: string; descricao: string | null; obrigatoria: boolean;
};
export type Entregavel = {
  id: string; contratoId: string; etapaId: string; codigo: string | null;
  nome: string; descricao: string | null; tipo: TipoEntregavel;
  responsavelId: string | null;
  inicioPrevisto: string | null; terminoPrevisto: string | null;
  quantidadePrevista: string | null; quantidadeRealizada: string | null;
  unidadeMedida: string | null; periodicidade: PeriodicidadeEntregavel | null;
  configuracaoPeriodicidade: { versao: 1 } | null;
  peso: string | null; criterioConclusao: string | null;
  statusExecucao: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'CONCLUIDO' | null;
  percentualExecucao: string | null;
  situacaoComprovacao: 'SEM_EVIDENCIA' | 'EVIDENCIA_PARCIAL' | 'COMPROVADO' | null;
  observacoes: string | null; evidenciasEsperadas: EvidenciaEsperada[];
};
export class ErroEntregavel extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(mensagem); this.name = 'ErroEntregavel';
  }
}
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const base = (contratoId: string) => `/contratos/${encodeURIComponent(contratoId)}/entregaveis`;
async function consultar<T>(caminho: string, signal?: AbortSignal): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      method: 'GET', credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json' }, signal,
    });
  } catch (erro) {
    if (signal?.aborted) throw erro;
    throw new ErroEntregavel(0, 'Falha de conexão ao consultar entregáveis. Tente novamente.');
  }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      400: 'Parâmetros da consulta inválidos.',
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Você não tem permissão para consultar estes entregáveis.',
      404: 'Contrato ou entregável não encontrado ou não autorizado.',
    };
    throw new ErroEntregavel(resposta.status, mensagens[resposta.status] ?? 'Não foi possível consultar os entregáveis.');
  }
  return await resposta.json() as T;
}
export const listarEntregaveis = (contratoId: string, signal?: AbortSignal) =>
  consultar<Entregavel[]>(base(contratoId), signal);
export const detalharEntregavel = (contratoId: string, entregavelId: string, signal?: AbortSignal) =>
  consultar<Entregavel>(`${base(contratoId)}/${encodeURIComponent(entregavelId)}`, signal);

/** Data civil: sem Date(), timezone ou alteração automática da data armazenada. */
export function dataPlanejada(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

/** HU07-04 — escrita real de planejamento; o NestJS continua autoridade de permissão. */
async function alterarEntregavel<T>(caminho: string, metodo: 'POST' | 'PATCH', dados: DadosPlanejamentoEntregavel): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, { method: metodo, credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
  } catch { throw new ErroEntregavel(0, 'Sem conexão com a API. Seus dados permanecem no formulário.'); }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      400: 'Os parâmetros informados não foram aceitos pelo backend. Revise campos e vínculo do responsável.',
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Você não tem permissão de planejamento neste contrato.',
      404: 'Contrato, etapa ou entregável não encontrado neste vínculo.',
      409: 'Conflito de replanejamento: há ocorrências vinculadas ou dados concorrentes. Nenhum registro foi apagado. Atualize antes de tentar novamente.',
    };
    throw new ErroEntregavel(resposta.status, mensagens[resposta.status] ?? 'Falha ao salvar o planejamento. Tente novamente.');
  }
  return await resposta.json() as T;
}
export const criarEntregavel = (contratoId: string, dados: DadosPlanejamentoEntregavel) =>
  alterarEntregavel<Entregavel>(base(contratoId), 'POST', dados);
export const editarEntregavel = (contratoId: string, id: string, dados: DadosPlanejamentoEntregavel) =>
  alterarEntregavel<Entregavel>(`${base(contratoId)}/${encodeURIComponent(id)}`, 'PATCH', dados);
