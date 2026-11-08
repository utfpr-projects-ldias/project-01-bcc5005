import { TextDecoder } from 'node:util';

/**
 * TEC08-01 / PQ-11: parâmetros técnicos PROVISÓRIOS de desenvolvimento.
 * Não equivalem à política de retenção ou aos limites aprovados pelo cliente.
 */
export interface PoliticaArquivos {
  readonly maxArquivoBytes: number;
  readonly maxTotalBytes: number;
}

export const POLITICA_PROVISORIA: PoliticaArquivos = Object.freeze({
  maxArquivoBytes: 16 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024,
});

const TIPOS: Readonly<Record<string, string>> = Object.freeze({
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
});

export class ArquivoInvalidoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArquivoInvalidoError';
  }
}

export class LimiteArmazenamentoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LimiteArmazenamentoError';
  }
}

export function lerInteiroPositivo(valor: string | undefined, padrao: number): number {
  if (valor === undefined || valor === '') return padrao;
  if (!/^\d+$/.test(valor)) throw new Error('Limite de armazenamento inválido');
  const convertido = Number(valor);
  if (!Number.isSafeInteger(convertido) || convertido < 1) {
    throw new Error('Limite de armazenamento deve ser um inteiro positivo seguro');
  }
  return convertido;
}

export function validarPolitica(politica: PoliticaArquivos): void {
  for (const valor of [politica.maxArquivoBytes, politica.maxTotalBytes]) {
    if (!Number.isSafeInteger(valor) || valor <= 0) {
      throw new Error('Política de armazenamento inválida');
    }
  }
  if (politica.maxArquivoBytes > politica.maxTotalBytes) {
    throw new Error('Limite por arquivo excede a capacidade total');
  }
}

export function validarArquivo(
  nomeOriginal: string,
  mimeDeclarado: string,
  conteudo: Buffer,
  politica: PoliticaArquivos,
): { nomeOriginal: string; mimeEfetivo: string; tamanho: number } {
  validarPolitica(politica);
  if (typeof nomeOriginal !== 'string' || nomeOriginal.length < 1 || nomeOriginal.length > 180 ||
      nomeOriginal === '.' || nomeOriginal === '..' || /[/\\\u0000-\u001f\u007f]/.test(nomeOriginal) ||
      nomeOriginal.startsWith('.') || nomeOriginal.trim() !== nomeOriginal) {
    throw new ArquivoInvalidoError('Nome do arquivo inválido');
  }
  if (!Buffer.isBuffer(conteudo) || conteudo.length === 0) {
    throw new ArquivoInvalidoError('Arquivo vazio ou conteúdo inválido');
  }
  if (conteudo.length > politica.maxArquivoBytes) {
    throw new LimiteArmazenamentoError('Arquivo acima do limite técnico provisório');
  }
  const extensao = /\.[^.]+$/.exec(nomeOriginal)?.[0].toLowerCase();
  const esperado = extensao ? TIPOS[extensao] : undefined;
  if (!esperado || mimeDeclarado !== esperado || !assinaturaCorresponde(esperado, conteudo)) {
    throw new ArquivoInvalidoError('Formato, extensão, MIME ou assinatura incompatível');
  }
  return { nomeOriginal, mimeEfetivo: esperado, tamanho: conteudo.length };
}

function assinaturaCorresponde(mime: string, dados: Buffer): boolean {
  switch (mime) {
    case 'application/msword':
      return dados.length >= 512 && dados.subarray(0, 8).equals(Buffer.from('d0cf11e0a1b11ae1', 'hex'));
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      return dados.length >= 64 && dados.subarray(0, 4).equals(Buffer.from('504b0304', 'hex')) &&
        dados.includes(Buffer.from('[Content_Types].xml')) && dados.includes(Buffer.from('word/document.xml'));
    case 'application/pdf':
      return dados.length >= 12 && dados.subarray(0, 5).toString('ascii') === '%PDF-' &&
        dados.subarray(Math.max(0, dados.length - 1024)).includes(Buffer.from('%%EOF'));
    case 'image/png':
      return dados.length >= 24 && dados.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) &&
        dados.subarray(12, 16).toString('ascii') === 'IHDR';
    case 'image/jpeg':
      return dados.length >= 4 && dados[0] === 0xff && dados[1] === 0xd8 &&
        dados[dados.length - 2] === 0xff && dados[dados.length - 1] === 0xd9;
    case 'image/webp':
      return dados.length >= 16 && dados.subarray(0, 4).toString('ascii') === 'RIFF' &&
        dados.subarray(8, 12).toString('ascii') === 'WEBP';
    case 'text/plain': {
      try {
        const texto = new TextDecoder('utf-8', { fatal: true }).decode(dados);
        return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(texto);
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}
