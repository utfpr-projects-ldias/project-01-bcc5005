import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
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


test('captura de tela com perda rápida de foco não reinicia formulário nem revalida a sessão', async () => {
  render(<ProtecaoSessaoInterna><input aria-label="Rascunho" defaultValue="Em edição" /></ProtecaoSessaoInterna>);
  const campo = await screen.findByRole('textbox', { name: 'Rascunho' });
  fireEvent.change(campo, { target: { value: 'Ainda estou editando' } });
  const consultas = perfil.mock.calls.length;
  await act(async () => {
    window.dispatchEvent(new Event('blur'));
    window.dispatchEvent(new Event('focus'));
  });
  expect(perfil).toHaveBeenCalledTimes(consultas);
  expect(screen.getByRole('textbox', { name: 'Rascunho' })).toBe(campo);
  expect(campo).toHaveValue('Ainda estou editando');
});

test('revalidação com foco após ausência prolongada mantém formulário montado e protege os dados', async () => {
  const agora = jest.spyOn(Date, 'now');
  let instante = 1000;
  agora.mockImplementation(() => instante);
  try {
    render(<ProtecaoSessaoInterna><input aria-label="Rascunho" defaultValue="Valor original" /></ProtecaoSessaoInterna>);
    const campo = await screen.findByRole('textbox', { name: 'Rascunho' });
    fireEvent.change(campo, { target: { value: 'Texto sem salvar' } });
    let liberar!: (u: typeof usuario) => void;
    perfil.mockImplementationOnce(() => new Promise<typeof usuario>(res => { liberar = res; }));
    await act(async () => { window.dispatchEvent(new Event('blur')); });
    instante += 5000;
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    expect(campo.isConnected).toBe(true);
    expect(campo.closest('.hidden')).not.toBeNull();
    await act(async () => { liberar(usuario); });
    expect(screen.getByRole('textbox', { name: 'Rascunho' })).toBe(campo);
    expect(campo).toHaveValue('Texto sem salvar');
  } finally { agora.mockRestore(); }
});


test('troca da identidade remonta formulário e descarta rascunho do usuário anterior', async () => {
  render(<ProtecaoSessaoInterna><input aria-label="Rascunho" defaultValue="Vazio" /></ProtecaoSessaoInterna>);
  const antigo = await screen.findByRole('textbox', { name: 'Rascunho' });
  fireEvent.change(antigo, { target: { value: 'Privado do usuário A' } });
  perfil.mockResolvedValueOnce({ ...usuario, id: '22222222-2222-4222-8222-222222222222' });
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  const novo = screen.getByRole('textbox', { name: 'Rascunho' });
  expect(novo).not.toBe(antigo);
  expect(novo).toHaveValue('Vazio');
  expect(mockLimpar).toHaveBeenCalled();
});
