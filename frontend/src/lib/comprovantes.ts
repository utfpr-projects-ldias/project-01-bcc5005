import { mensagemErroDominioHttp } from './erro-dominio-http';
import { chaveUpload } from './idempotencia-upload';
/** Comprovantes de execução: separados dos documentos administrativos do contrato. */
export type StatusComprovante = 'SEM_ENVIO' | 'PENDENTE_VERIFICACAO' | 'VERIFICADA' | 'REJEITADA';
export type DestinoCompartilhamento = { entregavelId:string; esperadaId:string|null; quantidadeExecutada?:string; percentualExecucao?:string; ocorrenciaId?:string; ocorrenciaIds?:string[] };
export type OpcaoCompartilhamento = DestinoCompartilhamento & {contratoId:string;contrato:string;entregavel:string;tipo:string|null;descricao:string|null};
export type VinculoCompartilhado = {contratoId:string;contrato:string;entregavelId:string;entregavel:string;esperadaId:string;comprovanteId:string;status:StatusComprovante;vigente:boolean;somenteDocumento:boolean;podeVerificar:boolean};
export type VersaoComprovante = {
  grupoCompartilhadoId?:string|null;
  id: string; autorId: string; nomeOriginal: string; tipoMime: string; tamanho: number;
  descricao: string | null; status: Exclude<StatusComprovante, 'SEM_ENVIO'>;
  verificadoPor: string | null; verificadoEm: string | null; criadoEm: string;
  quantidadeDeclarada?: string | null; quantidadeAprovada?: string | null;
  ocorrenciaPercentualId?:string|null; referenciaPercentualId?:string|null;
  percentualDeclarado?: string | null; percentualAprovado?: string | null;
  ocorrenciaQuantidadeId?: string | null; origemQuantidade?: 'NOVA_EXECUCAO' | 'COMPROVACAO' | null; referenciaExecucao?: string | null;
  enviadoPor?: { nome: string; email: string } | null;
  verificadoPorUsuario?: { nome: string; email: string } | null;
};
export type EventoRastreabilidadeEvidencia = {
  id: string; acao: string; descricao: string; ocorridoEm: string;
  ator: { nome: string; email: string } | null;
  nomeArquivo?: string | null; nomeAnterior?: string | null; nomeAtual?: string | null; justificativa?: string | null;
};
export type DeclaracaoPreliminar = Pick<VersaoComprovante,'quantidadeDeclarada'|'percentualDeclarado'|'ocorrenciaQuantidadeId'|'ocorrenciaPercentualId'|'origemQuantidade'|'referenciaPercentualId'>;
export type RascunhoEnvioEvidencia = {quantidadeExecutada?:string;ocorrenciaQuantidadeId?:string;origemQuantidade?:'NOVA_EXECUCAO'|'COMPROVACAO';referenciaExecucao?:string;percentualExecucao?:string;ocorrenciaExecucaoId?:string;comprovaExecucaoId?:string;ocorrenciasVinculadas?:string;atividadesVinculadas?:string;destinosCompartilhados?:string};
export type DetalheEvidencia = {
  declaracaoPreliminar?:DeclaracaoPreliminar|null;
  totalDestinosAguardandoEnvio?:number;
  id: string; codigoPublico?: number; contratoId: string; entregavelId: string; tipoEvidencia: string;
  descricao: string | null; obrigatoria: boolean;
  status: StatusComprovante; versoes: VersaoComprovante[]; podeVerificar: boolean; contextoPermiteAlterar?: boolean; podeEditarContribuicao?: boolean;
  percentualDiretoPermitido?:boolean;
  tipoEntregavel?:string; quantidadePrevista?:string|null; ocorrenciasDescritivas?:{id:string;titulo:string;status:string}[];
  unidadeMedida?: string | null; quantidadeMensuravel?: boolean; quantidadeDiretaPermitida?:boolean;
  execucoesQuantitativas?: { ocorrenciaId: string; referencia: string; rotulo: string; quantidade: string }[];
  ocorrenciasQuantitativas?: { id: string; titulo: string; status: string }[];
  historico?: EventoRastreabilidadeEvidencia[];
  compartilhamentos?: VinculoCompartilhado[];
  vinculosAtuais?: {id:string;titulo:string;tipo:'ocorrencia'|'atividade'}[];
  arquivadoEm?: string | null; reabertoEm?: string | null; entregavelArquivadoEm?: string | null;
};
/** Validação em runtime: a resposta HTTP pode estar incompleta mesmo quando foi tipada em TypeScript.
 * Não renderizar ações de comprovação com um tipo de evidência desconhecido. */
