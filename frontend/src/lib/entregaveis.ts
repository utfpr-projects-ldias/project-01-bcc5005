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
  id: string; codigoPublico?: number; tipoEvidencia: string; descricao: string | null; obrigatoria: boolean; arquivadoEm?: string | null; reabertoEm?: string | null;
};
export type Entregavel = {
  id: string; contratoId: string; etapaId: string; codigoPublico?: number; codigo: string | null;
  nome: string; descricao: string | null; tipo: TipoEntregavel;
  responsavelId: string | null;
  responsavel?: { nome: string | null; email: string } | null;
  inicioPrevisto: string | null; terminoPrevisto: string | null; agendaInicioFuturo?: string | null;
  quantidadePrevista: string | null; quantidadeRealizada: string | null;
  unidadeMedida: string | null; periodicidade: PeriodicidadeEntregavel | null;
  configuracaoPeriodicidade: { versao: 1 } | null;
  peso: string | null; criterioConclusao: string | null;
  statusExecucao: 'NAO_INICIADO' | 'EM_ANDAMENTO' | 'PENDENTE_CONCLUSAO' | 'PENDENTE_ENCERRAMENTO' | 'CONCLUIDO' | 'FINALIZADO' | null;
  motivoFinalizacao?: string | null; percentualExecucao: string | null;
  situacaoComprovacao: 'SEM_EVIDENCIA' | 'EVIDENCIA_PARCIAL' | 'COMPROVADO' | null;
  observacoes: string | null; arquivadoEm?: string | null; reabertoEm?: string | null; evidenciasEsperadas: EvidenciaEsperada[];
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

/** Contador de evidências obrigatórias verificadas: NÃO é avanço físico. */
export type ResumoDocumentalEntregavel = { obrigatorias: number; verificadas: number; total?: number; verificadasTotal?: number };
export const resumoDocumentalContrato = (contratoId: string, signal?: AbortSignal) =>
  consultar<Record<string, ResumoDocumentalEntregavel>>(`${base(contratoId)}/resumo-documental`, signal);

/** A API devolve apenas eventos do entregável autorizado, sem JSONB cru de auditoria. */
export type EventoHistoricoEntregavel = {
  id: string; acao: string; descricao: string; ocorridoEm: string;
  ator: { nome: string; email: string } | null;
  evidenciaNome: string | null; nomeArquivo: string | null;
  nomeAnterior?: string | null; nomeAtual?: string | null; objetoRenomeado?: 'Evidência' | 'Entregável'; justificativa?: string | null;
};
export const consultarHistoricoEntregavel = (contratoId: string, entregavelId: string, signal?: AbortSignal) =>
  consultar<EventoHistoricoEntregavel[]>(`${base(contratoId)}/${encodeURIComponent(entregavelId)}/historico`, signal);

/** Consulta protegida para responsáveis ativos; exige autorização de planejamento no contrato. */
export type ResponsavelEntregavel = { id: string; nome: string | null; email: string };
export type PaginaResponsaveisEntregavel = { itens: ResponsavelEntregavel[]; pagina: number; total: number; totalPaginas: number };
export function pesquisarResponsaveisEntregavel(contratoId: string, busca = '', signal?: AbortSignal): Promise<PaginaResponsaveisEntregavel> {
  const parametros = new URLSearchParams({ busca: busca.trim().slice(0, 100), pagina: '1' });
  return consultar<PaginaResponsaveisEntregavel>(`${base(contratoId)}/responsaveis?${parametros}`, signal);
}

/** Data civil: sem Date(), timezone ou alteração automática da data armazenada. */
export function dataPlanejada(valor: string | null): string {
  return valor && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor.split('-').reverse().join('/') : 'Não informada';
}

/** Datas planejadas opcionais, sem inventar o término ausente. */
export function intervaloPrevisto(inicio: string | null | undefined, termino: string | null | undefined): string | null {
  const inicioFormatado = inicio ? dataPlanejada(inicio) : null;
  const terminoFormatado = termino ? dataPlanejada(termino) : null;
  if (!inicioFormatado && !terminoFormatado) return null;
  if (inicioFormatado && terminoFormatado) return inicioFormatado === terminoFormatado
    ? inicioFormatado : `${inicioFormatado} até ${terminoFormatado}`;
  return inicioFormatado ? `Início previsto: ${inicioFormatado}` : `Término previsto: ${terminoFormatado}`;
}

/** HU07-04 — escrita real de planejamento; o NestJS continua autoridade de permissão. */
async function alterarEntregavel<T>(caminho: string, metodo: 'POST' | 'PATCH', dados: Partial<DadosPlanejamentoEntregavel>): Promise<T> {
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
      409: 'Não foi possível alterar o entregável no estado atual. Confira se o contrato ou a etapa precisam ser reabertos.',
    };
    let descricao = mensagens[resposta.status] ?? 'Falha ao salvar o planejamento. Tente novamente.';
    if (resposta.status === 400 || resposta.status === 409) {
      const corpo: unknown = await resposta.json().catch(() => null);
      const mensagem = corpo && typeof corpo === 'object' && 'message' in corpo
        ? (corpo as { message?: unknown }).message : null;
      const texto = typeof mensagem === 'string' ? mensagem
        : Array.isArray(mensagem) ? mensagem.filter((v): v is string => typeof v === 'string').join(' ') : '';
      // Repassar apenas mensagens curtas de domínio. Nunca exibir SQL, stack,
      // nomes internos de tabelas, caminhos ou conteúdo HTML da API.
      if (texto.length > 0 && texto.length <= 240 && !/[<>\r\n]/.test(texto) &&
          !/sql|select |insert |update |delete |stack|query:|postgres|password|typeorm|constraint | at /i.test(texto))
        descricao = texto;
      else if (resposta.status === 400) descricao = 'Revise os campos alterados, pesos e permissões do responsável.';
    }
    throw new ErroEntregavel(resposta.status, descricao);
  }
  return await resposta.json() as T;
}
export const criarEntregavel = (contratoId: string, dados: DadosPlanejamentoEntregavel) =>
  alterarEntregavel<Entregavel>(base(contratoId), 'POST', dados);
