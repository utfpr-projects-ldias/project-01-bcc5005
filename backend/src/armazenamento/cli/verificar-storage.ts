import { ArmazenamentoLocal } from '../armazenamento-local.js';
import { lerArquivoIntegro } from '../integridade-arquivo.js';
import { lerInteiroPositivo, POLITICA_PROVISORIA } from '../politica-arquivos.js';
import { lstat, readdir } from 'node:fs/promises';
import path from 'node:path';
import db from '../../database/data-source.js';
import { verificarSchema } from '../../database/prontidao.js';

/** Inventário somente leitura. Pare os escritores para uma fotografia consistente.
 * Inclui comprovantes históricos e compartilhados; nunca remove arquivos. */
async function verificar(): Promise<void> {
  const raiz = process.env.ARQUIVOS_DIRETORIO;
  if (!raiz || !path.isAbsolute(raiz) || !(await lstat(raiz)).isDirectory()) {
    throw new Error('Diretório privado indisponível.');
  }
  await db.initialize();
  try {
    if (!(await verificarSchema(db))) throw new Error('Schema não está atualizado.');
    const registros = await db.query(`SELECT storage_key, tamanho, sha256 FROM documentos_contratuais
      UNION SELECT storage_key, tamanho, sha256 FROM comprovantes_evidencia`) as { storage_key: string; tamanho: number; sha256: string }[];
    const storage = new ArmazenamentoLocal(raiz, {
      maxArquivoBytes: lerInteiroPositivo(process.env.ARQUIVOS_MAX_ARQUIVO_BYTES, POLITICA_PROVISORIA.maxArquivoBytes),
      maxTotalBytes: lerInteiroPositivo(process.env.ARQUIVOS_MAX_TOTAL_BYTES, POLITICA_PROVISORIA.maxTotalBytes),
    });
    const chaves = new Set<string>();
    let referenciasInvalidas = 0;
    for (const { storage_key: chave } of registros) {
      if (typeof chave !== 'string' || !/^[a-f0-9]{32}$/.test(chave)) referenciasInvalidas++;
      else chaves.add(chave);
    }
    let orfaos = 0, temporarios = 0, entradasInvalidas = 0;
    const presentes = new Set<string>();
    for (const pasta of await readdir(raiz, { withFileTypes: true })) {
      if (!pasta.isDirectory()) { entradasInvalidas++; continue; }
      const destino = path.join(raiz, pasta.name);
      if (pasta.name === '.tmp') {
        temporarios += (await readdir(destino)).length;
        continue;
      }
      if (!/^[a-f0-9]{2}$/.test(pasta.name)) { entradasInvalidas++; continue; }
      for (const entrada of await readdir(destino, { withFileTypes: true })) {
        const chave = entrada.name.slice(0, -4);
        if (!entrada.isFile() || !/^[a-f0-9]{32}\.bin$/.test(entrada.name) || !chave.startsWith(pasta.name)) {
          entradasInvalidas++; continue;
        }
        presentes.add(chave);
        if (!chaves.has(chave)) orfaos++;
      }
    }
    const ausentes = [...chaves].filter(chave => !presentes.has(chave)).length;
    let integridadeDivergente = 0;
    for (const registro of registros) {
      if (!presentes.has(registro.storage_key)) continue;
      try { await lerArquivoIntegro(storage, {storageKey: registro.storage_key, tamanho: Number(registro.tamanho), sha256: registro.sha256}); }
      catch { integridadeDivergente++; }
    }
    console.log(JSON.stringify({ integridadeDivergente, referencias: chaves.size, presentes: presentes.size, ausentes, orfaos, temporarios, entradasInvalidas, referenciasInvalidas }));
    if (integridadeDivergente || ausentes || orfaos || temporarios || entradasInvalidas || referenciasInvalidas) process.exitCode = 2;
  } finally { await db.destroy(); }
}
void verificar().catch(() => {
  console.error('Falha no inventário privado. Confira o schema, a conexão e o volume. Nenhum arquivo foi removido.');
  process.exitCode = 1;
});
