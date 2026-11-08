/** TEC08-03 — contrato HTTP REAL de documentos contratuais (TEC08-02).
 * Evidências da HU10 são outro domínio; nunca expor storageKey nem URLs públicas.
 */
export const CATEGORIAS_DOCUMENTO = {
  CONTRATO_PRINCIPAL: 'Documento principal',
  ADITIVO: 'Aditivo',
  ANEXO: 'Anexo',
  OUTRO: 'Outro documento',
} as const;
export type CategoriaDocumento = keyof typeof CATEGORIAS_DOCUMENTO;
export type FiltroCategoriaDocumento = CategoriaDocumento | '';
export type SituacaoDocumentoFiltro = 'ATIVOS' | 'PENDENTE_VERIFICACAO' | 'EM_REVISAO' | 'VERIFICADO' | 'ARQUIVADO';

export type DocumentoContratual = {
  id: string;
  contratoId: string;
  categoria: CategoriaDocumento;
  descricao: string | null;
  nomeOriginal: string;
  tipoMime: string;
  tamanho: number;
  autorId: string;
  autorNome: string | null;
  criadoEm: string;
  arquivadoEm?: string | null;
  verificadoEm?: string | null;
  verificadoPor?: string | null;
  reabertoEm?: string | null;
  situacao?: 'ARQUIVADO' | 'EM_REVISAO' | 'PENDENTE_VERIFICACAO' | 'VERIFICADO';
};
export type PaginaDocumentos = {
  itens: DocumentoContratual[];
  pagina: number;
  total: number;
  totalPaginas: number;
};

/** A decisão PQ-11 ainda está aberta; estes limites são apenas feedback antecipado. */
export const EXTENSOES_PROVISORIAS = '.pdf,.png,.jpg,.jpeg,.webp,.txt';
export const LIMITE_PRELIMINAR_BYTES = 16 * 1024 * 1024;
const MIME_POR_EXTENSAO: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', webp: 'image/webp', txt: 'text/plain',
};
const API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');
const base = (contratoId: string) => `/contratos/${encodeURIComponent(contratoId)}/documentos`;

export class ErroDocumento extends Error {
  constructor(public readonly status: number, mensagem: string) {
    super(mensagem);
    this.name = 'ErroDocumento';
  }
}

const MENSAGENS: Record<number, string> = {
  400: 'Arquivo ou dados inválidos. Confira a categoria, a extensão e o conteúdo selecionado.',
  401: 'Sua sessão expirou. Entre novamente para continuar.',
  403: 'Você não tem permissão para esta operação neste contrato.',
  404: 'Documento ou contrato não encontrado, ou acesso não autorizado.',
  409: 'Operação incompatível com o estado atual. Confira a verificação, a revisão e os limites de documentos.',
  413: 'Arquivo acima do limite permitido ou capacidade de armazenamento excedida.',
  503: 'Arquivo ou serviço temporariamente indisponível. Tente novamente mais tarde.',
};

async function requisitar(caminho: string, init?: RequestInit): Promise<Response> {
  let resposta: Response;
  try {
    resposta = await fetch(`${API}${caminho}`, {
      ...init,
      credentials: 'include', cache: 'no-store',
      headers: { Accept: 'application/json', ...init?.headers },
    });
  } catch {
    throw new ErroDocumento(0, 'Não foi possível conectar ao serviço. Verifique sua conexão e tente novamente.');
  }
  if (!resposta.ok) {
    throw new ErroDocumento(resposta.status,
      MENSAGENS[resposta.status] ?? 'Não foi possível concluir a operação. Tente novamente.');
  }
  return resposta;
}

export async function listarDocumentos(contratoId: string, categoria: FiltroCategoriaDocumento, pagina: number, signal?: AbortSignal, arquivados = false, situacao?: SituacaoDocumentoFiltro): Promise<PaginaDocumentos> {
  const parametros = new URLSearchParams({ pagina: String(pagina) });
  if (categoria) parametros.set('categoria', categoria);
  if (arquivados) parametros.set('arquivados', 'true');
  if (situacao) parametros.set('situacao', situacao);
  const resposta = await requisitar(`${base(contratoId)}?${parametros}`, { signal });
  return resposta.json() as Promise<PaginaDocumentos>;
}

