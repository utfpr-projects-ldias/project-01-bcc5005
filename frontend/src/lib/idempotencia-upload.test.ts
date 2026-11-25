import { chaveUpload } from './idempotencia-upload';
test('mantém a chave em nova tentativa e libera para um novo envio explícito',()=>{
  const arquivo=new File(['teste'],'relatorio.txt');const dados=new FormData();dados.set('descricao','original');
  const primeira=chaveUpload(arquivo,'/documento',dados);
  expect(chaveUpload(arquivo,'/documento',dados).chave).toBe(primeira.chave);
  dados.set('descricao','alterado');expect(chaveUpload(arquivo,'/documento',dados).chave).not.toBe(primeira.chave);
  dados.set('descricao','original');primeira.concluir();expect(chaveUpload(arquivo,'/documento',dados).chave).not.toBe(primeira.chave);
});
