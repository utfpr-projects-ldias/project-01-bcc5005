import { describe, expect, it } from '@jest/globals';
import { normalizarNomeArquivo } from './nome-arquivo.js';

describe('nome de upload em UTF-8', () => {
  it('restaura o nome que chegou mojibake por Latin-1', () => {
    expect(normalizarNomeArquivo('CM - CalendÃ¡rio Resumido 2026.pdf'))
      .toBe('CM - Calendário Resumido 2026.pdf');
  });
  it('preserva UTF-8 correto, extensão e caracteres neutros', () => {
    expect(normalizarNomeArquivo('Relatório versão 3.pdf')).toBe('Relatório versão 3.pdf');
    expect(normalizarNomeArquivo('dados_001.txt')).toBe('dados_001.txt');
  });
  it('não aceita decodificação inválida nem altera caminhos por conta própria', () => {
    expect(normalizarNomeArquivo('Ã.pdf')).toBe('Ã.pdf');
    expect(normalizarNomeArquivo('a/b.pdf')).toBe('a/b.pdf');
  });
});
