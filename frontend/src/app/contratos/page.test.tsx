import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import ContratosListPage from './page';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';
import { listarContratos } from '@/lib/contratos';

jest.mock('@/lib/admin-usuarios', () => ({ consultarMeuPerfil: jest.fn() }));
jest.mock('@/lib/contratos', () => ({
  listarContratos: jest.fn(), STATUS: { PLANEJAMENTO: 'Planejamento' }, MODOS: { SIMPLES: 'Simples' }, dataCivil: (x: string) => x,
}));
jest.mock('./components/area-contratos', () => ({
  AreaContratos: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Aviso: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const listar = listarContratos as jest.MockedFunction<typeof listarContratos>;
beforeEach(() => { jest.clearAllMocks(); perfil.mockResolvedValue({ id: 'a', nome: 'Admin', email: 'a@example.com', perfil: 'ADMINISTRADOR', ativo: true }); });

test('HU05-06: busca dados reais e não apresenta fixture CT-001/2026', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { render(<ContratosListPage />); });
  expect(listar).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Nenhum contrato cadastrado ou atribuído/)).toBeInTheDocument();
  expect(screen.queryByText('CT-001/2026')).not.toBeInTheDocument();
});

test('HU05-06: contrato real abre detalhe pelo UUID', async () => {
  listar.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', numeroContrato: 'REAL-2026', orgaoContratante: 'UTFPR', objeto: 'Serviços', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { render(<ContratosListPage />); });
  expect(screen.getByText('REAL-2026')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Detalhes' })).toHaveAttribute('href', '/contratos/11111111-1111-4111-8111-111111111111');
});

test('HU05-06: não oferece criar a Colaborador', async () => {
  perfil.mockResolvedValue({ id: 'c', nome: null, email: 'c@example.com', perfil: 'COLABORADOR', ativo: true });
  listar.mockResolvedValue([]);
  await act(async () => { render(<ContratosListPage />); });
  expect(screen.queryByRole('link', { name: 'Cadastrar contrato' })).not.toBeInTheDocument();
});


test('atualizar lista mantém contratos na tela sem piscar durante requisição pendente', async () => {
  const contrato = { id: '11111111-1111-4111-8111-111111111111', numeroContrato: 'QA-2026',
    orgaoContratante: 'UTFPR', objeto: 'Serviços', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' } as Awaited<ReturnType<typeof listarContratos>>[number];
  let concluir!: (c: Awaited<ReturnType<typeof listarContratos>>) => void;
  listar.mockResolvedValueOnce([contrato]).mockImplementationOnce(() =>
    new Promise(resolve => { concluir = resolve; }));
  render(<ContratosListPage />);
  expect(await screen.findByText('QA-2026')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Atualizar lista' }));
  expect(screen.getByText('QA-2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizando...' })).toBeDisabled();
  await waitFor(() => expect(concluir).toEqual(expect.any(Function)));
  await act(async () => { concluir([contrato]); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Atualizar lista' })).toBeEnabled());
  expect(screen.getByText('QA-2026')).toBeInTheDocument();
});
