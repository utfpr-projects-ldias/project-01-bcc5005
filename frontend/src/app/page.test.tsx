import { act, render, screen } from '@testing-library/react';
import Home from './page';
import { doesSessionExist } from 'supertokens-web-js/recipe/session';

jest.mock('supertokens-web-js/recipe/session', () => ({ doesSessionExist: jest.fn() }));
const sessao = doesSessionExist as jest.MockedFunction<typeof doesSessionExist>;

afterEach(() => jest.clearAllMocks());

test('home pública leva ao login quando não há sessão', async () => {
  sessao.mockResolvedValue(false);
  await act(async () => { render(<Home />); });
  expect(screen.getByRole('link', { name: /Acessar o Sistema/i })).toHaveAttribute('href', '/login');
});

test('home com sessão envia ao dashboard sem exibir cadastro público', async () => {
  sessao.mockResolvedValue(true);
  await act(async () => { render(<Home />); });
  expect(screen.getByRole('link', { name: /Acessar painel/i })).toHaveAttribute('href', '/dashboard');
  expect(screen.queryByRole('link', { name: /cadastre-se/i })).not.toBeInTheDocument();
});
