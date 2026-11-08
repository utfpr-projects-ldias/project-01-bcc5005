/** Comprovantes de execução: separados dos documentos administrativos do contrato. */
export type StatusComprovante = 'SEM_ENVIO' | 'PENDENTE_VERIFICACAO' | 'VERIFICADA';
export type VersaoComprovante = {
  id: string; autorId: string; nomeOriginal: string; tipoMime: string; tamanho: number;
  descricao: string | null; status: Exclude<StatusComprovante, 'SEM_ENVIO'>;
  verificadoPor: string | null; verificadoEm: string | null; criadoEm: string;
  enviadoPor?: { nome: string; email: string } | null;
  verificadoPorUsuario?: { nome: string; email: string } | null;
};
export type EventoRastreabilidadeEvidencia = {
  id: string; acao: string; descricao: string; ocorridoEm: string;
  ator: { nome: string; email: string } | null;
  nomeArquivo?: string | null; nomeAnterior?: string | null; nomeAtual?: string | null; justificativa?: string | null;
};
export type DetalheEvidencia = {
  id: string; codigoPublico?: number; contratoId: string; entregavelId: string; tipoEvidencia: string;
  descricao: string | null; obrigatoria: boolean;
  status: StatusComprovante; versoes: VersaoComprovante[]; podeVerificar: boolean;
  historico?: EventoRastreabilidadeEvidencia[];
  arquivadoEm?: string | null; reabertoEm?: string | null; entregavelArquivadoEm?: string | null;
};
export const ROTULO_STATUS: Record<StatusComprovante, string> = {
  SEM_ENVIO: 'Aguardando envio', PENDENTE_VERIFICACAO: 'Pendente de verificação', VERIFICADA: 'Verificado',
};
export const CLASSE_STATUS: Record<StatusComprovante, string> = {
  SEM_ENVIO: 'border-foreground/25 bg-foreground/5 text-foreground/70',
  PENDENTE_VERIFICACAO: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-300',
  VERIFICADA: 'border-violet-400/50 bg-violet-500/15 text-violet-100',
};
/** Categoria legível no card: prioriza o tipo padronizado, sem perder títulos históricos. */
export function categoriaVisivelEvidencia(tipo: string, nomeArquivo?: string | null): 'Foto' | 'Relatório' | null {
  const valor = tipo.trim().toLocaleLowerCase('pt-BR');
  if (/^(foto|fotografia|imagem)/.test(valor)) return 'Foto';
  if (/^relat[oó]rio/.test(valor)) return 'Relatório';
  const extensao = /\.[^.]+$/.exec(nomeArquivo ?? '')?.[0]?.toLowerCase();
  if (extensao && ['.png', '.jpg', '.jpeg', '.webp'].includes(extensao)) return 'Foto';
  if (extensao && ['.pdf', '.doc', '.docx', '.txt'].includes(extensao)) return 'Relatório';
  return null;
}
/** Restrições para NOVOS tipos padronizados; títulos legados permanecem legíveis. */
export function aceitarArquivoEvidencia(tipo: string): string {
  if (tipo.trim().toLocaleLowerCase('pt-BR') === 'foto') return '.png,.jpg,.jpeg,.webp';
  if (tipo.trim().toLocaleLowerCase('pt-BR') === 'relatório') return '.pdf,.doc,.docx,.txt';
  return '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.txt';
}
export function arquivoCompativelEvidencia(tipo: string, arquivo: File): boolean {
  const extensao = /\.[^.]+$/.exec(arquivo.name)?.[0]?.toLowerCase();
  return Boolean(extensao && aceitarArquivoEvidencia(tipo).split(',').includes(extensao));
}
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const base = (contrato: string, entregavel: string, esperada: string) =>
  `/contratos/${encodeURIComponent(contrato)}/entregaveis/${encodeURIComponent(entregavel)}/evidencias-esperadas/${encodeURIComponent(esperada)}`;
