import { createHash, randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { link, lstat, mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import path from 'node:path';
import type { ArmazenamentoArquivos, ArquivoPendente, ReferenciaCompensacao, SolicitarArmazenamento } from './contrato-armazenamento.js';
import { ArquivoInvalidoError, LimiteArmazenamentoError, POLITICA_PROVISORIA, validarArquivo, validarPolitica, type PoliticaArquivos } from './politica-arquivos.js';

const CHAVE = /^[a-f0-9]{32}$/;
const PASTA = /^[a-f0-9]{2}$/;

export class ArmazenamentoIndisponivelError extends Error {
  constructor(message = 'Armazenamento de arquivos indisponível') {
    super(message);
    this.name = 'ArmazenamentoIndisponivelError';
  }
}

/**
 * Adaptador DEV single-writer: quota serializada DENTRO de um processo Node.
 * Não usar compartilhado entre múltiplas réplicas sem lock/cota distribuídos.
 * Diretório absoluto privado, volume nomeado Docker e chaves derivadas apenas do servidor.
 */
export class ArmazenamentoLocal implements ArmazenamentoArquivos {
  private readonly pendentes = new Map<string, string>();
  private fila: Promise<void> = Promise.resolve();
  private readonly raiz: string;
  private readonly politica: PoliticaArquivos;

  constructor(diretorio: string, politica: PoliticaArquivos = POLITICA_PROVISORIA) {
    if (!path.isAbsolute(diretorio) || diretorio === '/' ||
        diretorio.split(path.sep).some((parte) => ['public', '.next', 'node_modules', 'static', 'www'].includes(parte))) {
      throw new Error('Diretório de armazenamento deve ser absoluto, privado e fora das pastas servidas');
    }
    validarPolitica(politica);
    this.raiz = path.resolve(diretorio);
    this.politica = politica;
  }

  private caminho(chave: string): string {
    if (!CHAVE.test(chave)) throw new ArquivoInvalidoError('Chave de armazenamento inválida');
    return path.join(this.raiz, chave.slice(0, 2), `${chave}.bin`);
  }

  private async garantirPasta(pasta: string): Promise<void> {
    await mkdir(pasta, { recursive: true, mode: 0o700 });
    const info = await lstat(pasta);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new ArmazenamentoIndisponivelError();
  }

  private async preparar(): Promise<void> {
    await this.garantirPasta(this.raiz);
    await this.garantirPasta(path.join(this.raiz, '.tmp'));
  }

  private exclusivo<T>(operacao: () => Promise<T>): Promise<T> {
    const emExecucao = this.fila.then(operacao);
    this.fila = emExecucao.then(() => undefined, () => undefined);
    return emExecucao;
  }

  private async ocupacao(): Promise<number> {
    let total = 0;
    for (const entrada of await readdir(this.raiz, { withFileTypes: true })) {
      if (entrada.name === '.tmp') continue;
      if (!PASTA.test(entrada.name) || !entrada.isDirectory() || entrada.isSymbolicLink()) {
        throw new ArmazenamentoIndisponivelError('Diretório contém entrada não gerenciada');
      }
      for (const item of await readdir(path.join(this.raiz, entrada.name), { withFileTypes: true })) {
        if (!CHAVE.test(item.name.slice(0, 32)) || !item.name.endsWith('.bin') ||
            item.name.length !== 36 || !item.isFile() || item.isSymbolicLink()) {
          throw new ArmazenamentoIndisponivelError('Armazenamento contém arquivo não gerenciado');
        }
        const info = await stat(path.join(this.raiz, entrada.name, item.name));
        total += info.size;
        if (!Number.isSafeInteger(total)) throw new LimiteArmazenamentoError('Capacidade inválida');
      }
    }
    return total;
  }

  async salvar(entrada: SolicitarArmazenamento): Promise<ArquivoPendente> {
    const validado = validarArquivo(entrada.nomeOriginal, entrada.mimeDeclarado, entrada.conteudo, this.politica);
    return this.exclusivo(async () => {
      await this.preparar();
      if ((await this.ocupacao()) + validado.tamanho > this.politica.maxTotalBytes) {
        throw new LimiteArmazenamentoError('Cota técnica provisória do storage atingida');
      }
      const chave = randomBytes(16).toString('hex');
      const tokenCompensacao = randomBytes(32).toString('hex');
      const pasta = path.join(this.raiz, chave.slice(0, 2));
      await this.garantirPasta(pasta);
      const temporario = path.join(this.raiz, '.tmp', `${randomBytes(16).toString('hex')}.part`);
      const destino = this.caminho(chave);
      let criado = false;
      try {
        const arquivo = await open(temporario, 'wx', 0o600);
        try {
          await arquivo.writeFile(entrada.conteudo);
          await arquivo.sync();
        } finally {
          await arquivo.close();
        }
        // Hard link exclusivo: não sobrescreve chave existente, ao contrário de rename().
        await link(temporario, destino);
        criado = true;
        const handleDir = await open(pasta, constants.O_RDONLY);
        try { await handleDir.sync(); } finally { await handleDir.close(); }
        const retorno: ArquivoPendente = {
          chave, tokenCompensacao, ...validado,
          sha256: createHash('sha256').update(entrada.conteudo).digest('hex'),
        };
        this.pendentes.set(chave, tokenCompensacao);
        return retorno;
      } catch (erro) {
        if (criado) await unlink(destino).catch(() => undefined);
        throw erro;
      } finally {
        await unlink(temporario).catch(() => undefined);
      }
    });
  }

  async ler(chave: string): Promise<Buffer> {
    const nome = this.caminho(chave);
    try {
      const arquivo = await open(nome, constants.O_RDONLY | constants.O_NOFOLLOW);
      try {
        const info = await arquivo.stat();
        if (!info.isFile() || info.size > this.politica.maxArquivoBytes) throw new ArmazenamentoIndisponivelError();
        return await arquivo.readFile();
      } finally { await arquivo.close(); }
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') throw new ArmazenamentoIndisponivelError('Arquivo não encontrado no storage');
      throw erro;
    }
  }

  async existe(chave: string): Promise<boolean> {
    const nome = this.caminho(chave);
    try {
      const arquivo = await open(nome, constants.O_RDONLY | constants.O_NOFOLLOW);
      try { return (await arquivo.stat()).isFile(); } finally { await arquivo.close(); }
    } catch (erro) {
      if ((erro as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw erro;
    }
  }

  private autenticar(referencia: ReferenciaCompensacao): void {
    this.caminho(referencia.chave);
    const token = this.pendentes.get(referencia.chave);
    if (!token || token !== referencia.tokenCompensacao) {
      throw new ArquivoInvalidoError('Operação de compensação não autorizada');
    }
  }

  confirmarPersistencia(referencia: ReferenciaCompensacao): void {
    this.autenticar(referencia);
    this.pendentes.delete(referencia.chave);
  }

  async removerPersistido(chave: string): Promise<void> {
    // Método interno. O domínio autoriza; o adaptador valida a chave e nunca
    // aceita caminhos do usuário. ENOENT torna a limpeza idempotente.
    await this.exclusivo(async () => {
      const destino = this.caminho(chave);
      try {
        await unlink(destino);
      } catch (erro) {
        if ((erro as NodeJS.ErrnoException).code !== 'ENOENT') throw erro;
      }
    });
  }

  async removerOrfao(referencia: ReferenciaCompensacao): Promise<void> {
    await this.exclusivo(async () => {
      this.autenticar(referencia);
      // Invalida o token ANTES do primeiro await: impede que um commit confirme
      // o mesmo blob enquanto a remoção compensatória está em andamento.
      this.pendentes.delete(referencia.chave);
      try {
        await unlink(this.caminho(referencia.chave));
      } catch (erro) {
        this.pendentes.set(referencia.chave, referencia.tokenCompensacao);
        throw erro;
      }
    });
  }
}
