import { createHash } from 'node:crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ArmazenamentoArquivos } from './contrato-armazenamento.js';

/** O reconhecimento documental requer os mesmos bytes registrados no banco. */
export async function lerArquivoIntegro(storage: ArmazenamentoArquivos,
  item: { storageKey: string; tamanho: number; sha256: string }): Promise<Buffer> {
  try {
    const bytes = await storage.ler(item.storageKey);
    if (!Buffer.isBuffer(bytes) || bytes.length !== item.tamanho ||
        createHash('sha256').update(bytes).digest('hex') !== item.sha256)
      throw new Error('Metadados divergentes');
    return bytes;
  } catch {
    throw new ServiceUnavailableException('Arquivo indisponível ou com integridade divergente');
  }
}
