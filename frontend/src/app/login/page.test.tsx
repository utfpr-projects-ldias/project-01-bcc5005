import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import LoginPage from './page';
import { signIn } from 'supertokens-web-js/recipe/emailpassword';

const substituir = jest.fn();
const atualizar = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: substituir, refresh: atualizar }) }));
jest.mock('supertokens-web-js/recipe/emailpassword', () => ({ signIn: jest.fn() }));
const entrar = signIn as jest.MockedFunction<typeof signIn>;

beforeEach(() => jest.clearAllMocks());

test('login possui campos rotulados, cadastro administrado e erros acessíveis', () => {
  render(<LoginPage />);
  expect(screen.getByText(/conta criada pelo Administrador/i)).toBeInTheDocument();
  expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
  expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(screen.getAllByRole('alert').length).toBeGreaterThan(0);
  expect(entrar).not.toHaveBeenCalled();
});

test('login válido usa SDK e redireciona ao painel', async () => {
  entrar.mockResolvedValue({ status: 'OK' } as Awaited<ReturnType<typeof signIn>>);
  render(<LoginPage />);
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'admin@exemplo.com' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'SenhaDeTeste!123' } });
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  await waitFor(() => expect(substituir).toHaveBeenCalledWith('/dashboard'));
  expect(entrar).toHaveBeenCalledWith(expect.objectContaining({
    formFields: expect.arrayContaining([{ id: 'email', value: 'admin@exemplo.com' }]),
  }));
});
