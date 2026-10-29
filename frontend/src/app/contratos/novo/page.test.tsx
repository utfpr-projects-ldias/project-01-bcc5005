import { act, render, screen, fireEvent, within } from '@testing-library/react';
import NovoContratoPage from './page';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';
import { listarResponsaveis, criarContrato } from '@/lib/contratos';

const navegar = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: navegar }) }));
jest.mock('@/lib/admin-usuarios', () => ({ consultarMeuPerfil: jest.fn() }));
jest.mock('@/lib/contratos', () => ({ listarResponsaveis: jest.fn(), criarContrato: jest.fn() }));
jest.mock('../components/area-contratos', () => ({ AreaContratos: ({ children }: { children: React.ReactNode }) => <main>{children}</main>, Aviso: ({ children }: { children: React.ReactNode }) => <p>{children}</p> }));
jest.mock('../components/formulario-contrato', () => ({ FormularioContrato: ({ onSalvar }: { onSalvar: (dados: unknown) => Promise<void> }) => <button onClick={() => void onSalvar({ numeroContrato: 'REAL' })}>Cadastrar contrato</button> }));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const responsaveis = listarResponsaveis as jest.MockedFunction<typeof listarResponsaveis>;
const criar = criarContrato as jest.MockedFunction<typeof criarContrato>;
beforeEach(() => { jest.clearAllMocks(); responsaveis.mockResolvedValue({ usuarios: [], incompleta: false }); });

test('HU05-06: visitante não recebe formulário de criação', async () => {
  perfil.mockResolvedValue({ id: 'a', nome: null, email: 'a@example.com', perfil: 'COLABORADOR', ativo: true });
  await act(async () => { render(<NovoContratoPage />); });
  expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cadastrar contrato' })).not.toBeInTheDocument();
});

test('HU05-06: ADMIN confirma em diálogo simples antes do POST e da navegação', async () => {
  perfil.mockResolvedValue({ id: 'a', nome: 'Admin', email: 'a@example.com', perfil: 'ADMINISTRADOR', ativo: true });
  criar.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' } as Awaited<ReturnType<typeof criarContrato>>);
  await act(async () => { render(<NovoContratoPage />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar contrato' })); });
  expect(criar).not.toHaveBeenCalled();
  const dialogo = screen.getByRole('dialog', { name: 'Confirmar cadastro?' });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
  expect(criar).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar contrato' })); });
  await act(async () => { fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Confirmar cadastro' })); });
  expect(criar).toHaveBeenCalledWith(expect.objectContaining({ numeroContrato: 'REAL' }));
  expect(navegar).toHaveBeenCalledWith('/contratos/11111111-1111-4111-8111-111111111111');
});
