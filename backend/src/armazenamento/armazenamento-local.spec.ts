import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ArmazenamentoLocal, ArmazenamentoIndisponivelError } from './armazenamento-local.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError, validarArquivo } from './politica-arquivos.js';

const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
let pasta: string;
let storage: ArmazenamentoLocal;

beforeEach(async () => {
  pasta = await mkdtemp(path.join(os.tmpdir(), 'pi-tec08-01-'));
  storage = new ArmazenamentoLocal(path.join(pasta, 'privado'), {
    maxArquivoBytes: 128,
    maxTotalBytes: 128,
  });
});

afterEach(async () => {
  await rm(pasta, { recursive: true, force: true });
});

const salvar = () => storage.salvar({ nomeOriginal: 'contrato.pdf', mimeDeclarado: 'application/pdf', conteudo: pdf });

describe('TEC08-01: storage real no filesystem privado', () => {
  it('salva e lê bytes idênticos, devolvendo chave opaca e SHA-256', async () => {
    const meta = await salvar();
    expect(meta.chave).toMatch(/^[a-f0-9]{32}$/);
    expect(meta.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(meta.mimeEfetivo).toBe('application/pdf');
    expect(meta.tamanho).toBe(pdf.length);
    expect(meta.chave).not.toContain('contrato');
    expect(await storage.existe(meta.chave)).toBe(true);
    expect(await storage.ler(meta.chave)).toEqual(pdf);
  });

  it('preserva o blob após criar nova instância que usa o mesmo volume', async () => {
    const salvo = await salvar();
    storage.confirmarPersistencia(salvo);
    const outroProcesso = new ArmazenamentoLocal(path.join(pasta, 'privado'), {
      maxArquivoBytes: 128, maxTotalBytes: 128,
    });
    expect(await outroProcesso.ler(salvo.chave)).toEqual(pdf);
    await expect(outroProcesso.removerOrfao(salvo)).rejects.toBeInstanceOf(ArquivoInvalidoError);
  });

  it('não remove arquivos sem token correspondente e não remove confirmados', async () => {
    const salvo = await salvar();
    await expect(storage.removerOrfao({ chave: salvo.chave, tokenCompensacao: 'errado' }))
      .rejects.toBeInstanceOf(ArquivoInvalidoError);
    expect(await storage.existe(salvo.chave)).toBe(true);
    storage.confirmarPersistencia(salvo);
    await expect(storage.removerOrfao(salvo)).rejects.toBeInstanceOf(ArquivoInvalidoError);
    expect(await storage.existe(salvo.chave)).toBe(true);
  });

  it('remove apenas blob pendente autorizado e invalida token', async () => {
    const salvo = await salvar();
    await storage.removerOrfao(salvo);
    expect(await storage.existe(salvo.chave)).toBe(false);
    await expect(storage.removerOrfao(salvo)).rejects.toBeInstanceOf(ArquivoInvalidoError);
  });

  it('bloqueia traversal e chave forjada ao ler e excluir', async () => {
    await expect(storage.ler('../../etc/passwd')).rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(storage.existe('a'.repeat(31))).rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(storage.removerOrfao({ chave: 'a'.repeat(32), tokenCompensacao: '' }))
      .rejects.toBeInstanceOf(ArquivoInvalidoError);
  });

  it('rejeita arquivo vazio, nome com traversal, MIME falso e extensão fora do catálogo', async () => {
    for (const nomeOriginal of ['../contrato.pdf', 'pasta\\contrato.pdf', 'contrato.exe', '.oculto.pdf']) {
      await expect(storage.salvar({ nomeOriginal, mimeDeclarado: 'application/pdf', conteudo: pdf }))
        .rejects.toBeInstanceOf(ArquivoInvalidoError);
    }
    await expect(storage.salvar({ nomeOriginal: 'contrato.pdf', mimeDeclarado: 'application/pdf', conteudo: Buffer.alloc(0) }))
      .rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(storage.salvar({ nomeOriginal: 'contrato.pdf', mimeDeclarado: 'application/pdf', conteudo: Buffer.from('<html>') }))
      .rejects.toBeInstanceOf(ArquivoInvalidoError);
    await expect(storage.salvar({ nomeOriginal: 'contrato.pdf', mimeDeclarado: 'text/plain', conteudo: pdf }))
      .rejects.toBeInstanceOf(ArquivoInvalidoError);
  });

  it('respeita limite por arquivo e cota total em operações concorrentes num mesmo processo', async () => {
    const curto = new ArmazenamentoLocal(path.join(pasta, 'outro'), {
      maxArquivoBytes: 48, maxTotalBytes: 48,
    });
    const arquivo = { nomeOriginal: 'contrato.pdf', mimeDeclarado: 'application/pdf', conteudo: pdf };
    const resultados = await Promise.allSettled([curto.salvar(arquivo), curto.salvar(arquivo)]);
    expect(resultados.filter((x) => x.status === 'fulfilled')).toHaveLength(1);
    expect(resultados.filter((x) => x.status === 'rejected')).toHaveLength(1);
    const falha = resultados.find((x) => x.status === 'rejected');
    if (falha?.status === 'rejected') expect(falha.reason).toBeInstanceOf(LimiteArmazenamentoError);
  });

  it('aceita assinatura de documento Word legado e DOCX, mas recusa ZIP renomeado', () => {
    const limites = { maxArquivoBytes: 1024, maxTotalBytes: 1024 };
    const ole = Buffer.concat([Buffer.from('d0cf11e0a1b11ae1', 'hex'), Buffer.alloc(504)]);
    const doc = validarArquivo('relatorio.doc', 'application/msword', ole, limites);
    expect(doc.mimeEfetivo).toBe('application/msword');
    const docxSimulado = Buffer.concat([Buffer.from('504b0304', 'hex'), Buffer.alloc(32),
      Buffer.from('[Content_Types].xml'), Buffer.from('word/document.xml')]);
    expect(validarArquivo('relatorio.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      docxSimulado, limites).mimeEfetivo)
      .toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(() => validarArquivo('falso.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      Buffer.from('PK\x03\x04arquivo.zip qualquer'), limites)).toThrow(ArquivoInvalidoError);
  });

  it('não lê arquivo inexistente e não usa diretório público/relativo', async () => {
    await expect(storage.ler('a'.repeat(32))).rejects.toBeInstanceOf(ArmazenamentoIndisponivelError);
    expect(() => new ArmazenamentoLocal('frontend/public')).toThrow();
    expect(() => new ArmazenamentoLocal('/app/public/arquivos')).toThrow();
    expect(() => validarArquivo('arquivo.txt', 'text/plain', Buffer.from('texto sem binário'), { maxArquivoBytes: 100, maxTotalBytes: 100 }))
      .not.toThrow();
  });
});
