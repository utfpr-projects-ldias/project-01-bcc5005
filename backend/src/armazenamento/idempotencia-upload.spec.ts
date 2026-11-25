import { jest } from '@jest/globals';
import { ConflictException } from '@nestjs/common';
import { operacaoUpload, recuperarUpload, registrarUpload } from './idempotencia-upload.js';
const chave='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const arquivo={originalname:'foto.txt',mimetype:'text/plain',buffer:Buffer.from('teste')};
it('uma chave identifica conteúdo e metadados, não só hash do arquivo',async()=>{
  const op=operacaoUpload(chave,'doc:c','u',arquivo,{categoria:'A',descricao:'Teste'})!;
  expect(operacaoUpload(chave,'doc:c','u',arquivo,{descricao:'Teste',categoria:'A'})?.fingerprint).toBe(op.fingerprint);
  expect(operacaoUpload(chave,'doc:c','u',arquivo,{categoria:'B',descricao:'Teste'})?.fingerprint).not.toBe(op.fingerprint);
  const manager={query:jest.fn(async()=>[{fingerprint:op.fingerprint,registro_id:'r'}])};
  await expect(recuperarUpload(manager as never,op)).resolves.toBe('r');
  await expect(recuperarUpload(manager as never,{...op,fingerprint:'diferente'})).rejects.toBeInstanceOf(ConflictException);
  await registrarUpload(manager as never,op,'r');
  expect(manager.query).toHaveBeenLastCalledWith(expect.stringContaining('INSERT INTO uploads_documentais'),[op.escopo,op.autorId,op.chave,op.fingerprint,'r']);
});
