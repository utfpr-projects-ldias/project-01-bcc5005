import { criarLimiteLogin } from './limite-login.js';

it('limita tentativas por endereço, sem bloquear outro cliente e libera ao vencer a janela', () => {
  const limitar = criarLimiteLogin(1000, 2, 10);
  expect(limitar('a', 0)).toBe(0);
  expect(limitar('a', 10)).toBe(0);
  expect(limitar('a', 20)).toBe(1);
  expect(limitar('b', 20)).toBe(0);
  expect(limitar('a', 1000)).toBe(0);
});

it('limita memória e não permite contornar o limite removendo entradas ativas', () => {
  const limitar = criarLimiteLogin(1000, 1, 1);
  expect(limitar('a', 0)).toBe(0);
  expect(limitar('b', 10)).toBe(1);
  expect(limitar('a', 20)).toBe(1);
  expect(limitar('b', 1000)).toBe(0);
});
