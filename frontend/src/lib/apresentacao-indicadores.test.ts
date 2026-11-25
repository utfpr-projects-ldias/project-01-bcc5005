import { apresentarFracao, tomComprovacao, formatarPercentualSemAnteciparConclusao } from './apresentacao-indicadores';
test('contagem vazia é neutra, não é progresso completo', () => {
  expect(apresentarFracao(0,0)).toEqual({texto:'0/0',percentual:0,estado:'sem-requisitos'});
  expect(tomComprovacao(0,0)).toBe('neutro');
});
test('dados ausentes e incoerentes não inventam um denominador nem uma cobertura', () => {
  for (const [feitas,total] of [[undefined,2],[0,undefined],[3,2],[-1,2],[NaN,0]]) {
    expect(apresentarFracao(feitas,total)).toEqual({texto:'—',percentual:null,estado:'indisponivel'});
    expect(tomComprovacao(feitas,total)).toBe('neutro');
  }
});
test('zero de uma meta real é diferente de 0/0', () => {
  expect(apresentarFracao(0,12)).toEqual({texto:'0/12',percentual:0,estado:'aplicavel'});
  expect(tomComprovacao(0,12)).toBe('insuficiente');
});
test('cobertura parcial e completa preservam frações e semântica', () => {
  expect(apresentarFracao(7,10)).toEqual({texto:'7/10',percentual:70,estado:'aplicavel'});
  expect(tomComprovacao(7,10)).toBe('parcial');
  expect(tomComprovacao(10,10)).toBe('completo');
});

test('B10: 100% somente quando a medida está integral', () => {
  expect(formatarPercentualSemAnteciparConclusao(99.9999)).toBe('99,99%');
  expect(formatarPercentualSemAnteciparConclusao(99.99,1)).toBe('99,9%');
  expect(formatarPercentualSemAnteciparConclusao(99.99,0)).toBe('99%');
  expect(formatarPercentualSemAnteciparConclusao(100)).toBe('100%');
  expect(formatarPercentualSemAnteciparConclusao(NaN)).toBe('—');
});
