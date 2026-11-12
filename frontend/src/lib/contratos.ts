/** Contrato real HU05-06: a API NestJS usa camelCase e enums de domínio. */
import { consultarUsuariosPaginados, type UsuarioPublico, type OperacaoPermissao } from './admin-usuarios';

export type StatusContrato = 'PLANEJAMENTO' | 'EM_EXECUCAO' | 'EM_ENCERRAMENTO' | 'CONCLUIDO' | 'FINALIZADO' | 'ENCERRADO' | 'SUSPENSO' | 'CANCELADO';
export type ModoCalculo = 'SIMPLES' | 'PONDERADO';
export type Contrato = {
  id: string;
  codigoPublico: string;
  numeroContrato: string;
  processoAdministrativo: string | null;
  orgaoContratante: string;
  unidadeResponsavel: string | null;
  objeto: string;
  descricao: string | null;
  dataAssinatura: string | null;
  inicioVigencia: string;
  terminoVigencia: string;
  status: StatusContrato;
  responsavelInternoId: string | null;
  fiscalGestor: string | null;
  modoCalculo: ModoCalculo;
  observacoes: string | null;
  ordemEtapasBloqueada?: boolean;
  arquivadoEm?: string | null;
  reabertoEm?: string | null;
  arquivadoPor?: string | null;
  encerradoEm?: string | null;
  encerradoPor?: string | null;
  motivoEncerramento?: string | null;
};
export type DadosContrato = Omit<Contrato, 'id' | 'codigoPublico' | 'ordemEtapasBloqueada' | 'arquivadoEm' | 'arquivadoPor' | 'reabertoEm' | 'encerradoEm' | 'encerradoPor' | 'motivoEncerramento'> & { retomarOperacao?: boolean };
/** Formato apenas de leitura: o servidor gera e mantém esse valor. */
export function rotuloCodigoPublico(codigo: string): string { return `#${codigo}`; }
/** A mesma fonte de chaves usada no editor de permissões (evita divergência no frontend). */
export type PermissoesContrato = Record<OperacaoPermissao, boolean>;
export type AcessoContrato = { podeEditar: boolean; permissoes?: PermissoesContrato };
export const STATUS: Record<StatusContrato, string> = {
  PLANEJAMENTO: 'Planejamento', EM_EXECUCAO: 'Em execução', EM_ENCERRAMENTO: 'Em encerramento',
  CONCLUIDO: 'Concluído', FINALIZADO: 'Encerrado', ENCERRADO: 'Encerrado', SUSPENSO: 'Suspenso', CANCELADO: 'Cancelado',
};
/** Ordem única de apresentação: fluxo implementado primeiro, situações administrativas ao fim. */
export const ORDEM_STATUS: readonly StatusContrato[] = [
  'PLANEJAMENTO', 'EM_EXECUCAO', 'CONCLUIDO', 'ENCERRADO', 'SUSPENSO', 'CANCELADO',
];
export const MODOS: Record<ModoCalculo, string> = { SIMPLES: 'Simples', PONDERADO: 'Ponderado' };
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ErroContrato extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ErroContrato'; }
}
/** A interface React controla a confirmação da vigência; nenhuma janela nativa do navegador. */
export class ConfirmacaoVigenciaNecessaria extends Error {
  constructor(public impacto: { confirmacao: string; total: number; planos: number; preservadasFora: number; futurasFora: number },
    public dados: Partial<DadosContrato>) { super('Confirme o impacto da alteração de vigência.'); this.name = 'ConfirmacaoVigenciaNecessaria'; }
}


