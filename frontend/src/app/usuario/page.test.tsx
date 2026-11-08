import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import MinhaContaPage from './page';
import { alterarMeuEmail, alterarMeuNome, alterarMinhaSenha } from '@/lib/admin-usuarios';

const invalidar = jest.fn();
const limpar = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: mockReplace }) }));
const perfilAdmin = { id: 'uuid-admin', nome: 'Admin QA', email: 'admin@qa.org', perfil: 'ADMINISTRADOR', ativo: true };
let perfil: typeof perfilAdmin | undefined;
jest.mock('@/hooks/use-meu-perfil', () => ({
  useMeuPerfil: () => ({ dados: perfil, carregando: false, erro: null }), CHAVE_PERFIL: ['identidade', 'me'],
}));
jest.mock('@/app/components/provedor-consultas', () => ({ useRepositorioConsultas: () => ({ invalidar, limpar }) }));
jest.mock('@/lib/admin-usuarios', () => ({
  alterarMeuEmail: jest.fn(), alterarMeuNome: jest.fn(), alterarMinhaSenha: jest.fn(),
  ErroApi: class ErroApi extends Error { constructor(public status: number, msg: string) { super(msg); } },
}));

beforeEach(() => {
  jest.clearAllMocks(); perfil = perfilAdmin;
  (alterarMeuNome as jest.Mock).mockResolvedValue({ ...perfilAdmin, nome: 'Administrador Atualizado' });
  (alterarMeuEmail as jest.Mock).mockResolvedValue({ ...perfilAdmin, email: 'novo@qa.org' });
  (alterarMinhaSenha as jest.Mock).mockResolvedValue(undefined);
});

test('formulários exibidos somente para Administrador, com senha atual exigida', () => {
  render(<MinhaContaPage />);
  expect(screen.getByRole('heading', {name: 'Minha conta'})).toBeInTheDocument();
  const emailForm = screen.getByRole('form', {name: 'Alterar meu e-mail'});
  expect(within(emailForm).getByLabelText('Senha atual')).toBeRequired();
  const senhaForm = screen.getByRole('form', {name: 'Alterar minha senha'});
  expect(within(senhaForm).getByLabelText('Senha atual')).toBeRequired();
  expect(within(senhaForm).getByLabelText('Confirme a nova senha')).toBeRequired();
  expect(screen.queryByRole('link', { name: 'Voltar a Funcionários' })).not.toBeInTheDocument();
});

test('Gestor não recebe edição de credenciais do admin', () => {
  perfil = { ...perfilAdmin, perfil: 'GESTOR' };
  render(<MinhaContaPage />);
  expect(screen.getByText(/exclusivas do Administrador/)).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Alterar meu nome' })).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Alterar meu e-mail' })).not.toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Alterar minha senha' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Voltar a Funcionários' })).not.toBeInTheDocument();
});

test('envio de e-mail exige senha atual e invalida perfil após sucesso', async () => {
  render(<MinhaContaPage />);
  const form = screen.getByRole('form', {name: 'Alterar meu e-mail'});
  fireEvent.change(within(form).getByLabelText('Novo e-mail'), {target: {value: 'novo@qa.org'}});
  fireEvent.change(within(form).getByLabelText('Senha atual'), {target: {value: 'SenhaAtual!123'}});
  fireEvent.submit(form);
  await waitFor(() => expect(alterarMeuEmail).toHaveBeenCalledWith('novo@qa.org', 'SenhaAtual!123'));
  expect(invalidar).toHaveBeenCalledWith(['identidade', 'me']);
});

test('rejeita confirmação de senha divergente sem chamar API', () => {
  render(<MinhaContaPage />);
  const form = screen.getByRole('form', {name: 'Alterar minha senha'});
  fireEvent.change(within(form).getByLabelText('Senha atual'), {target: {value: 'SenhaAtual!123'}});
  fireEvent.change(within(form).getByLabelText('Nova senha'), {target: {value: 'NovaSenha!123456'}});
  fireEvent.change(within(form).getByLabelText('Confirme a nova senha'), {target: {value: 'OutraSenha!123456'}});
  fireEvent.submit(form);
  expect(screen.getByRole('alert')).toHaveTextContent('não coincidem');
  expect(alterarMinhaSenha).not.toHaveBeenCalled();
});

test('após alterar a própria senha revoga o cache local e usa o roteador Next para login', async () => {
  render(<MinhaContaPage />);
  const form = screen.getByRole('form', { name: 'Alterar minha senha' });
  fireEvent.change(within(form).getByLabelText('Senha atual'), { target: { value: 'SenhaAtual!123' } });
  fireEvent.change(within(form).getByLabelText('Nova senha'), { target: { value: 'SenhaNova!123456' } });
  fireEvent.change(within(form).getByLabelText('Confirme a nova senha'), { target: { value: 'SenhaNova!123456' } });
  fireEvent.submit(form);
  await waitFor(() => expect(alterarMinhaSenha).toHaveBeenCalledWith('SenhaAtual!123', 'SenhaNova!123456'));
  await waitFor(() => expect(limpar).toHaveBeenCalledTimes(1));
  expect(mockReplace).toHaveBeenCalledWith('/login');
  expect(limpar.mock.invocationCallOrder[0]).toBeLessThan(mockReplace.mock.invocationCallOrder[0]);
});


test('Minha conta mostra nome, email e perfil que não aparecem no cabeçalho', () => {
  render(<MinhaContaPage />);
  const conta = screen.getByRole('region', { name: 'Dados da conta' });
  expect(conta).toHaveTextContent('Admin QA');
  expect(conta).toHaveTextContent('admin@qa.org');
  expect(conta).toHaveTextContent('Administrador');
});


test('o próprio usuário ativo pode alterar nome sem modificar e-mail ou senha', async () => {
  perfil = { ...perfilAdmin, perfil: 'GESTOR' };
  render(<MinhaContaPage />);
  const formulario = screen.getByRole('form', { name: 'Alterar meu nome' });
  fireEvent.change(within(formulario).getByLabelText('Nome completo'), { target: { value: '  Maria   Oliveira  ' } });
  fireEvent.submit(formulario);
  await waitFor(() => expect(alterarMeuNome).toHaveBeenCalledWith('Maria Oliveira'));
  expect(invalidar).toHaveBeenCalledWith(['identidade', 'me']);
  expect(alterarMeuEmail).not.toHaveBeenCalled();
  expect(alterarMinhaSenha).not.toHaveBeenCalled();
});

test('nome inválido não dispara escrita na API', () => {
  render(<MinhaContaPage />);
  const formulario = screen.getByRole('form', { name: 'Alterar meu nome' });
  fireEvent.change(within(formulario).getByLabelText('Nome completo'), { target: { value: 'Unico' } });
  fireEvent.submit(formulario);
  expect(screen.getByRole('alert')).toHaveTextContent('nome e sobrenome');
  expect(alterarMeuNome).not.toHaveBeenCalled();
});
