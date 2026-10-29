import { fireEvent, render, screen } from '@testing-library/react';
import { EstruturaInterna } from './estrutura-interna';
import { usePathname } from 'next/navigation';
import Session from 'supertokens-web-js/recipe/session';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: jest.fn(), useRouter: () => ({ replace: mockReplace }) }));
jest.mock('supertokens-web-js/recipe/session', () => ({ __esModule: true, default: { signOut: jest.fn() } }));
jest.mock('./menu-modulos', () => ({
  MenuLateral: () => <aside aria-label="Navegação principal" data-testid="menu-estavel">Menu lateral</aside>,
  MenuMobile: () => <nav aria-label="Navegação móvel">Menu móvel</nav>,
}));
jest.mock('../dashboard/components/identificacao-usuario', () => ({ IdentificacaoUsuario: () => <span>Identidade</span> }));
const rota = usePathname as jest.MockedFunction<typeof usePathname>;

beforeEach(() => { jest.clearAllMocks(); rota.mockReturnValue('/dashboard'); });

test('menu permanece montado ao navegar entre rotas internas', () => {
  const { rerender } = render(<EstruturaInterna><p>Dashboard</p></EstruturaInterna>);
  const menu = screen.getByTestId('menu-estavel');
  rota.mockReturnValue('/contratos/123');
  rerender(<EstruturaInterna><p>Detalhes específicos</p></EstruturaInterna>);
  expect(screen.getByTestId('menu-estavel')).toBe(menu);
  expect(screen.getByRole('heading', { name: 'Detalhes do contrato' })).toBeInTheDocument();
  expect(screen.getByText('Detalhes específicos')).toBeInTheDocument();
});

test('rotas públicas não montam menu e não exibem logout', () => {
  rota.mockReturnValue('/login');
  render(<EstruturaInterna><p>Formulário público</p></EstruturaInterna>);
  expect(screen.getByText('Formulário público')).toBeInTheDocument();
  expect(screen.queryByTestId('menu-estavel')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
});

test('logout usa API oficial sem refresh integral da página', async () => {
  (Session.signOut as jest.Mock).mockResolvedValue(undefined);
  render(<EstruturaInterna><p>Área protegida</p></EstruturaInterna>);
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(Session.signOut).toHaveBeenCalledTimes(1);
});
