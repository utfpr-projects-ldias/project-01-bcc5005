import { renderComConsultas } from '@/test-utils';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { EstruturaInterna } from './estrutura-interna';
import { ToastNotificacoes } from './toast-notificacoes';
import { usePathname } from 'next/navigation';
import Session from 'supertokens-web-js/recipe/session';

const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ usePathname: jest.fn(), useRouter: () => ({ replace: mockReplace }) }));
jest.mock('supertokens-web-js/recipe/session', () => ({ __esModule: true, default: { signOut: jest.fn() } }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: () => ({ dados: { nome: 'Administrador de Testes', perfil: 'ADMINISTRADOR', ativo: true } }) }));
jest.mock('./protecao-sessao-interna', () => ({ ProtecaoSessaoInterna: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('./menu-modulos', () => ({
  MenuLateral: () => <aside aria-label="Navegação principal" data-testid="menu-estavel">Menu lateral</aside>,
  MenuMobile: () => <nav aria-label="Navegação móvel">Menu móvel</nav>,
}));
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
  expect(screen.queryByText('Identidade')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sair' })).toHaveAttribute('title', 'Encerrar sessão');
});

test('logout tem hover acessível por token e não cria fundo verde', () => {
  renderComConsultas(<EstruturaInterna><p>Área interna</p></EstruturaInterna>);
  const sair = screen.getByRole('button', { name: 'Sair' });
  expect(sair).toHaveClass('cursor-pointer', 'hover:text-error-text');
  expect(sair).not.toHaveClass('hover:text-red-400', 'hover:bg-brand-green/10');
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
  expect(Session.signOut).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Sair da conta?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(Session.signOut).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
  await waitFor(() => expect(Session.signOut).toHaveBeenCalledTimes(1));
});


test('logout seguido de novo login não conserva o spinner Saindo... no cabeçalho', async () => {
  (Session.signOut as jest.Mock).mockResolvedValue(undefined);
  const { rerender } = renderComConsultas(<EstruturaInterna><p>Primeira sessão</p></EstruturaInterna>);

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
  expect(screen.getByRole('button', { name: 'Sair' })).toBeDisabled();
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/login'));

  // Mesmo layout raiz, mas rota pública: cabeçalho privado desmonta.
  rota.mockReturnValue('/login');
  rerender(<EstruturaInterna><p>Faça login novamente</p></EstruturaInterna>);
  expect(screen.queryByText('Saindo...')).not.toBeInTheDocument();
  expect(screen.getByText('Faça login novamente')).toBeInTheDocument();

  // Novo login: o cabeçalho deve iniciar com botão habilitado.
  rota.mockReturnValue('/dashboard');
  rerender(<EstruturaInterna><p>Nova sessão</p></EstruturaInterna>);
  expect(screen.getByRole('button', { name: 'Sair' })).toBeEnabled();
  expect(screen.queryByText('Saindo...')).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
  await waitFor(() => expect(Session.signOut).toHaveBeenCalledTimes(2));
});

test('falha ao sair restaura o botão e mostra mensagem, sem travar a sessão', async () => {
  (Session.signOut as jest.Mock).mockRejectedValueOnce(new Error('Falha de rede'));
  renderComConsultas(<><ToastNotificacoes /><EstruturaInterna><p>Área protegida</p></EstruturaInterna></>);

  fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
  fireEvent.click(screen.getByRole('button', { name: 'Sair da conta' }));
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


test('Minha conta do Administrador é rota interna protegida com menu e saída', () => {
  rota.mockReturnValue('/usuario');
  renderComConsultas(<EstruturaInterna><p>Credenciais próprias</p></EstruturaInterna>);
  expect(screen.getByRole('heading', { name: 'Minha conta' })).toBeInTheDocument();
  expect(screen.getByTestId('menu-estavel')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
});

test('cabeçalho identifica nome e função junto ao logout, sem mostrar e-mail', () => {
  renderComConsultas(<EstruturaInterna><p>Área interna</p></EstruturaInterna>);
  const cabecalho = screen.getByRole('banner');
  expect(cabecalho).toHaveTextContent('Administrador de Testes');
  expect(cabecalho).toHaveTextContent('Administrador');
  expect(cabecalho).not.toHaveTextContent('@');
  const logout = screen.getByRole('button', { name: 'Sair' });
  expect(logout).toHaveClass('hover:text-error-text');
  expect(logout.className).not.toMatch(/hover:bg-brand-green/);
});
