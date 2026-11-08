/** Contrato HTTP HU06-02 — Etapas reais, sem entidades financeiras ou dados de demonstração. */
export type StatusEtapa = 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'ENCERRADA';
export const STATUS_ETAPA: Record<StatusEtapa, string> = {
  PLANEJADA: 'Planejada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', ENCERRADA: 'Encerrada',
};

export type Etapa = {
  id: string;
  contratoId: string;
  codigoPublico?: number;
  arquivadoEm?: string | null;
  reabertoEm?: string | null;
  codigo: string | null;
  nome: string;
  descricao: string | null;
  sequencia: number;
  inicioPrevisto: string | null;
  terminoPrevisto: string | null;
  status: StatusEtapa;
  observacoes: string | null;
  vigenciaContrato: { inicioVigencia: string; terminoVigencia: string };
  avisoVigencia: boolean;
};
export type DadosEtapa = Pick<Etapa, 'nome' | 'codigo' | 'descricao' | 'inicioPrevisto' | 'terminoPrevisto' | 'status' | 'observacoes'>;

export class ErroEtapa extends Error {
  constructor(public readonly status: number, mensagem: string) { super(mensagem); this.name = 'ErroEtapa'; }
}

const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

async function requisitar<T>(caminho: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      ...init,
      credentials: 'include', cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new ErroEtapa(0, 'Não foi possível conectar ao servidor. Tente novamente.');
  }
  if (!resposta.ok) {
    const mensagens: Record<number, string> = {
      400: 'Confira os campos informados e tente novamente.',
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Você não tem permissão para esta operação.',
      404: 'Contrato ou etapa indisponível. Atualize a página.',
      409: 'As etapas foram alteradas por outra pessoa. Atualize a lista antes de tentar novamente.',
    };
    throw new ErroEtapa(resposta.status, mensagens[resposta.status] ?? 'Não foi possível concluir a operação. Tente novamente.');
  }
  return (await resposta.json()) as T;
}

const caminho = (contratoId: string) => `/contratos/${encodeURIComponent(contratoId)}/etapas`;

export const listarEtapas = (contratoId: string) => requisitar<Etapa[]>(caminho(contratoId));
export const criarEtapa = (contratoId: string, dados: DadosEtapa) => requisitar<Etapa>(caminho(contratoId), {
  method: 'POST', body: JSON.stringify(dados),
});
export const editarEtapa = (contratoId: string, etapaId: string, dados: DadosEtapa) => requisitar<Etapa>(
  `${caminho(contratoId)}/${encodeURIComponent(etapaId)}`, { method: 'PATCH', body: JSON.stringify(dados) },
);
export const concluirEtapa = (c: string, e: string) => requisitar<Etapa>(`${caminho(c)}/${encodeURIComponent(e)}/concluir`, { method: 'PATCH' });
export const consultarHistoricoEtapa = (c: string, e: string, signal?: AbortSignal) => requisitar<Array<{id: string; acao: string; descricao: string; ocorridoEm: string; entidadeTipo: string; entidadeId: string; evidenciaId?: string | null; contexto?: string; nomeArquivo?: string | null; justificativa?: string | null; ator?: {nome: string; email: string} | null}>>(`${caminho(c)}/${encodeURIComponent(e)}/historico`, { signal });
export const reabrirEtapaEncerrada = (c: string, e: string, motivo: string) => requisitar<Etapa>(`${caminho(c)}/${encodeURIComponent(e)}/reabrir-encerrada`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const encerrarEtapa = (c: string, e: string, motivo: string) => requisitar<Etapa>(`${caminho(c)}/${encodeURIComponent(e)}/encerrar`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const reabrirEtapa = (c: string, e: string, motivo: string) => requisitar<Etapa>(`${caminho(c)}/${encodeURIComponent(e)}/reabrir`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const alterarArquivamentoEtapa = (c: string, e: string, a: 'arquivar' | 'reativar', motivo?: string) => requisitar<Etapa>(
  `${caminho(c)}/${encodeURIComponent(e)}/${a}`, { method: 'PATCH', ...(a === 'reativar' ? { body: JSON.stringify({ motivo }) } : {}) },
);
export const excluirEtapaArquivada = (c: string, e: string) => requisitar<{id: string; excluido: boolean; limpezaPendente?: number}>(
  `${caminho(c)}/${encodeURIComponent(e)}/excluir`, { method: 'POST' },
);
export const reordenarEtapas = (contratoId: string, idsOrdemAtual: string[], idsOrdemNova: string[]) => requisitar<Etapa[]>(
  `${caminho(contratoId)}/reordenar`, {
    method: 'PATCH', body: JSON.stringify({ idsOrdemAtual, idsOrdemNova }),
  },
);