export const editarEntregavel = (contratoId: string, id: string, dados: Partial<DadosPlanejamentoEntregavel>) =>
  alterarEntregavel<Entregavel>(`${base(contratoId)}/${encodeURIComponent(id)}`, 'PATCH', dados);

/** Conclusão explícita de entregável, validada pelo backend e auditada na transação. */
/** Solicitação e aprovação de encerramento administrativo não alteram o avanço físico. */
export async function transicaoAdministrativaEntregavel(c: string, id: string,
  acao: 'solicitar-conclusao' | 'solicitar-encerramento' | 'aprovar-encerramento' | 'devolver-solicitacao', motivo?: string): Promise<Entregavel> {
  const resposta = await fetch(`${API}${base(c)}/${encodeURIComponent(id)}/${acao}`, {
    method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(motivo ? { motivo } : {}),
  });
  if (!resposta.ok) { const texto = await resposta.json().catch(() => null);
    throw new ErroEntregavel(resposta.status, typeof texto?.message === 'string' ? texto.message : 'A operação não foi autorizada ou os requisitos ainda não foram cumpridos.'); }
  return await resposta.json() as Entregavel;
}

export async function concluirEntregavel(contratoId: string, id: string): Promise<Entregavel> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${base(contratoId)}/${encodeURIComponent(id)}/concluir`, {
      method: 'PATCH', credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' },
    });
  } catch {
    throw new ErroEntregavel(0, 'Falha de conexão ao concluir entregável. Tente novamente.');
  }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Você não tem permissão para concluir este entregável.',
      404: 'Contrato ou entregável não encontrado ou não autorizado.',
      409: 'O entregável ainda possui pendências ou foi alterado. Atualize os dados antes de concluir.',
    };
    throw new ErroEntregavel(resposta.status, mensagens[resposta.status] ?? 'Não foi possível concluir o entregável.');
  }
  return await resposta.json() as Entregavel;
}

/** Reabertura de conclusão física, sujeita à permissão especial no backend. */
export async function reabrirEntregavel(contratoId: string, id: string, motivo: string) {
  const r = await fetch(`${API}${base(contratoId)}/${encodeURIComponent(id)}/reabrir`, {
    method: 'PATCH', credentials: 'include', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
  });
  if (!r.ok) {
    const body: unknown = await r.json().catch(() => null);
    const mensagem = body && typeof body === 'object' && 'message' in body ? (body as {message?:unknown}).message : null;
    const detalhe = typeof mensagem === 'string' && mensagem.length <= 240 &&
      !/[<>\r\n]/.test(mensagem) && !/sql|stack|postgres|query|constraint/i.test(mensagem) ? mensagem : null;
    throw new ErroEntregavel(r.status, detalhe ?? (r.status === 403
      ? 'Você não tem permissão para reabrir este entregável.'
      : 'Não foi possível reabrir. Se a etapa ou o contrato estiver finalizado, reabra o objeto-pai primeiro.'));
  }
  return await r.json() as Entregavel;
}

/** Ações reversíveis e auditadas; jamais removem o entregável ou seus comprovantes. */
export async function alterarArquivoEntregavel(contratoId: string, id: string, acao: 'arquivar' | 'reativar', motivo?: string) {
  const r = await fetch(`${API}${base(contratoId)}/${encodeURIComponent(id)}/${acao}`, { method: 'PATCH', credentials: 'include', cache: 'no-store', ...(acao === 'reativar' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) } : {}) });
  if (!r.ok) throw new ErroEntregavel(r.status, r.status === 403 ? 'Sem permissão para arquivar ou reativar.' : 'Não foi possível alterar o arquivamento do entregável.');
  return await r.json() as { id: string; arquivadoEm: string | null };
}
export const listarEntregaveisArquivados = (contratoId: string, etapaId: string) =>
  consultar<Entregavel[]>(`${base(contratoId)}/arquivados?etapaId=${encodeURIComponent(etapaId)}`);

export async function excluirEntregavelArquivado(contratoId: string, entregavelId: string) {
  const res = await fetch(`${API}${base(contratoId)}/${encodeURIComponent(entregavelId)}/excluir`, {
    method: 'POST', credentials: 'include', cache: 'no-store',
  });
  if (!res.ok) throw new ErroEntregavel(res.status,
    res.status === 403 ? 'Você não tem permissão para excluir este entregável.' :
    res.status === 409 ? 'Arquive o entregável antes de excluí-lo.' : 'Falha ao excluir entregável.');
  return res.json() as Promise<{id: string; excluido: boolean; limpezaPendente?: number}>;
}
