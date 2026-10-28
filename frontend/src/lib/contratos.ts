/** Contrato real HU05-06: a API NestJS usa camelCase e enums de domínio. */
import { consultarUsuariosPaginados, type UsuarioPublico } from './admin-usuarios';

export type StatusContrato = 'PLANEJAMENTO' | 'EM_EXECUCAO' | 'EM_ENCERRAMENTO' | 'CONCLUIDO' | 'SUSPENSO' | 'CANCELADO';
export type ModoCalculo = 'SIMPLES' | 'PONDERADO';
export type Contrato = {
  id: string;
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
};
export type DadosContrato = Omit<Contrato, 'id'>;
export type AcessoContrato = { podeEditar: boolean };
export const STATUS: Record<StatusContrato, string> = {
  PLANEJAMENTO: 'Planejamento', EM_EXECUCAO: 'Em execução', EM_ENCERRAMENTO: 'Em encerramento',
  CONCLUIDO: 'Concluído', SUSPENSO: 'Suspenso', CANCELADO: 'Cancelado',
};
export const MODOS: Record<ModoCalculo, string> = { SIMPLES: 'Simples', PONDERADO: 'Ponderado' };
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ErroContrato extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'ErroContrato'; }
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
    throw new ErroContrato(resp.status, mensagem[resp.status] ?? 'Erro no servidor. Tente novamente.');
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const listarContratos = () => requisitar<Contrato[]>('/contratos');
export const buscarContrato = (id: string) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}`);
export const consultarAcessoContrato = (id: string) => requisitar<AcessoContrato>(`/contratos/${encodeURIComponent(id)}/acesso`);
export const criarContrato = (dados: DadosContrato) => requisitar<Contrato>('/contratos', { method: 'POST', body: JSON.stringify(dados) });
export const editarContrato = (id: string, dados: Partial<DadosContrato>) => requisitar<Contrato>(`/contratos/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(dados) });

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
