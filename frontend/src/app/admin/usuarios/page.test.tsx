import { renderComConsultas } from '@/test-utils';
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import AdministracaoUsuariosPage from "./page";
import CadastrarFuncionarioPage from "./novo/page";
import { PainelAdministracao } from "./components/painel-administracao";
import { ToastNotificacoes } from "@/app/components/toast-notificacoes";
import {
  atualizarFuncionario, cadastrarFuncionario, consultarMeuPerfil, consultarUsuariosPaginados,
  buscarFuncionarioPorId, alterarEmailFuncionario, redefinirSenhaFuncionario,
  listarPermissoesFuncionario, listarContratosAdministracao, concederPermissaoFuncionario, ErroApi,
} from "@/lib/admin-usuarios";

const substituir = jest.fn();
const navegar = jest.fn();
const mockRouter = { replace: substituir, push: navegar, refresh: jest.fn() };
jest.mock("next/navigation", () => ({ useRouter: () => mockRouter, usePathname: () => "/admin/usuarios" }));
jest.mock("@/lib/admin-usuarios", () => ({
  ...jest.requireActual("@/lib/admin-usuarios"),
  consultarMeuPerfil: jest.fn(), consultarUsuariosPaginados: jest.fn(),
  buscarFuncionarioPorId: jest.fn(),
  cadastrarFuncionario: jest.fn(), atualizarFuncionario: jest.fn(),
  alterarEmailFuncionario: jest.fn(), redefinirSenhaFuncionario: jest.fn(),
  listarPermissoesFuncionario: jest.fn(() => Promise.resolve([])),
  listarContratosAdministracao: jest.fn(() => Promise.resolve([])),
  concederPermissaoFuncionario: jest.fn(), revogarPermissaoFuncionario: jest.fn(),
}));
const eu = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const paginados = consultarUsuariosPaginados as jest.MockedFunction<typeof consultarUsuariosPaginados>;
const porId = buscarFuncionarioPorId as jest.MockedFunction<typeof buscarFuncionarioPorId>;
const criar = cadastrarFuncionario as jest.MockedFunction<typeof cadastrarFuncionario>;
const atualizar = atualizarFuncionario as jest.MockedFunction<typeof atualizarFuncionario>;
const atualizarEmail = alterarEmailFuncionario as jest.MockedFunction<typeof alterarEmailFuncionario>;
const acessos = listarPermissoesFuncionario as jest.MockedFunction<typeof listarPermissoesFuncionario>;
const contratos = listarContratosAdministracao as jest.MockedFunction<typeof listarContratosAdministracao>;
const conceder = concederPermissaoFuncionario as jest.MockedFunction<typeof concederPermissaoFuncionario>;
const redefinirSenha = redefinirSenhaFuncionario as jest.MockedFunction<typeof redefinirSenhaFuncionario>;
const admin = { id: "a", nome: null, email: "admin@exemplo.com", perfil: "ADMINISTRADOR" as const, ativo: true, criadoEm: "2026-10-25T19:40:20Z" };
const gestor = { id: "b", nome: "Gestor de Teste", email: "gestor@exemplo.com", perfil: "GESTOR" as const, ativo: true, criadoEm: "2026-10-26T10:00:00Z" };

beforeEach(() => {
  jest.clearAllMocks();
  eu.mockResolvedValue(admin);
  porId.mockResolvedValue(gestor);
  acessos.mockResolvedValue([]); contratos.mockResolvedValue([]);
  paginados.mockImplementation(async (opts) => ({
    itens: opts.limite === 1 ? [admin] : opts.ativo ? [admin, gestor] : [],
    pagina: opts.pagina ?? 1, limite: opts.limite ?? 20,
    total: opts.ativo ? 2 : 0, totalPaginas: 1,
  }));
});

