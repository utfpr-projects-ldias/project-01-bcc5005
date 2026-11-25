import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';

export interface OperacaoUpload { chave: string; escopo: string; autorId: string; fingerprint: string }
export function operacaoUpload(chave: string | string[] | undefined, escopo: string, autorId: string,
  arquivo: { originalname: string; mimetype: string; buffer: Buffer }, metadados: object): OperacaoUpload | null {
  if (chave === undefined) return null;
  if (typeof chave !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(chave))
    throw new BadRequestException('Chave de idempotência inválida');
  // DTO multipart possui valores escalares. Ordenar chaves, sem misturar hash de arquivo com identidade da execução.
  const campos = Object.entries(metadados).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b));
  const fingerprint = createHash('sha256').update(JSON.stringify([arquivo.originalname,arquivo.mimetype,campos,
    createHash('sha256').update(arquivo.buffer).digest('hex')])).digest('hex');
  return { chave: chave.toLowerCase(), escopo: escopo.toLowerCase(), autorId, fingerprint };
}
export async function recuperarUpload(m: EntityManager, op: OperacaoUpload | null): Promise<string | null> {
  if (!op) return null;
  const [r] = await m.query(`SELECT fingerprint, registro_id FROM uploads_documentais
    WHERE escopo=$1 AND autor_id=$2 AND chave=$3`, [op.escopo,op.autorId,op.chave]) as {fingerprint:string;registro_id:string}[];
  if (!r) return null;
  if (r.fingerprint !== op.fingerprint) throw new ConflictException('Esta chave de envio já foi usada com outros dados.');
  return r.registro_id;
}
/** Gravar dentro da mesma transação dos metadados e da auditoria, sob lock contratual. */
export async function registrarUpload(m: EntityManager, op: OperacaoUpload | null, id: string): Promise<void> {
  if (!op) return;
  await m.query(`INSERT INTO uploads_documentais(escopo,autor_id,chave,fingerprint,registro_id) VALUES($1,$2,$3,$4,$5)`,
    [op.escopo,op.autorId,op.chave,op.fingerprint,id]);
}
