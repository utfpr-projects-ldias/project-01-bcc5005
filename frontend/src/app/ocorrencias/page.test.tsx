import Pagina from './page';
import { redirect } from 'next/navigation';
jest.mock('next/navigation', () => ({ redirect: jest.fn() }));
test('rota global antiga redireciona para a carteira, preservando os módulos contextuais', () => {
  Pagina();
  expect(redirect).toHaveBeenCalledWith('/contratos');
});
