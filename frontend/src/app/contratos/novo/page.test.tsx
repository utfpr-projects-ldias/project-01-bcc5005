import NovoContratoPage from './page';
import { redirect } from 'next/navigation';

jest.mock('next/navigation', () => ({ redirect: jest.fn() }));

test('cadastro independente encaminha à listagem, onde o formulário é modal', () => {
  NovoContratoPage();
  expect(redirect).toHaveBeenCalledWith('/contratos');
});