export class ErroComprovacao extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'ErroComprovacao'; }
}
async function respostaValida(resposta: Response) {
  if (resposta.ok) return;
  const avisos: Record<number, string> = {
    400: 'Os dados ou o formato do arquivo não são válidos.',
    401: 'Sua sessão expirou. Entre novamente.',
    403: 'Você não possui permissão para realizar esta operação no contrato.',
    404: 'Evidência não encontrada ou sem acesso.',
    409: 'Esta evidência foi alterada, arquivada ou já está verificada. Atualize e tente novamente.',
    413: 'O arquivo excede o tamanho permitido.',
    503: 'O serviço de arquivos está indisponível. Tente novamente mais tarde.',
  };
  // Conflito: informar a condição de negócio que o servidor retornou.
  // Nunca aceitar HTML nem objeto arbitrário; outros status mantêm mensagens estáveis.
  if (resposta.status === 409) {
    const detalhe: unknown = await resposta.json().catch(() => null);
    if (detalhe && typeof detalhe === 'object' && 'message' in detalhe) {
      const mensagem = (detalhe as { message: unknown }).message;
      if (typeof mensagem === 'string' && mensagem.length <= 260 && mensagem.trim()) {
        throw new ErroComprovacao(409, mensagem);
      }
    }
  }
  throw new ErroComprovacao(resposta.status, avisos[resposta.status] ?? 'A operação não pôde ser concluída.');
}
async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try { resposta = await fetch(`${API}${path}`, { credentials: 'include', cache: 'no-store', ...init }); }
  catch { throw new ErroComprovacao(0, 'Sem conexão com o servidor.'); }
  await respostaValida(resposta);
  return await resposta.json() as T;
}
export const consultarEvidencia = (contrato: string, entregavel: string, esperada: string) =>
  pedir<DetalheEvidencia>(base(contrato, entregavel, esperada));
export const editarEvidencia = (contrato: string, entregavel: string, esperada: string,
  dados: { tipoEvidencia?: string; descricao?: string | null; obrigatoria?: boolean }) =>
  pedir<Pick<DetalheEvidencia, 'id' | 'tipoEvidencia' | 'descricao' | 'obrigatoria'>>(
    base(contrato, entregavel, esperada), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    });
export async function enviarComprovante(contrato: string, entregavel: string, esperada: string,
  arquivo: File, descricao: string) {
  const dados = new FormData();
  dados.append('arquivo', arquivo);
  if (descricao.trim()) dados.append('descricao', descricao.trim());
  return pedir<VersaoComprovante>(`${base(contrato, entregavel, esperada)}/comprovantes`, {
    method: 'POST', body: dados,
  });
}
export const reabrirEvidencia = (c: string, e: string, id: string, motivo: string) => pedir<VersaoComprovante>(`${base(c,e,id)}/reabrir`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
export const verificarComprovante = (contrato: string, entregavel: string, esperada: string, id: string) =>
  pedir<VersaoComprovante & { conclusoes?: string[] }>(`${base(contrato, entregavel, esperada)}/comprovantes/${encodeURIComponent(id)}/verificar`,
    { method: 'POST' });
export async function baixarComprovante(contrato: string, entregavel: string, esperada: string,
  comprovante: VersaoComprovante) {
  let resposta: Response;
  try { resposta = await fetch(`${API}${base(contrato, entregavel, esperada)}/comprovantes/${encodeURIComponent(comprovante.id)}/download`,
    { credentials: 'include', cache: 'no-store' }); }
  catch { throw new ErroComprovacao(0, 'Não foi possível baixar o arquivo.'); }
  await respostaValida(resposta);
  const blob = await resposta.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = comprovante.nomeOriginal;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Somente usuários com permissão real de planejamento podem ver/alterar arquivados. */
export function listarEvidenciasArquivadas(contrato: string, entregavel: string) {
  const caminho = `/contratos/${encodeURIComponent(contrato)}/entregaveis/${encodeURIComponent(entregavel)}/evidencias-esperadas/arquivadas`;
  return pedir<Array<{ id: string; codigoPublico?: number; entregavelId: string; tipoEvidencia: string; descricao: string | null; obrigatoria: boolean; arquivadoEm: string | null }>>(caminho);
}
export function alterarArquivoEvidencia(contrato: string, entregavel: string, esperada: string, acao: 'arquivar' | 'reativar', motivo?: string) {
  return pedir<{ id: string; arquivadoEm: string | null }>(`${base(contrato, entregavel, esperada)}/${acao}`, { method: 'PATCH', ...(acao === 'reativar' ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) } : {}) });
}

export function criarEvidenciaEsperada(contrato: string, entregavel: string,
  dados: { tipoEvidencia: string; descricao: string | null; obrigatoria: boolean }) {
  const caminho = `/contratos/${encodeURIComponent(contrato)}/entregaveis/${encodeURIComponent(entregavel)}/evidencias-esperadas`;
  return pedir<{ id: string; tipoEvidencia: string }>(caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  });
}

export function excluirEvidenciaArquivada(c: string, e: string, id: string) {
  return pedir<{ id: string; excluido: boolean; limpezaPendente?: number }>(`${base(c, e, id)}/excluir`, { method: 'POST' });
}