export function validarDetalheEvidencia(valor: unknown): asserts valor is DetalheEvidencia {
  if (!valor || typeof valor !== 'object')
    throw new Error('A resposta da evidência é inválida. Atualize e tente novamente.');
  const detalhe = valor as Partial<DetalheEvidencia>;
  if (typeof detalhe.id !== 'string' || !detalhe.id ||
      typeof detalhe.contratoId !== 'string' || !detalhe.contratoId ||
      typeof detalhe.entregavelId !== 'string' || !detalhe.entregavelId ||
      typeof detalhe.tipoEvidencia !== 'string' || !detalhe.tipoEvidencia.trim() ||
      !Array.isArray(detalhe.versoes) ||
      !['SEM_ENVIO', 'PENDENTE_VERIFICACAO', 'VERIFICADA', 'REJEITADA'].includes(detalhe.status ?? ''))
    throw new Error('Dados incompletos da evidência. Atualize e tente novamente.');
}

export const ROTULO_STATUS: Record<StatusComprovante, string> = {
  SEM_ENVIO: 'Aguardando envio', PENDENTE_VERIFICACAO: 'Pendente de verificação', VERIFICADA: 'Verificado', REJEITADA: 'Em revisão',
};
export const CLASSE_STATUS: Record<StatusComprovante, string> = {
  SEM_ENVIO: 'border-foreground/25 bg-foreground/5 text-foreground/70',
  PENDENTE_VERIFICACAO: 'border-yellow-400/50 bg-yellow-400/10 text-yellow-300',
  VERIFICADA: 'border-violet-400/50 bg-violet-500/15 text-violet-100',
  REJEITADA: 'border-teal-500/45 bg-teal-500/10 text-teal-800 dark:text-teal-200',
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
    503: 'O serviço de arquivos está indisponível. Confira o resultado antes de reenviar.',
  };
  throw new ErroComprovacao(resposta.status, await mensagemErroDominioHttp(resposta, avisos[resposta.status] ?? 'A operação não pôde ser concluída.'));
}
async function pedir<T>(path: string, init?: RequestInit): Promise<T> {
  let resposta: Response;
  try { resposta = await fetch(`${API}${path}`, { credentials: 'include', cache: 'no-store', ...init }); }
  catch { throw new ErroComprovacao(0, 'Sem conexão com o servidor.'); }
  await respostaValida(resposta);
  return await resposta.json() as T;
}
export const listarDestinosCompartilhamento = (contrato:string,entregavel:string,signal?:AbortSignal) => pedir<OpcaoCompartilhamento[]>(`/contratos/${encodeURIComponent(contrato)}/entregaveis/${encodeURIComponent(entregavel)}/evidencias-esperadas/destinos-compartilhamento`,{signal});
export const consultarEvidencia = (contrato: string, entregavel: string, esperada: string, signal?: AbortSignal) =>
  pedir<DetalheEvidencia>(base(contrato, entregavel, esperada), signal ? { signal } : undefined);
export const editarEvidencia = (contrato: string, entregavel: string, esperada: string,
  dados: { tipoEvidencia?: string; descricao?: string | null; obrigatoria?: boolean }) =>
  pedir<Pick<DetalheEvidencia, 'id' | 'tipoEvidencia' | 'descricao' | 'obrigatoria'>>(
    base(contrato, entregavel, esperada), {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
    });
export const editarVinculosEvidencia=(contrato:string,entregavel:string,esperada:string,dados:{comprovanteId?:string;ocorrencias?:string[];atividades?:string[]})=>
  pedir<{id:string;ocorrencias:string[];atividades:string[]}>(`${base(contrato,entregavel,esperada)}/vinculos`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)});
