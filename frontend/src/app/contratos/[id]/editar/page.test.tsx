import { render, screen } from '@testing-library/react';
import EditarContratoPage from './page';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';

jest.mock('next/navigation', () => ({
  useParams: () => ({ id: '11111111-1111-4111-8111-111111111111' }),
  useRouter: () => ({ push: jest.fn() }),
}));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({
  useContrato: jest.fn(), useAcessoContrato: jest.fn(),
  useResponsaveis: jest.fn(), useMutacoesContrato: jest.fn(),
}));
jest.mock('../../components/formulario-contrato', () => ({
  FormularioContrato: ({ responsaveis, podeDefinirResponsavel }: {
    responsaveis: Array<{ nome: string | null }>;
    podeDefinirResponsavel: boolean;
  }) => <div data-testid="formulario-edicao">
    <span>{podeDefinirResponsavel ? 'Admin pode atribuir' : 'Atribuição indisponível'}</span>
    <span>{responsaveis.map((u) => u.nome).join(', ')}</span>
  </div>,
}));

const perfilHook = useMeuPerfil as jest.Mock;
const contratoHook = useContrato as jest.Mock;
const acessoHook = useAcessoContrato as jest.Mock;
const responsaveisHook = useResponsaveis as jest.Mock;
const mutacoesHook = useMutacoesContrato as jest.Mock;
const contrato = {
  id: '11111111-1111-4111-8111-111111111111', numeroContrato: 'CT-01',
  responsavelInternoId: null,
};
const retorno = (dados: unknown) => ({ dados, carregando: false, erro: undefined, atualizar: jest.fn() });

beforeEach(() => {
  jest.clearAllMocks();
  contratoHook.mockReturnValue(retorno(contrato));
  acessoHook.mockReturnValue(retorno({ podeEditar: true }));
  responsaveisHook.mockReturnValue(retorno({ usuarios: [{ id: 'user-1', nome: 'Gestora de QA' }], incompleta: false }));
  mutacoesHook.mockReturnValue({ editar: jest.fn() });
});

test('ADMIN consulta responsáveis ativos e consegue atribuir no formulário de edição', () => {
  perfilHook.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  render(<EditarContratoPage />);
  expect(responsaveisHook).toHaveBeenCalledWith(true);
  expect(screen.getByTestId('formulario-edicao')).toHaveTextContent('Gestora de QA');
  expect(screen.getByText('Admin pode atribuir')).toBeInTheDocument();
});

test('GESTOR com edição não consulta a lista administrativa de responsáveis', () => {
  perfilHook.mockReturnValue(retorno({ ativo: true, perfil: 'GESTOR' }));
  render(<EditarContratoPage />);
  expect(responsaveisHook).toHaveBeenCalledWith(false);
  expect(screen.getByText('Atribuição indisponível')).toBeInTheDocument();
});

test('ADMIN sem acesso confirmado não consulta responsáveis e não exibe formulário', () => {
  perfilHook.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  acessoHook.mockReturnValue(retorno({ podeEditar: false }));
  render(<EditarContratoPage />);
  expect(responsaveisHook).toHaveBeenCalledWith(false);
  expect(screen.queryByTestId('formulario-edicao')).not.toBeInTheDocument();
});
