import { fireEvent, render, screen } from '@testing-library/react';
import AdministracaoPage from './page';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('./usuarios/components/painel-administracao', () => ({ PainelAdministracao: () => <p>Lista de funcionários</p> }));
jest.mock('../usuario/page', () => ({ __esModule: true, default: () => <p>Dados pessoais</p> }));
beforeEach(() => { jest.clearAllMocks(); window.history.replaceState({}, '', '/admin'); });
test('administração permite alternar as abas do administrador', () => {
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { ativo: true, perfil: 'ADMINISTRADOR' }, carregando: false });
  render(<AdministracaoPage />);
  expect(screen.getByText('Lista de funcionários')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Minha conta/ }));
  expect(screen.getByText('Dados pessoais')).toBeInTheDocument();
});
test('gestor vê seus próprios dados sem acesso ao gerenciamento', () => {
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { ativo: true, perfil: 'GESTOR' }, carregando: false });
  render(<AdministracaoPage />);
  expect(screen.queryByRole('tab', { name: /Funcionários/ })).not.toBeInTheDocument();
  expect(screen.getByText('Dados pessoais')).toBeInTheDocument();
});
