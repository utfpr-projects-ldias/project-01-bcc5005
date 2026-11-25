import { mensagemErroDominioHttp } from './erro-dominio-http';
const resposta = (body: unknown) => ({ json: async () => body } as Response);

describe('mensagens seguras de falha HTTP', () => {
  test('expõe mensagens objetivas de regra do backend', async () => {
    expect(await mensagemErroDominioHttp(resposta({message: 'A etapa está finalizada. Reabra para editar.'}), 'Erro genérico'))
      .toBe('A etapa está finalizada. Reabra para editar.');
  });
  test('trata lista de validações sem expor dados técnicos', async () => {
    expect(await mensagemErroDominioHttp(resposta({message: ['Informe o nome.', 'Revise a data.']}), 'Erro'))
      .toBe('Informe o nome. Revise a data.');
    expect(await mensagemErroDominioHttp(resposta({message: 'query: SELECT * FROM usuarios'}), 'Erro seguro'))
      .toBe('Erro seguro');
  });
  test('rejeita estruturas inválidas e mensagens gigantes', async () => {
    expect(await mensagemErroDominioHttp(resposta({message: {sql: 'segredo'}}), 'Não foi possível salvar.'))
      .toBe('Não foi possível salvar.');
    expect(await mensagemErroDominioHttp(resposta({message: 'x'.repeat(300)}), 'Erro seguro'))
      .toBe('Erro seguro');
  });
});
