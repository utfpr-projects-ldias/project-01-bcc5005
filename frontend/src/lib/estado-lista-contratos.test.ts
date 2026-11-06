import { lerEstadoCarteira, salvarEstadoCarteira } from './estado-lista-contratos';

beforeEach(() => window.sessionStorage.clear());

test('persiste aba, filtros e scroll somente nesta guia', () => {
  salvarEstadoCarteira({ aba: 'arquivados', busca: 'QA', campo: 'numero', status: 'PLANEJAMENTO', rolagem: 476 });
  expect(lerEstadoCarteira()).toEqual({ aba: 'arquivados', busca: 'QA', campo: 'numero', status: 'PLANEJAMENTO', rolagem: 476 });
});

test('valida o estado salvo para não quebrar a carteira diante de cache inválido', () => {
  window.sessionStorage.setItem('tec08:carteira:estado:v1', '{inválido');
  expect(lerEstadoCarteira()).toBeNull();
  window.sessionStorage.setItem('tec08:carteira:estado:v1', JSON.stringify({ aba: 'outra', campo: 'todos' }));
  expect(lerEstadoCarteira()).toBeNull();
  window.sessionStorage.setItem('tec08:carteira:estado:v1', JSON.stringify({ aba: 'ativos', campo: 'todos', rolagem: -9 }));
  expect(lerEstadoCarteira()).toEqual({ aba: 'ativos', busca: '', campo: 'todos', status: '', rolagem: 0 });
});
