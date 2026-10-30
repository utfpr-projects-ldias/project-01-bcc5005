import { act, render, screen, waitFor } from '@testing-library/react';
import { ProtecaoSessaoInterna } from './protecao-sessao-interna';
import { useRepositorioConsultas } from './provedor-consultas';
import { doesSessionExist } from 'supertokens-web-js/recipe/session';
import { consultarMeuPerfil, ErroApi } from '@/lib/admin-usuarios';

const mockSubstituir = jest.fn();
const mockLimpar = jest.fn();
const mockRoteador = { replace: mockSubstituir };
jest.mock('next/navigation', () => ({ useRouter: () => mockRoteador }));
jest.mock('supertokens-web-js/recipe/session', () => ({ doesSessionExist: jest.fn() }));
jest.mock('@/lib/admin-usuarios', () => ({
  ...jest.requireActual('@/lib/admin-usuarios'),
  consultarMeuPerfil: jest.fn(),
}));
jest.mock('./provedor-consultas', () => ({ useRepositorioConsultas: jest.fn() }));
const sessao = doesSessionExist as jest.Mock;
const perfil = consultarMeuPerfil as jest.Mock;
const hookCache = useRepositorioConsultas as jest.Mock;
const usuario = { id: '11111111-1111-4111-8111-111111111111', ativo: true, perfil: 'GESTOR', email: 'qa@teste.com', nome: 'QA' };

beforeEach(() => {
  jest.clearAllMocks();
  hookCache.mockReturnValue({ limpar: mockLimpar });
  sessao.mockResolvedValue(true);
  perfil.mockResolvedValue(usuario);
});

test('rota interna só apresenta conteúdo após sessão e conta ativa verificadas na API', async () => {
  const consultaPendente: { resolver?: (valor: typeof usuario) => void } = {};
  perfil.mockImplementationOnce(() => new Promise((resolve) => { consultaPendente.resolver = resolve; }));
  render(<ProtecaoSessaoInterna><p>Contrato protegido</p></ProtecaoSessaoInterna>);
  expect(screen.queryByText('Contrato protegido')).not.toBeInTheDocument();
  await waitFor(() => expect(consultaPendente.resolver).toBeDefined());
  await act(async () => { consultaPendente.resolver?.(usuario); });
  expect(await screen.findByText('Contrato protegido')).toBeInTheDocument();
});

test('sessão ausente redireciona e nunca monta dados privados', async () => {
  sessao.mockResolvedValueOnce(false);
  render(<ProtecaoSessaoInterna><p>Contrato protegido</p></ProtecaoSessaoInterna>);
  await waitFor(() => expect(mockSubstituir).toHaveBeenCalledWith('/login'));
  expect(mockLimpar).toHaveBeenCalled();
  expect(perfil).not.toHaveBeenCalled();
  expect(screen.queryByText('Contrato protegido')).not.toBeInTheDocument();
});

test('retorno à aba revalida no servidor e oculta dados quando domínio desativa conta', async () => {
  render(<ProtecaoSessaoInterna><p>Contrato protegido</p></ProtecaoSessaoInterna>);
  expect(await screen.findByText('Contrato protegido')).toBeInTheDocument();
  perfil.mockRejectedValueOnce(new ErroApi(403, 'Conta inativa'));
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Conta inativa'));
  expect(screen.queryByText('Contrato protegido')).not.toBeInTheDocument();
  expect(mockLimpar).toHaveBeenCalled();
});

test('401 na revalidação apaga cache e encaminha a login', async () => {
  render(<ProtecaoSessaoInterna><p>Etapas protegidas</p></ProtecaoSessaoInterna>);
  expect(await screen.findByText('Etapas protegidas')).toBeInTheDocument();
  perfil.mockRejectedValueOnce(new ErroApi(401, 'Sessão expirada'));
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(mockSubstituir).toHaveBeenCalledWith('/login'));
  expect(screen.queryByText('Etapas protegidas')).not.toBeInTheDocument();
});

test('troca de usuário com layout persistente invalida dados privados antigos', async () => {
  render(<ProtecaoSessaoInterna><p>Área interna</p></ProtecaoSessaoInterna>);
  expect(await screen.findByText('Área interna')).toBeInTheDocument();
  perfil.mockResolvedValueOnce({ ...usuario, id: '22222222-2222-4222-8222-222222222222' });
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await waitFor(() => expect(mockLimpar).toHaveBeenCalled());
  expect(screen.getByText('Área interna')).toBeInTheDocument();
});