test("listagem exibe ação de cadastro sem botão manual de atualizar", async () => {
  renderComConsultas(<AdministracaoUsuariosPage />);
  const lista = await screen.findByRole("region", { name: "Funcionários" });
  expect(within(lista).getByText("gestor@exemplo.com")).toBeInTheDocument();
  expect(paginados).toHaveBeenCalled();
  const cadastrar = within(lista).getByRole("link", { name: "Cadastrar funcionário" });
  expect(cadastrar).toHaveAttribute("href", "/admin/usuarios/novo");
  expect(within(lista).queryByRole("button", { name: "Atualizar lista" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Senha inicial")).not.toBeInTheDocument();
});

test("a própria conta Administrador não aparece na área Funcionários, mesmo em payload legado", async () => {
  // Defesa da UI: evita apresentar a conta no painel antes mesmo de atualizar o backend.
  renderComConsultas(<AdministracaoUsuariosPage />);
  const lista = await screen.findByRole("region", { name: "Funcionários" });
  expect(within(lista).getByText("gestor@exemplo.com")).toBeInTheDocument();
  expect(within(lista).queryByText("admin@exemplo.com")).not.toBeInTheDocument();
  expect(within(lista).queryByRole("link", { name: "Editar admin@exemplo.com" })).not.toBeInTheDocument();
});

test("editar é link para página própria", async () => {
  renderComConsultas(<AdministracaoUsuariosPage />);
  const lista = await screen.findByRole("region", { name: "Funcionários" });
  expect(within(lista).getByRole("link", { name: "Editar gestor@exemplo.com" }))
    .toHaveAttribute("href", "/admin/usuarios/b/editar");
  expect(screen.queryByRole("region", { name: /Editar funcionário/ })).not.toBeInTheDocument();
});

test("Gestor não acessa listagem", async () => {
  eu.mockResolvedValue({ ...admin, perfil: "GESTOR" });
  renderComConsultas(<AdministracaoUsuariosPage />);
  expect(await screen.findByRole("heading", { name: "Acesso restrito" })).toBeInTheDocument();
  expect(paginados).not.toHaveBeenCalled();
});

test("sessão expirada redireciona sem mostrar dados", async () => {
  eu.mockRejectedValue(new ErroApi(401, "Sessão expirada"));
  renderComConsultas(<AdministracaoUsuariosPage />);
  await waitFor(() => expect(substituir).toHaveBeenCalledWith("/login"));
  expect(screen.queryByText("gestor@exemplo.com")).not.toBeInTheDocument();
});

test("abas ativos e arquivados usam filtro servidor", async () => {
  renderComConsultas(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: /Arquivados \(/ }));
  await waitFor(() => expect(paginados).toHaveBeenCalledWith(expect.objectContaining({ ativo: false, pagina: 1 })));
});

test("cadastrar possui formulário isolado e valida senha antes da API", async () => {
  renderComConsultas(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Nova conta de funcionário", level: 2 });
  expect(screen.queryByRole("region", { name: "Funcionários" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: gestor.email } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "fraca" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "fraca" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  expect(await screen.findByText("A senha precisa ter ao menos 12 caracteres.")).toBeInTheDocument();
  expect(criar).not.toHaveBeenCalled();
});

test("cadastro válido grava via API e retorna à listagem", async () => {
  criar.mockResolvedValue(gestor);
  renderComConsultas(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Nova conta de funcionário", level: 2 });
  fireEvent.change(screen.getByLabelText("Nome completo"), { target: { value: gestor.nome } });
  fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "GESTOR@EXEMPLO.COM" } });
  fireEvent.change(screen.getByLabelText("Senha inicial"), { target: { value: "ForteSenha!123" } });
  fireEvent.change(screen.getByLabelText("Confirmar senha"), { target: { value: "ForteSenha!123" } });
  fireEvent.click(screen.getByRole("button", { name: "Cadastrar funcionário" }));
  await waitFor(() => expect(criar).toHaveBeenCalledWith(expect.objectContaining({ email: gestor.email })));
  expect(substituir).toHaveBeenCalledWith("/admin/usuarios");
});

test("edição abre por UUID consultando API individual, mesmo fora das 100 primeiras contas", async () => {
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  expect(await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ })).toBeInTheDocument();
  expect(porId).toHaveBeenCalledWith("b");
  expect(paginados).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Perfil de acesso")).toHaveValue("GESTOR");
  expect(screen.queryByRole("region", { name: "Funcionários" })).not.toBeInTheDocument();
});



test("edição de conta com nome não referencia aviso ARIA inexistente", async () => {
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  const nome = await screen.findByLabelText("Nome completo");
  expect(nome).not.toHaveAttribute("aria-describedby");
  expect(document.getElementById("aviso-nome-legado")).toBeNull();
});

test("edição de conta legada sem nome vincula o aviso ARIA visível", async () => {
  porId.mockResolvedValue({ ...gestor, nome: null });
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  const nome = await screen.findByLabelText("Nome completo");
  expect(nome).toHaveAttribute("aria-describedby", "aviso-nome-legado");
  expect(document.getElementById("aviso-nome-legado")).toHaveTextContent(/Nome legado opcional/);
});

test("edição salva o PATCH e permanece na página para gerenciar credenciais", async () => {
  atualizar.mockResolvedValue({ ...gestor, perfil: "COLABORADOR", ativo: false });
  renderComConsultas(<><ToastNotificacoes /><PainelAdministracao vista="edicao" idEdicao="b" /></>);
  await screen.findByLabelText("Perfil de acesso");
  fireEvent.change(screen.getByLabelText("Perfil de acesso"), { target: { value: "COLABORADOR" } });
  fireEvent.click(screen.getByRole("button", { name: "Salvar dados da conta" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", { perfil: "COLABORADOR" }));
  expect(screen.getByText(/Dados de gestor@exemplo.com atualizados/)).toBeInTheDocument();
});

test("editar Administrador permite somente o próprio nome", async () => {
  porId.mockResolvedValue(admin);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="a" />);
  await screen.findByLabelText("Nome completo");
  expect(screen.queryByLabelText("Perfil de acesso")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Novo e-mail")).not.toBeInTheDocument();
});

test("edição de credenciais não usa o PATCH de domínio", async () => {
  atualizarEmail.mockResolvedValue({ ...gestor, email: "novo@exemplo.com" });
  redefinirSenha.mockResolvedValue(undefined);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText("Alterar e-mail", { exact: false, selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Novo e-mail"), { target: { value: "novo@exemplo.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar mudança de e-mail" }));
  await waitFor(() => expect(atualizarEmail).toHaveBeenCalledWith("b", "novo@exemplo.com"));
  fireEvent.click(screen.getByText("Redefinir senha", { exact: false, selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.change(screen.getByLabelText("Confirmar nova senha"), { target: { value: "NovaSenha!1234" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar redefinição de senha" }));
  await waitFor(() => expect(redefinirSenha).toHaveBeenCalledWith("b", "NovaSenha!1234"));
  expect(atualizar).not.toHaveBeenCalled();
});

test("edição mantém retorno para lista e ações próprias sem recriar a navegação", async () => {
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Navegação móvel" })).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Voltar aos funcionários/ })).toHaveAttribute("href", "/admin/usuarios");
  expect(screen.getByRole("button", { name: "Salvar dados da conta" })).toBeInTheDocument();
});

test('botões administrativos são compactos, interativos e com realce no hover', async () => {
  contratos.mockResolvedValue([{ id: 'ct-ui', codigoPublico: '00001', numeroContrato: 'Contrato de UI',
    orgaoContratante: 'UTFPR', status: 'PLANEJAMENTO' }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole('heading', { name: /Conta de Gestor de Teste/ });
  const salvar = screen.getByRole('button', { name: 'Salvar dados da conta' });
  expect(salvar).toHaveClass('cursor-pointer', 'min-h-9', 'hover:bg-brand-green/90', 'focus-visible:outline-2');
  expect(salvar).not.toHaveClass('min-h-11', 'min-w-44', 'px-5');
  fireEvent.click(screen.getByText('Alterar e-mail', { exact: false, selector: 'summary' }));
  const alterarEmail = screen.getByRole('button', { name: 'Confirmar mudança de e-mail' });
  expect(alterarEmail).toHaveClass('hover:bg-brand-green/90', 'cursor-pointer');
  fireEvent.click(screen.getByText('Redefinir senha', { exact: false, selector: 'summary' }));
  const alterarSenha = screen.getByRole('button', { name: 'Confirmar redefinição de senha' });
  expect(alterarSenha).toHaveClass('min-h-9', 'cursor-pointer');
  fireEvent.click(screen.getByText('Acesso aos contratos', { exact: false, selector: 'summary' }));
  const vincular = screen.getByRole('button', { name: 'Adicionar vínculo' });
  expect(vincular).toHaveClass('min-h-9', 'cursor-pointer', 'hover:bg-brand-green/90');
  expect(vincular).not.toHaveClass('min-h-11', 'min-w-44', 'px-5');
});

test("arquivamento ainda exige confirmação visual simples", async () => {
  atualizar.mockResolvedValue({ ...gestor, ativo: false });
  renderComConsultas(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: "Arquivar" }));
  const dialogo = screen.getByRole("dialog", { name: "Arquivar funcionário?" });
  expect(atualizar).not.toHaveBeenCalled();
  fireEvent.click(within(dialogo).getByRole("button", { name: "Arquivar" }));
  await waitFor(() => expect(atualizar).toHaveBeenCalledWith("b", { ativo: false }));
});


test("cadastro e listagem não remontam navegação global", async () => {
  const { unmount } = renderComConsultas(<CadastrarFuncionarioPage />);
  await screen.findByRole("heading", { name: "Nova conta de funcionário", level: 2 });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
  unmount();
  renderComConsultas(<AdministracaoUsuariosPage />);
  await screen.findByRole("region", { name: "Funcionários" });
  expect(screen.queryByRole("complementary", { name: "Navegação principal" })).not.toBeInTheDocument();
});

test("vários vínculos existentes aparecem e não podem ser adicionados duas vezes", async () => {
  contratos.mockResolvedValue([
    { id: "ct1", codigoPublico: "00001", numeroContrato: "001/26", orgaoContratante: "UTFPR", status: "PLANEJAMENTO" },
    { id: "ct2", codigoPublico: "00002", numeroContrato: "002/26", orgaoContratante: "Prefeitura", status: "PLANEJAMENTO" },
    { id: "ct3", codigoPublico: "00003", numeroContrato: "003/26", orgaoContratante: "Universidade", status: "PLANEJAMENTO" },
  ]);
  acessos.mockResolvedValue([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText("Acesso aos contratos", { exact: false, selector: "summary" }));
  const lista = screen.getByRole("region", { name: "Contratos vinculados" });
  expect(within(lista).getAllByText(/001\/26/).length).toBeGreaterThan(0);
  expect(within(lista).getAllByText(/002\/26/).length).toBeGreaterThan(0);
  const seletor = screen.getByLabelText("Selecionar contrato ainda não vinculado");
  expect(within(seletor).getAllByRole("option")).toHaveLength(1);
  expect(within(seletor).getByRole("option", { name: /003\/26/ })).toBeInTheDocument();
  conceder.mockResolvedValue({ contratoId: "ct3", podeEditar: false });
  acessos.mockResolvedValueOnce([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }])
    .mockResolvedValueOnce([{ contratoId: "ct1", podeEditar: true }, { contratoId: "ct2", podeEditar: false }, { contratoId: "ct3", podeEditar: false }]);
  fireEvent.click(screen.getByRole("button", { name: "Adicionar vínculo" }));
  await waitFor(() => expect(conceder).toHaveBeenCalledWith("b", expect.objectContaining({
    contratoId: "ct3", podeEditar: false,
    permissoesDetalhadas: expect.objectContaining({ criarEtapas: false, enviarComprovantes: false, arquivarEtapas: false, excluirEtapasArquivadas: false }),
  })));
});


test("novo vínculo começa em somente leitura; depois, permitir edição ativa arquivamento e ordenação", async () => {
  contratos.mockResolvedValue([{ id: 'novo', codigoPublico: '00001', numeroContrato: 'A', orgaoContratante: 'UTFPR', status: 'PLANEJAMENTO' }]);
  // O mock acompanha o estado persistido: não depende de quantas consultas o React fez.
  let vinculos: Awaited<ReturnType<typeof listarPermissoesFuncionario>> = [];
  acessos.mockImplementation(async () => vinculos);
  conceder.mockImplementation(async (_usuario, dados) => {
    vinculos = [dados];
    return dados;
  });
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole('heading', { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText('Acesso aos contratos', { exact: false, selector: 'summary' }));
  expect(screen.queryByRole('radio', { name: /Edição delegada/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Adicionar vínculo' }));
  await waitFor(() => expect(conceder).toHaveBeenCalledWith('b', expect.objectContaining({
    contratoId: 'novo', podeEditar: false,
    permissoesDetalhadas: expect.objectContaining({ criarEtapas: false, arquivarEtapas: false, reativarEtapas: false,
      excluirEtapasArquivadas: false }),
  })));
  const editar = await screen.findByRole('button', { name: 'Permitir edição' });
  fireEvent.click(editar);
  const confirmarEdicao = screen.getByRole('dialog', { name: 'Permitir edição neste contrato?' });
  expect(within(confirmarEdicao).getByText(/criar e editar etapas/)).toBeInTheDocument();
  expect(conceder).toHaveBeenCalledTimes(1); // Antes de confirmar, apenas o vínculo de leitura.
  fireEvent.click(within(confirmarEdicao).getByRole('button', { name: 'Permitir edição' }));
  await waitFor(() => expect(conceder).toHaveBeenCalledWith('b', expect.objectContaining({
    contratoId: 'novo', podeEditar: true,
    permissoesDetalhadas: expect.objectContaining({ criarEtapas: true, reordenarEtapas: true,
      arquivarEntregaveis: true, arquivarEtapas: true, reativarEntregaveis: false,
      reativarEtapas: false, excluirEntregaveisArquivados: false }),
  })));
});

test("troca de nível exige confirmação antes de sobrescrever permissões existentes", async () => {
  contratos.mockResolvedValue([{ id: 'acesso', codigoPublico: '00001', numeroContrato: 'A', orgaoContratante: 'UTFPR', status: 'PLANEJAMENTO' }]);
  acessos.mockResolvedValue([{ contratoId: 'acesso', podeEditar: true, permissoesDetalhadas: { criarEtapas: true, excluirEtapasArquivadas: true } }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole('heading', { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText('Acesso aos contratos', { exact: false, selector: 'summary' }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover edição' }));
  expect(conceder).not.toHaveBeenCalled();
  const confirmacaoLeitura = screen.getByRole('dialog', { name: 'Voltar para somente leitura?' });
  expect(within(confirmacaoLeitura).getByText(/apenas consultar o contrato, as etapas/)).toBeInTheDocument();
  fireEvent.click(within(confirmacaoLeitura).getByRole('button', { name: 'Cancelar' }));
  expect(conceder).not.toHaveBeenCalled();
});

test('cartão identifica permissões personalizadas sem confundi-las com edição padrão', async () => {
  contratos.mockResolvedValue([{ id: 'custom', codigoPublico: '00021', numeroContrato: 'Contrato personalizado',
    orgaoContratante: 'UTFPR', status: 'PLANEJAMENTO' }]);
  acessos.mockResolvedValue([{ contratoId: 'custom', podeEditar: true,
    permissoesDetalhadas: { criarEtapas: true, reordenarEtapas: false, arquivarEntregaveis: true } }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole('heading', { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText('Acesso aos contratos', { exact: false, selector: 'summary' }));
  const regiao = screen.getByRole('region', { name: 'Contratos vinculados' });
  expect(within(regiao).getByTestId('permissao-contrato-custom'))
    .toHaveTextContent('Pode editar · permissões personalizadas ativas');
  fireEvent.click(within(regiao).getByRole('button', { name: 'Remover edição' }));
  const dialogo = screen.getByRole('dialog', { name: 'Voltar para somente leitura?' });
  expect(within(dialogo).getByText(/permissões personalizadas atuais serão desativadas/)).toBeInTheDocument();
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
  expect(conceder).not.toHaveBeenCalled();
});

test("administração não duplica cabeçalho de rota nem identificação de sessão", async () => {
  const { container } = renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  // O título da rota e o perfil logado agora pertencem exclusivamente ao layout global.
  expect(screen.queryByRole("heading", { name: /^Editar funcionário$/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Administrador autenticado")).not.toBeInTheDocument();
  expect(container.querySelector("header")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Voltar aos funcionários" })).toHaveAttribute("href", "/admin/usuarios");
});

test("alternar situação recarrega a lista sem botão Atualizar", async () => {
  renderComConsultas(<AdministracaoUsuariosPage />);
  await screen.findByText("gestor@exemplo.com");
  fireEvent.click(screen.getByRole("button", { name: /Arquivados/ }));
  await waitFor(() => expect(paginados).toHaveBeenCalledWith(expect.objectContaining({ ativo: false, pagina: 1 })));
  expect(screen.queryByRole("button", { name: "Atualizar lista" })).not.toBeInTheDocument();
});

test("acessos exibem resumo curto mesmo em telas largas, sem perder identificação completa", async () => {
  const numero = "9".repeat(140);
  const orgao = "Órgão contratante de nome excepcionalmente extenso ".repeat(5);
  contratos.mockResolvedValue([
    { id: "contrato-longo", codigoPublico: "84354", numeroContrato: numero, orgaoContratante: orgao, status: "PLANEJAMENTO" },
    { id: "contrato-livre", codigoPublico: "75320", numeroContrato: "Contrato disponível muito extenso".repeat(10), orgaoContratante: "Organização extensa".repeat(10), status: "PLANEJAMENTO" },
  ]);
  acessos.mockResolvedValue([{ contratoId: "contrato-longo", podeEditar: true }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText("Acesso aos contratos", { exact: false, selector: "summary" }));
  const lista = screen.getByRole("region", { name: "Contratos vinculados" });
  const titulo = within(lista).getByTitle(numero);
  const cartao = titulo.closest("li");
  expect(cartao).not.toBeNull();
  expect(cartao).toHaveClass("@container");
  expect(titulo).toHaveClass("truncate");
  expect(titulo).toHaveTextContent(numero); // Nome completo no DOM; ellipsis depende do espaço real.
  expect(cartao).not.toHaveTextContent(orgao); // Órgão somente no modal de identificação.
  expect(within(lista).getByText("Código #84354")).toBeInTheDocument();
  expect(within(lista).getByTestId("permissao-contrato-contrato-longo")).toHaveTextContent("Vínculo anterior · revise as permissões");
  const expandir = within(lista).getByRole("button", { name: `Ver identificação completa do contrato ${numero}` });
  expect(expandir).toHaveClass("underline");
  expect(expandir).toBe(titulo); // Título sublinhado aciona o modal, sem frase redundante.
  const corpoCartao = cartao?.firstElementChild;
  expect(corpoCartao).toHaveClass("space-y-3");
  expect(corpoCartao?.lastElementChild).toHaveClass("flex-wrap");
  expect(within(lista).getByRole("button", { name: "Remover edição" })).toBeInTheDocument();
  expect(within(lista).getByRole("button", { name: "Revogar acesso" })).toBeInTheDocument();
  const controlePermissoes = within(lista).getByRole("button", { name: "Ver permissões completas" });
  fireEvent.click(controlePermissoes);
  const permissoesModal = screen.getByRole("dialog", { name: "Permissões do contrato" });
  // O modal agora distribui permissões por nível e grupo; não exibe todas de uma vez.
  expect(within(permissoesModal).queryByRole("checkbox", { name: "Criar etapas" })).not.toBeInTheDocument();
  fireEvent.click(within(permissoesModal).getByRole("tab", { name: "Etapas" }));
  expect(within(permissoesModal).getByRole("checkbox", { name: "Criar etapas" })).toBeInTheDocument();
  const estadoAntesPermissoes = window.history.state;
  const voltarPermissoes = jest.spyOn(window.history, 'back').mockImplementation(() => window.history.replaceState({}, '', window.location.href));
  fireEvent.click(within(permissoesModal).getByRole("button", { name: "Fechar permissões" }));
  expect(screen.queryByRole("dialog", { name: "Permissões do contrato" })).not.toBeInTheDocument();
  voltarPermissoes.mockRestore();
  window.history.replaceState(estadoAntesPermissoes, '', window.location.href);
  const urlOriginal = window.location.href;
  const estadoAnterior = window.history.state;
  const voltar = jest.spyOn(window.history, "back").mockImplementation(() => {
    window.history.replaceState(estadoAnterior, "", urlOriginal);
  });
  fireEvent.click(expandir);
  const modal = screen.getByRole("dialog", { name: "Identificação completa do contrato" });
  expect(modal).toHaveAttribute("aria-modal", "true");
  expect(within(modal).getByText("Código #84354")).toBeInTheDocument();
  expect(within(modal).getByText(numero)).toBeInTheDocument();
  expect(within(modal).getByText(orgao.trim()).textContent).toBe(orgao);
  expect(window.location.href).toBe(urlOriginal);
  fireEvent.keyDown(modal, { key: "Escape" });
  expect(screen.queryByRole("dialog", { name: "Identificação completa do contrato" })).not.toBeInTheDocument();
  expect(expandir).toHaveFocus();
  expect(voltar).toHaveBeenCalledTimes(1);
  voltar.mockRestore();
  const seletor = screen.getByLabelText("Selecionar contrato ainda não vinculado") as HTMLSelectElement;
  expect(seletor).toHaveClass("max-w-full", "truncate");
  const opcoes = within(seletor).getAllByRole("option");
  expect(opcoes).toHaveLength(1);
  expect(opcoes[0]).toHaveValue("contrato-livre");
  expect(opcoes[0]).toHaveTextContent(/^#75320 · Contrato disponível/);
  expect(opcoes[0]).toHaveAttribute("title", "Contrato disponível muito extenso".repeat(10));
  expect(Array.from(opcoes[0].textContent ?? "").length).toBeLessThanOrEqual(44);
  expect(opcoes[0]).toHaveTextContent(/…$/);
  expect(opcoes[0].textContent).not.toContain("Organização extensa");
});


test("permissões vinculadas mostram leitura e edição em cada contrato do gestor", async () => {
  contratos.mockResolvedValue([
    { id: "edicao", codigoPublico: "00001", numeroContrato: "Contrato A", orgaoContratante: "Orgão A", status: "PLANEJAMENTO" },
    { id: "leitura", codigoPublico: "00002", numeroContrato: "Contrato B", orgaoContratante: "Orgão B", status: "PLANEJAMENTO" },
  ]);
  acessos.mockResolvedValue([
    { contratoId: "edicao", podeEditar: true },
    { contratoId: "leitura", podeEditar: false },
  ]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText("Acesso aos contratos", { exact: false, selector: "summary" }));
  const regiao = screen.getByRole("region", { name: "Contratos vinculados" });
  expect(within(regiao).getByTestId("permissao-contrato-edicao"))
    .toHaveTextContent("Vínculo anterior · revise as permissões");
  expect(within(regiao).getByTestId("permissao-contrato-leitura"))
    .toHaveTextContent("Vínculo anterior · revise as permissões");
});

test("colaborador mostra apenas leitura, mesmo em permissão legada inconsistente", async () => {
  porId.mockResolvedValue({ ...gestor, perfil: "COLABORADOR" });
  contratos.mockResolvedValue([
    { id: "contrato-a", codigoPublico: "00003", numeroContrato: "Contrato A", orgaoContratante: "Órgão A", status: "PLANEJAMENTO" },
  ]);
  acessos.mockResolvedValue([{ contratoId: "contrato-a", podeEditar: true }]);
  renderComConsultas(<PainelAdministracao vista="edicao" idEdicao="b" />);
  await screen.findByRole("heading", { name: /Conta de Gestor de Teste/ });
  fireEvent.click(screen.getByText("Acesso aos contratos", { exact: false, selector: "summary" }));
  const regiao = screen.getByRole("region", { name: "Contratos vinculados" });
  expect(within(regiao).getByTestId("permissao-contrato-contrato-a"))
    .toHaveTextContent("Vínculo anterior · revise as permissões");
  expect(within(regiao).getByRole("button", { name: "Permitir edição" })).toBeInTheDocument();
});