export type EdicaoContribuicaoEvidencia = {modalidade:'SEM_CONTRIBUICAO'|'QUANTITATIVA'|'PERCENTUAL';valor?:string;ocorrenciaId?:string};
export const editarContribuicaoEvidencia=(contrato:string,entregavel:string,esperada:string,comprovante:string,dados:EdicaoContribuicaoEvidencia)=>
  pedir<VersaoComprovante | {id:string;status:'SEM_ENVIO'}>(`${base(contrato,entregavel,esperada)}${comprovante==='rascunho'?'/contribuicao':`/comprovantes/${encodeURIComponent(comprovante)}/contribuicao`}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(dados)});
export async function enviarComprovante(contrato: string, entregavel: string, esperada: string,
  arquivo: File, descricao: string, quantidadeExecutada?: string | null,
  vinculo?: { ocorrenciaQuantidadeId: string; origemQuantidade: 'NOVA_EXECUCAO' | 'COMPROVACAO'; referenciaExecucao: string }, contribuicao?: { percentualExecucao?: string; comprovaExecucaoId?: string; ocorrenciaExecucaoId?:string; ocorrenciasVinculadas?:string[]; atividadesVinculadas?:string[]; destinosCompartilhados?:DestinoCompartilhamento[] }) {
  const dados = new FormData();
  dados.append('arquivo', arquivo);
  if (descricao.trim()) dados.append('descricao', descricao.trim());
  if (quantidadeExecutada) dados.append('quantidadeExecutada', quantidadeExecutada.replace(',', '.'));
  if (quantidadeExecutada && vinculo) {
    if(vinculo.ocorrenciaQuantidadeId && vinculo.ocorrenciaQuantidadeId!=='direta')dados.append('ocorrenciaQuantidadeId', vinculo.ocorrenciaQuantidadeId);
    dados.append('origemQuantidade', vinculo.origemQuantidade);
    dados.append('referenciaExecucao', vinculo.referenciaExecucao);
  }
  if (contribuicao?.percentualExecucao) dados.append('percentualExecucao', contribuicao.percentualExecucao.replace(',', '.'));
  if (contribuicao?.comprovaExecucaoId) dados.append('comprovaExecucaoId', contribuicao.comprovaExecucaoId);
  if (contribuicao?.ocorrenciaExecucaoId) dados.append('ocorrenciaExecucaoId', contribuicao.ocorrenciaExecucaoId);
  if (contribuicao?.ocorrenciasVinculadas?.length) dados.append('ocorrenciasVinculadas', contribuicao.ocorrenciasVinculadas.join(','));
  if (contribuicao?.atividadesVinculadas?.length) dados.append('atividadesVinculadas', contribuicao.atividadesVinculadas.join(','));
  if (contribuicao?.destinosCompartilhados?.length) dados.append('destinosCompartilhados',JSON.stringify(contribuicao.destinosCompartilhados.map(d=>({...d,ocorrenciaId:d.quantidadeExecutada||d.percentualExecucao?d.ocorrenciaId:undefined}))));
  const caminho = `${base(contrato, entregavel, esperada)}/comprovantes`;
  const op = chaveUpload(arquivo,caminho,dados);
  const item = await pedir<VersaoComprovante>(caminho, {
    method: 'POST', headers:{'Idempotency-Key':op.chave}, body: dados,
  });
  op.concluir();
  return item;
}
export const reabrirEvidencia = (c: string, e: string, id: string, motivo: string) => pedir<VersaoComprovante>(`${base(c,e,id)}/reabrir`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }) });
export const verificarComprovante = (contrato: string, entregavel: string, esperada: string, id: string, quantidadeAprovada?: string, percentualAprovado?: string) =>
  pedir<VersaoComprovante & { conclusoes?: string[] }>(`${base(contrato, entregavel, esperada)}/comprovantes/${encodeURIComponent(id)}/verificar`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(quantidadeAprovada ? { quantidadeAprovada } : {}), ...(percentualAprovado ? { percentualAprovado } : {}) }) });
export const rejeitarComprovante = (contrato: string, entregavel: string, esperada: string,
  comprovanteId: string, motivo: string) =>
  pedir<VersaoComprovante>(`${base(contrato, entregavel, esperada)}/comprovantes/${encodeURIComponent(comprovanteId)}/rejeitar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
  });
export async function baixarComprovante(contrato: string, entregavel: string, esperada: string,
  comprovante: Pick<VersaoComprovante, 'id'|'nomeOriginal'>) {
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
  dados: { tipoEvidencia: string; descricao: string | null; obrigatoria: boolean; rascunhoEnvio?:RascunhoEnvioEvidencia }) {
  const caminho = `/contratos/${encodeURIComponent(contrato)}/entregaveis/${encodeURIComponent(entregavel)}/evidencias-esperadas`;
  return pedir<{ id: string; tipoEvidencia: string }>(caminho, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados),
  });
}

export function excluirEvidenciaArquivada(c: string, e: string, id: string) {
  return pedir<{ id: string; excluido: boolean; limpezaPendente?: number }>(`${base(c, e, id)}/excluir`, { method: 'POST' });
}

export type EvidenciaConsolidada = {arquivadoEm?:string|null; id:string; entregavelId:string; entregavel:string; etapa:string; tipoEvidencia:string; descricao:string|null; obrigatoria:boolean; status:StatusComprovante; comprovanteId:string|null; nomeOriginal:string|null; criadoEm:string|null; criadoEmCadastro?:string|null; enviadoEm?:string|null; tamanho:number|null; atividades:string[]; ocorrencias:string[] };
export function consultarEvidenciasConsolidadas(contratoId:string,filtros:Record<string,string>,signal?:AbortSignal) {
  const params=new URLSearchParams(Object.entries(filtros).filter(([,valor])=>Boolean(valor)));
  return pedir<{data:EvidenciaConsolidada[];meta:{total:number;page:number;limit:number}}>(`/contratos/${encodeURIComponent(contratoId)}/entregaveis/evidencias-consolidadas?${params}`,{signal});
}