export function validarSelecaoDocumento(arquivo: File | null, categoria: CategoriaDocumento): string | null {
  if (!arquivo) return 'Selecione um arquivo antes de enviar.';
  const nomeInseguro = Array.from(arquivo.name).some(caractere => {
    const codigo = caractere.charCodeAt(0);
    return caractere === '/' || caractere === '\\' || codigo <= 31 || codigo === 127;
  });
  if (!arquivo.name || arquivo.name.length > 180 || arquivo.name.startsWith('.') ||
      arquivo.name.trim() !== arquivo.name || nomeInseguro) {
    return 'Nome do arquivo inválido.';
  }
  const extensao = arquivo.name.split('.').pop()?.toLowerCase() ?? '';
  const mimeEsperado = MIME_POR_EXTENSAO[extensao];
  if (!mimeEsperado || arquivo.type !== mimeEsperado) return 'O formato deste arquivo não foi reconhecido. Use PDF, PNG, JPG, WebP ou TXT.';
  if (categoria === 'CONTRATO_PRINCIPAL' && mimeEsperado !== 'application/pdf') {
    return 'O documento principal deve ser PDF.';
  }
  if (arquivo.size === 0) return 'O arquivo não pode estar vazio.';
  if (arquivo.size > LIMITE_PRELIMINAR_BYTES) return 'O arquivo é muito grande. O limite atual é de aproximadamente 16 MB.';
  return null;
}

export async function enviarDocumento(contratoId: string, categoria: CategoriaDocumento, arquivo: File, descricao: string): Promise<DocumentoContratual> {
  const erro = validarSelecaoDocumento(arquivo, categoria);
  if (erro) throw new ErroDocumento(400, erro);
  if (descricao.length > 140 || (descricao.length > 0 && !descricao.trim())) {
    throw new ErroDocumento(400, 'A descrição deve ter até 140 caracteres e não pode conter somente espaços.');
  }
  const dados = new FormData();
  dados.append('categoria', categoria);
  if (descricao.trim()) dados.append('descricao', descricao.trim());
  dados.append('arquivo', arquivo);
  // Nunca definir Content-Type manualmente: o browser gera boundary multipart.
  const resposta = await requisitar(base(contratoId), { method: 'POST', body: dados });
  return resposta.json() as Promise<DocumentoContratual>;
}

export async function verificarDocumento(contratoId: string, id: string): Promise<DocumentoContratual> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}/verificar`, { method: 'PATCH' });
  return resposta.json() as Promise<DocumentoContratual>;
}
export async function reabrirDocumento(contratoId: string, id: string, motivo: string): Promise<DocumentoContratual> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}/reabrir`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
  return resposta.json() as Promise<DocumentoContratual>;
}

/** Arquivamento lógico: não apaga blob nem metadados da auditoria. */
export async function arquivarDocumento(contratoId: string, id: string): Promise<DocumentoContratual> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}/arquivar`, { method: 'PATCH' });
  return resposta.json() as Promise<DocumentoContratual>;
}

/** Um documento arquivado pode voltar à categoria ativa; principal exige autorização especial. */
export async function reativarDocumento(contratoId: string, id: string, motivo: string): Promise<DocumentoContratual> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}/reativar`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
  return resposta.json() as Promise<DocumentoContratual>;
}

/** Exclusão física e lógica irreversível: somente documento arquivado. */
export async function excluirDocumentoArquivado(contratoId: string, id: string): Promise<{ id: string }> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}/excluir`, { method: 'POST' });
  return resposta.json() as Promise<{ id: string }>;
}

/** Correção de categoria/descrição. Arquivo incorreto deve ser arquivado e reenviado. */
export async function editarDocumento(contratoId: string, id: string, dados: { categoria: CategoriaDocumento; descricao: string }): Promise<DocumentoContratual> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ categoria: dados.categoria, descricao: dados.descricao.trim() || null }),
  });
  return resposta.json() as Promise<DocumentoContratual>;
}

/** Recupera bytes protegidos pelo NestJS antes de criar um blob efêmero local. */
export async function obterDownloadDocumento(contratoId: string, documentoId: string): Promise<Blob> {
  const resposta = await requisitar(`${base(contratoId)}/${encodeURIComponent(documentoId)}/download`);
  return resposta.blob();
}

export function formatarTamanhoDocumento(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Tamanho indisponível';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KiB`;
  return `${(bytes / (1024 * 1024)).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MiB`;
}

export function formatarDataDocumento(valor: string): string {
  const data = new Date(valor);
  if (!Number.isFinite(data.getTime())) return 'Data indisponível';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data);
}