async function requisitar<T>(path: string, init?: RequestInit): Promise<T> {
  let resp: Response;
  try {
    resp = await fetch(`${API}${path}`, {
      ...init, credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...init?.headers },
    });
  } catch { throw new ErroContrato(0, 'Falha de conexão com a API. Verifique o servidor e tente novamente.'); }
  if (!resp.ok) {
    const mensagem: Record<number, string> = {
      400: 'Dados inválidos. Confira os campos, o responsável e a vigência.',
      401: 'Sua sessão expirou. Entre novamente.',
      403: 'Você não tem permissão para esta operação.',
      404: 'Contrato não encontrado ou não autorizado.',
      409: 'Conflito de dados. Atualize e tente novamente.',
    };
    // Mostrar motivos de conflito de domínio para orientar decisões como Retomar.
    // Nunca refletir SQL, stack trace ou HTML de falha na interface.
    let detalheConflito: string | null = null;
    if (resp.status === 409) {
      try {
        const corpo: unknown = await resp.json();
        if (corpo && typeof corpo === 'object' && 'message' in corpo) {
          const mensagemApi = (corpo as { message?: unknown }).message;
          if (typeof mensagemApi === 'string' && mensagemApi.length <= 200 &&
              !/[<>\n\r]/.test(mensagemApi) && !/sql|select|insert|stack|query|database|postgres|password/i.test(mensagemApi)) {
            detalheConflito = mensagemApi;
          }
        }
      } catch { /* mantém mensagem segura de fallback */ }
    }
    throw new ErroContrato(resp.status, detalheConflito ?? mensagem[resp.status] ?? 'Erro no servidor. Tente novamente.');
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export type EventoHistoricoContrato = {
  id: string; acao: string; descricao: string; ocorridoEm: string;
  situacaoAnterior: string | null; situacaoAtual: string | null;
  entidadeTipo?: string; contexto?: string; nomeArquivo?: string | null; justificativa?: string | null;
  ator?: { nome: string; email: string } | null;
};
export const consultarHistoricoContrato = (id: string, signal?: AbortSignal) =>
  requisitar<EventoHistoricoContrato[]>(`/contratos/${encodeURIComponent(id)}/historico`, { signal });
export const consultarPendentesConclusao = () => requisitar<string[]>('/contratos/pendentes-conclusao');
export const listarContratos = () => requisitar<Contrato[]>('/contratos');
export const buscarContrato = (id: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}`);
export const consultarAcessoContrato = (id: string) => requisitar<AcessoContrato>(`/contratos/${encodeURIComponent(id)}/acesso`);
export const criarContrato = (dados: DadosContrato) => requisitar<Contrato>('/contratos', { method: 'POST', body: JSON.stringify(dados) });
export const arquivarContrato = (id: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/arquivar`, { method: 'PATCH' });
export const alterarBloqueioOrdemEtapas = (id: string, bloqueada: boolean) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/ordem-etapas`, { method: 'PATCH', body: JSON.stringify({ bloqueada }) });
export const cancelarContrato = (id: string, motivo: string) =>
  requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/cancelar`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const suspenderContrato = (id: string) =>
  requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/suspender`, { method: 'PATCH' });
export const retomarContrato = (id: string, motivo: string) =>
  requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/retomar`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const reverterCancelamentoContrato = (id: string, motivo: string) =>
  requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/reverter-cancelamento`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
/** Fechamento administrativo parcial: somente após resolver todas as obrigações. */
export async function finalizarContrato(c: string, motivo: string): Promise<Contrato> {
  const r = await fetch(`${API}/contratos/${encodeURIComponent(c)}/finalizar`, {
    method:'PATCH', credentials:'include', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({motivo}),
  });
  if (!r.ok) { const corpo = await r.json().catch(() => null);
    throw new Error(typeof corpo?.message === 'string' ? corpo.message : 'Finalização não autorizada: confira a situação das etapas e entregáveis.'); }
  return await r.json() as Contrato;
}
export const concluirContrato = (id: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/concluir`, { method: 'PATCH' });
export const encerrarContratoAntecipadamente = (id: string, motivo: string) =>
  requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/encerrar-antecipadamente`, {
    method: 'PATCH', body: JSON.stringify({ motivo }),
  });
export const devolverContratoParaRevisao = (id: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/devolver-revisao`, { method: 'PATCH' });
export const fecharRevisaoContrato = (id: string, motivo: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/fechar-revisao`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const reabrirContrato = (id: string, motivo: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/reabrir`, { method: 'PATCH', body: JSON.stringify({ motivo }) });
export const reativarContrato = (id: string, motivo: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}/reativar`, { method: 'PATCH', body: JSON.stringify({ motivo }) });

export const excluirContratoArquivado = (id: string) => requisitar<{ excluido: true; arquivosPendentes: number }>(`/contratos/${encodeURIComponent(id)}`, { method: 'DELETE' });
export async function editarContrato(id: string, dados: Partial<DadosContrato>, confirmacaoVigencia?: string) {
  const base = `/contratos/${encodeURIComponent(id)}`;
  const enviar = (corpo: object) => requisitar<Contrato>(base, { method: 'PATCH', body: JSON.stringify(corpo) });
  if (confirmacaoVigencia) return enviar({ ...dados, confirmacaoVigencia });
  try { return await enviar(dados); }
  catch (erro) {
    if (!(erro instanceof ErroContrato) || erro.status !== 409 || erro.message !== 'Confirme o impacto da vigência na agenda recorrente.') throw erro;
    const impacto = await requisitar<{ confirmacao: string; total: number; planos: number; preservadasFora: number; futurasFora: number; bloqueado: boolean }>(`${base}/impacto-vigencia`, { method: 'POST', body: JSON.stringify({ inicioVigencia: dados.inicioVigencia, terminoVigencia: dados.terminoVigencia }) });
    if (impacto.bloqueado) throw new ErroContrato(409, 'Replaneje a agenda futura antes de alterar a vigência.');
    throw new ConfirmacaoVigenciaNecessaria(impacto, dados);
  }
}

/** A consulta de usuários ativos é administrativa, nunca liberada a não-ADMIN. */
export async function listarResponsaveis(): Promise<{ usuarios: UsuarioPublico[]; incompleta: boolean }> {
  const itens: UsuarioPublico[] = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const resposta = await consultarUsuariosPaginados({ ativo: true, pagina, limite: 100 });
    itens.push(...resposta.itens);
    if (pagina >= resposta.totalPaginas) return { usuarios: itens, incompleta: false };
  }
  return { usuarios: itens, incompleta: true };
}

/**
 * Vigência inclusiva: 17/10/2026 + 12 meses -> 16/10/2027.
 * Se o mês alvo não possuir o dia original (ex. 31/01 + 1 mês), não inventa
 * truncamento/overflow: retorna null e exige data final explícita.
 */
export function terminoPorMeses(inicio: string, meses: number): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !Number.isInteger(meses) || meses < 1 || meses > 1200) return null;
  const [ano, mes, dia] = inicio.split('-').map(Number);
  const original = new Date(Date.UTC(ano, mes - 1, dia));
  if (original.toISOString().slice(0, 10) !== inicio) return null;
  const alvo = new Date(Date.UTC(ano, mes - 1 + meses, dia));
  const mesAlvo = ((mes - 1 + meses) % 12 + 12) % 12;
  if (alvo.getUTCMonth() !== mesAlvo || alvo.getUTCDate() !== dia) return null;
  alvo.setUTCDate(alvo.getUTCDate() - 1);
  return alvo.toISOString().slice(0, 10);
}

export function dataCivil(valor: string | null | undefined): string { return valor?.slice(0, 10) ?? ''; }
