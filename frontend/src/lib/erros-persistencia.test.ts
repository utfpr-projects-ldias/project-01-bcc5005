import { concederPermissaoFuncionario } from './admin-usuarios';
import { enviarDocumento } from './documentos';
import { listarMetasMarco } from './metas-marco';

const fetchOriginal = global.fetch;
const buscar = jest.fn();
beforeEach(() => { buscar.mockReset(); global.fetch = buscar as typeof fetch; });
afterEach(() => { global.fetch = fetchOriginal; });
const erro = (status: number, message: string) => ({ ok: false, status, json: async () => ({ message }) });

test('conflito administrativo informa a regra real sem confundir com e-mail duplicado', async () => {
  const message = 'Há vínculos incompatíveis ou dependentes.';
  buscar.mockResolvedValueOnce(erro(409,message));
  const dados = { contratoId: 'c' } as Parameters<typeof concederPermissaoFuncionario>[1];
  await expect(concederPermissaoFuncionario('u',dados)).rejects.toMatchObject({status:409,message});
});
test('metas preservam o status HTTP e ocultam detalhes técnicos', async () => {
  buscar.mockResolvedValueOnce(erro(403,'SELECT senha FROM usuarios'));
  await expect(listarMetasMarco('c','e')).rejects.toMatchObject({status:403,message:'Sem permissão para esta operação.'});
});
test('perda de confirmação de upload não reenvia automaticamente e mantém a chave de idempotência', async () => {
  const arquivo = new File(['%PDF-1.4'], 'documento.pdf', {type:'application/pdf'});
  const message='Serviço temporariamente indisponível. Confira o resultado da operação antes de reenviar.';
  buscar.mockResolvedValueOnce(erro(503,message));
  await expect(enviarDocumento('c','ANEXO',arquivo,'')).rejects.toMatchObject({status:503,message});
  expect(buscar).toHaveBeenCalledTimes(1);
  buscar.mockResolvedValueOnce({ok:true,json:async()=>({id:'doc'})});
  await enviarDocumento('c','ANEXO',arquivo,'');
  expect(buscar.mock.calls[0][1].headers['Idempotency-Key']).toBe(buscar.mock.calls[1][1].headers['Idempotency-Key']);
});
