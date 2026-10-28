import { render, screen, within } from '@testing-library/react';
import DashboardPage from './page';

jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn(), refresh: jest.fn() }) }));
jest.mock('supertokens-web-js/recipe/session', () => ({ __esModule: true, default: { signOut: jest.fn() } }));
jest.mock('@/app/components/menu-modulos', () => ({
  MenuLateral: () => <aside><a href="/admin/usuarios">Administração</a></aside>,
  MenuMobile: () => <nav>Navegação móvel</nav>,
}));
jest.mock('./components/identificacao-usuario', () => ({ IdentificacaoUsuario: () => <span>Usuário autenticado</span> }));

test('Administração permanece no menu, sem botão duplicado no cabeçalho', () => {
  render(<DashboardPage />);
  expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute('href', '/admin/usuarios');
  expect(within(screen.getByRole('banner')).queryByRole('link', { name: /administração/i })).not.toBeInTheDocument();
  expect(within(screen.getByRole('banner')).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
});
