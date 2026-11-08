import { nomeArquivoLegivel } from './nome-arquivo';

describe('Nomes dos comprovantes com caracteres acentuados', () => {
  it('apresenta nomes antigos com mojibake em português, sem alterar o arquivo', () => {
    expect(nomeArquivoLegivel('CM - CalendÃ¡rio Resumido 2026.pdf'))
      .toBe('CM - Calendário Resumido 2026.pdf');
  });
  it('recupera sequências legadas junto de Unicode corretamente escrito', () => {
    expect(nomeArquivoLegivel('RelatÃ³rio final – 2026.pdf'))
      .toBe('Relatório final – 2026.pdf');
    expect(nomeArquivoLegivel('Prova Ã¡rea e Ã§Ã£o.pdf'))
      .toBe('Prova área e ção.pdf');
  });
  it('preserva nomes que já chegaram corretamente', () => {
    expect(nomeArquivoLegivel('Relatório de execução – 2026.pdf'))
      .toBe('Relatório de execução – 2026.pdf');
    expect(nomeArquivoLegivel('relatorio-v2.pdf')).toBe('relatorio-v2.pdf');
  });
});
