import { renderComConsultas } from '@/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
  const { rerender } = renderComConsultas(<EstruturaInterna><p>Dashboard</p></EstruturaInterna>);
  const menu = screen.getByTestId('menu-estavel');
  rota.mockReturnValue('/contratos/123');
  rerender(<EstruturaInterna><p>Detalhes específicos</p></EstruturaInterna>);
  expect(screen.getByTestId('menu-estavel')).toBe(menu);
  expect(screen.getByRole('heading', { name: 'Detalhes do contrato' })).toBeInTheDocument();
  expect(screen.getByText('Detalhes específicos')).toBeInTheDocument();
});

test('rotas públicas não montam menu e não exibem logout', () => {
  rota.mockReturnValue('/login');
  renderComConsultas(<EstruturaInterna><p>Formulário público</p></EstruturaInterna>);
  expect(screen.getByText('Formulário público')).toBeInTheDocument();
  expect(screen.queryByTestId('menu-estavel')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
});

test('logout usa API oficial sem refresh integral da página', async () => {
  (Session.signOut as jest.Mock).mockResolvedValue(undefined);
  renderComConsultas(<EstruturaInterna><p>Área protegida</p></EstruturaInterna>);
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(Session.signOut).toHaveBeenCalledTimes(1);
});


test('logout seguido de novo login não conserva o spinner Saindo... no cabeçalho', async () => {
  (Session.signOut as jest.Mock).mockResolvedValue(undefined);
  const { rerender } = renderComConsultas(<EstruturaInterna><p>Primeira sessão</p></EstruturaInterna>);

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(screen.getByRole('button', { name: /Saindo/ })).toBeDisabled();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));

  // Mesmo layout raiz, mas rota pública: cabeçalho privado desmonta.
  rota.mockReturnValue('/login');
  rerender(<EstruturaInterna><p>Faça login novamente</p></EstruturaInterna>);
  expect(screen.queryByRole('button', { name: /Saindo/ })).not.toBeInTheDocument();
  expect(screen.getByText('Faça login novamente')).toBeInTheDocument();

  // Novo login: o cabeçalho deve iniciar com botão habilitado.
  rota.mockReturnValue('/dashboard');
  rerender(<EstruturaInterna><p>Nova sessão</p></EstruturaInterna>);
  expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled();
  expect(screen.queryByText('Saindo...')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(Session.signOut).toHaveBeenCalledTimes(2);
});

test('falha ao sair restaura o botão e mostra mensagem, sem travar a sessão', async () => {
  (Session.signOut as jest.Mock).mockRejectedValueOnce(new Error('Falha de rede'));
  renderComConsultas(<EstruturaInterna><p>Área protegida</p></EstruturaInterna>);

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível sair');
  expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled();
  expect(mockReplace).not.toHaveBeenCalled();
});

test('cabecalho fixo e opaco nao deixa textos de paginas longas visiveis atras dele', () => {
  const { container } = renderComConsultas(<EstruturaInterna><p>Contrato longo</p></EstruturaInterna>);
  const header = container.querySelector('header');
  expect(header).toHaveClass('bg-background');
  expect(header).not.toHaveClass('bg-background/95');
});
