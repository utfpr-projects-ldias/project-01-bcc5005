import { renderComConsultas } from '@/test-utils';
import { act, fireEvent, screen, within, waitFor } from '@testing-library/react';
import ContratosListPage from './page';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';
import { listarContratos, consultarPendentesConclusao, arquivarContrato, reativarContrato, excluirContratoArquivado } from '@/lib/contratos';

jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn(() => ({ dados: [], carregando: false })) }));
jest.mock('@/hooks/use-entregaveis', () => ({
  useEntregaveis: jest.fn(() => ({ dados: [], carregando: false })),
  useResumoDocumentalContrato: jest.fn(() => ({ dados: {}, carregando: false, erro: undefined })),
}));
jest.mock('@/lib/admin-usuarios', () => ({ consultarMeuPerfil: jest.fn() }));
jest.mock('@/lib/contratos', () => ({
  listarContratos: jest.fn(), consultarPendentesConclusao: jest.fn(), arquivarContrato: jest.fn(), reativarContrato: jest.fn(), excluirContratoArquivado: jest.fn(), STATUS: { PLANEJAMENTO: 'Planejamento', EM_EXECUCAO: 'Em execução', CONCLUIDO: 'Concluído', ENCERRADO: 'Encerrado', EM_ENCERRAMENTO: 'Em encerramento', SUSPENSO: 'Suspenso', CANCELADO: 'Cancelado' }, ORDEM_STATUS: ['PLANEJAMENTO','EM_EXECUCAO','CONCLUIDO','ENCERRADO','EM_ENCERRAMENTO','SUSPENSO','CANCELADO'], MODOS: { SIMPLES: 'Simples' }, dataCivil: (x: string) => x, rotuloCodigoPublico: (c: string) => `#${c}`,
}));
jest.mock('./components/area-contratos', () => ({
  AreaContratos: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
  Aviso: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
const perfil = consultarMeuPerfil as jest.MockedFunction<typeof consultarMeuPerfil>;
const listar = listarContratos as jest.MockedFunction<typeof listarContratos>;
const pendentes = consultarPendentesConclusao as jest.MockedFunction<typeof consultarPendentesConclusao>;
const arquivar = arquivarContrato as jest.MockedFunction<typeof arquivarContrato>;
const reativar = reativarContrato as jest.MockedFunction<typeof reativarContrato>;
const excluir = excluirContratoArquivado as jest.MockedFunction<typeof excluirContratoArquivado>;
beforeEach(() => { window.sessionStorage.clear(); jest.clearAllMocks(); pendentes.mockResolvedValue([]); perfil.mockResolvedValue({ id: 'a', nome: 'Admin', email: 'a@example.com', perfil: 'ADMINISTRADOR', ativo: true }); });

test('HU05-06: busca dados reais e não apresenta fixture CT-001/2026', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(listar).toHaveBeenCalledTimes(1);
  expect(screen.getByText(/Nenhum contrato cadastrado ou atribuído/)).toBeInTheDocument();
  expect(screen.queryByText('CT-001/2026')).not.toBeInTheDocument();
});

test('HU05-06: contrato real abre detalhe pelo UUID', async () => {
  listar.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', codigoPublico: '00427', numeroContrato: 'REAL-2026', orgaoContratante: 'UTFPR', objeto: 'Serviços', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(screen.getByText('REAL-2026')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato REAL-2026/ })).toBeInTheDocument();
});

test('HU05-06: não oferece criar a Colaborador', async () => {
  perfil.mockResolvedValue({ id: 'c', nome: null, email: 'c@example.com', perfil: 'COLABORADOR', ativo: true });
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(screen.queryByRole('button', { name: 'Cadastrar contrato' })).not.toBeInTheDocument();
});


test('carteira não apresenta atualização manual redundante, preserva contratos carregados', async () => {
  listar.mockResolvedValue([{ id: 'qa', codigoPublico: '18352', numeroContrato: 'QA-2026',
    orgaoContratante: 'UTFPR', objeto: 'Serviços', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(screen.getByText('QA-2026')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar lista' })).not.toBeInTheDocument();
});

test('localiza por #00427 e 00427 sem perder busca por órgão, e mostra código junto ao número', async () => {
  listar.mockResolvedValue([{ id: 'uuid-do-contrato', codigoPublico: '00427', numeroContrato: '123/2026',
    orgaoContratante: 'Órgão institucional', objeto: 'Serviço especializado', status: 'PLANEJAMENTO',
    modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  const campo = screen.getByLabelText('Pesquisar contrato');
  expect(screen.getByText('Código #00427')).toBeInTheDocument();
  fireEvent.change(campo, { target: { value: '#00427' } });
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato/ })).toBeInTheDocument();
  fireEvent.change(campo, { target: { value: '00427' } });
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato/ })).toBeInTheDocument();
  fireEvent.change(campo, { target: { value: 'institucional' } });
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato/ })).toBeInTheDocument();
  const seletor = screen.getByLabelText('Buscar por');
  fireEvent.change(seletor, { target: { value: 'numero' } });
  fireEvent.change(campo, { target: { value: 'institucional' } });
  expect(screen.queryByRole('button', { name: /Abrir detalhes do contrato/ })).not.toBeInTheDocument();
  fireEvent.change(seletor, { target: { value: 'orgao' } });
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato/ })).toBeInTheDocument();
  fireEvent.change(seletor, { target: { value: 'todos' } });
  fireEvent.change(campo, { target: { value: '#99999' } });
  expect(screen.queryByRole('button', { name: /Abrir detalhes do contrato/ })).not.toBeInTheDocument();
});

test('cartão mostra o planejamento real sem inventar progresso ou evidências entregues', async () => {
  listar.mockResolvedValue([{ id: 'c-cartao', codigoPublico: '00999', numeroContrato: 'TESTE-RESUMO',
    orgaoContratante: 'UTFPR', objeto: 'Serviço', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2027-01-01',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  const resumo = screen.getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveTextContent('Etapas');
  expect(resumo).toHaveTextContent('Entregáveis');
  expect(resumo).toHaveTextContent('Evidências');
  expect(resumo).toHaveTextContent('0/0');
  expect(resumo.getElementsByTagName('progress')).toHaveLength(0);
  expect(within(resumo).getAllByRole('img')).toHaveLength(3);
  expect(within(resumo).getByRole('img', { name: /0 de 0 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(resumo).not.toHaveTextContent('0%');
});


test('Arquivados: ADMIN pode consultar, reativar e excluir com confirmação; ativos não misturam', async () => {
  const atual = { id: '11111111-1111-4111-8111-111111111111', codigoPublico: '10001', numeroContrato: 'ATIVO',
    orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', arquivadoEm: null } as Awaited<ReturnType<typeof listarContratos>>[number];
  const antigo = { ...atual, id: '22222222-2222-4222-8222-222222222222', numeroContrato: 'ARQUIVADO',
    arquivadoEm: '2026-11-03T15:00:00.000Z' };
  listar.mockResolvedValue([atual, antigo]);
  reativar.mockResolvedValue({ ...antigo, arquivadoEm: null });
  renderComConsultas(<ContratosListPage />);
  expect(await screen.findByText('ATIVO')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos ativos' }));
  expect(screen.queryByText('ARQUIVADO')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
  expect(screen.getByText('ARQUIVADO')).toBeInTheDocument();
  expect(screen.queryByText('ATIVO')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato ARQUIVADO/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Reativar contrato ARQUIVADO' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reativar contrato ARQUIVADO' }));
  expect(screen.getByRole('dialog', { name: 'Reativar contrato?' })).toBeInTheDocument();
  expect(reativar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(reativar).not.toHaveBeenCalled();
  excluir.mockResolvedValue({ excluido: true, arquivosPendentes: 0 });
  fireEvent.click(screen.getByRole('button', { name: 'Excluir contrato ARQUIVADO' }));
  expect(screen.getByRole('dialog', { name: 'Excluir contrato arquivado?' })).toBeInTheDocument();
  expect(excluir).not.toHaveBeenCalled();
});

test('COLABORADOR não recebe controles de arquivamento mesmo com contrato em tela', async () => {
  perfil.mockResolvedValue({ id: 'c', nome: null, email: 'c@example.com', perfil: 'COLABORADOR', ativo: true });
  listar.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', codigoPublico: '10333', numeroContrato: 'LEITURA',
    orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  expect(await screen.findByText('LEITURA')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Arquivar' })).not.toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Todos os contratos' })).toHaveAttribute('aria-selected', 'true');
  expect(arquivar).not.toHaveBeenCalled();
  expect(reativar).not.toHaveBeenCalled();
});


test('card compacto abre contrato inteiro sem botão de detalhe redundante', async () => {
  listar.mockResolvedValue([{ id: 'c-card', codigoPublico: '01234', numeroContrato: 'QA-CARD',
    orgaoContratante: 'Órgão', objeto: 'Serviço', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  expect(await screen.findByRole('button', { name: 'Abrir detalhes do contrato QA-CARD' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Detalhes' })).not.toBeInTheDocument();
});

test('carteira alterna a situação por abas e mantém busca longa independente do seletor de campo', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(screen.getByRole('tab', { name: 'Todos os contratos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Pesquisar contrato')).toBeInTheDocument();
  expect(screen.getByLabelText('Buscar por')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
  expect(screen.getByRole('tab', { name: 'Contratos arquivados' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.queryByLabelText('Pesquisar contrato')).not.toBeInTheDocument();
});

test('filtros compactos: selects com mesma largura e abas junto ao título Contratos', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  const titulo = screen.getByRole('heading', { name: 'Contratos', level: 2 });
  expect(titulo.parentElement).toContainElement(screen.getByRole('tablist', { name: 'Situação dos contratos' }));
  expect(screen.getByLabelText('Buscar por').parentElement).toHaveClass('order-3', 'min-[500px]:order-3');
  expect(screen.getByLabelText('Filtrar por situação').parentElement).toHaveClass('order-2', 'min-[500px]:order-2');
  expect(screen.getByLabelText('Pesquisar contrato').closest('.order-1')).toHaveClass('lg:order-4');
  expect(screen.getByRole('button', { name: 'Cadastrar contrato' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Ordenar contratos' })).toHaveTextContent('Padrão');
});


test('status concluído fica em aba própria, sem confundir com arquivamento', async () => {
  const base = { id: '11111111-1111-4111-8111-111111111111', codigoPublico: '10001',
    numeroContrato: 'PLANEJADO', orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO',
    modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', arquivadoEm: null } as Awaited<ReturnType<typeof listarContratos>>[number];
  listar.mockResolvedValue([base, { ...base, id: '22222222-2222-4222-8222-222222222222', numeroContrato: 'CONCLUIDO', status: 'CONCLUIDO' }]);
  renderComConsultas(<ContratosListPage />);
  expect(await screen.findByText('PLANEJADO')).toBeInTheDocument();
  expect(screen.getByText('CONCLUIDO')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos ativos' }));
  expect(screen.queryByText('CONCLUIDO')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos finalizados' }));
  expect(screen.getByText('CONCLUIDO')).toBeInTheDocument();
  expect(screen.queryByText('PLANEJADO')).not.toBeInTheDocument();
});


test('leitor em carteira de arquivados não recebe reativação nem exclusão', async () => {
  perfil.mockResolvedValue({ id: 'c', nome: null, email: 'c@example.com', perfil: 'COLABORADOR', ativo: true });
  listar.mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', codigoPublico: '00003', numeroContrato: 'ARQ-SOMENTE-LEITURA',
    orgaoContratante: 'Órgão', objeto: 'Objeto', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', arquivadoEm: '2026-11-06T00:00:00Z',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  expect(await screen.findByRole('tab', { name: 'Contratos arquivados' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
  expect(screen.getByText('ARQ-SOMENTE-LEITURA')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Reativar contrato/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Excluir contrato/ })).not.toBeInTheDocument();
});


test('ao voltar do detalhe, restaura aba Arquivados, busca e posição da página', async () => {
  const base = { id: 'qa-arquivado', codigoPublico: '00001', numeroContrato: 'QA-ARQUIVADO',
    orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', arquivadoEm: '2026-11-06T00:00:00Z' } as Awaited<ReturnType<typeof listarContratos>>[number];
  listar.mockResolvedValue([base]);
  const original = Object.getOwnPropertyDescriptor(window, 'scrollY');
  Object.defineProperty(window, 'scrollY', { configurable: true, value: 412 });
  const restaurar = jest.spyOn(window, 'scrollTo').mockImplementation(() => {});
  try {
    const primeira = renderComConsultas(<ContratosListPage />);
    await screen.findByLabelText('Pesquisar contrato');
    fireEvent.change(screen.getByLabelText('Pesquisar contrato'), { target: { value: 'QA-' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
    expect(await screen.findByText('QA-ARQUIVADO')).toBeInTheDocument();
    // A abertura é contextual, pelo modal, e persiste a aba e a rolagem.
    const link = screen.getByRole('button', { name: 'Abrir detalhes do contrato QA-ARQUIVADO' });
    fireEvent.click(link);
    primeira.unmount();
    expect(window.sessionStorage.getItem('tec08:carteira:estado:v1')).toContain('"arquivados"');
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });
    renderComConsultas(<ContratosListPage />);
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Contratos arquivados' })).toHaveAttribute('aria-selected', 'true'));
    fireEvent.click(screen.getByRole('tab', { name: 'Todos os contratos' }));
    expect(screen.getByLabelText('Pesquisar contrato')).toHaveValue('QA-');
    await waitFor(() => expect(restaurar).toHaveBeenCalledWith({ top: 412, behavior: 'auto' }));
  } finally {
    restaurar.mockRestore();
    if (original) Object.defineProperty(window, 'scrollY', original);
  }
});

test('cartão arquivado aproxima indicadores e ações, sem placa preta', async () => {
  listar.mockResolvedValue([{ id: 'qa-arch', codigoPublico: '00023', numeroContrato: 'QA-ARQUIVADO',
    orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31', arquivadoEm: '2026-11-06T00:00:00Z' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
  const link = await screen.findByRole('button', { name: 'Abrir detalhes do contrato QA-ARQUIVADO' });
  expect(link).toHaveClass('pt-14', 'sm:pt-4');
  const resumo = within(link).getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveClass('grid-cols-3');
  const acoes = screen.getByRole('button', { name: 'Reativar contrato QA-ARQUIVADO' }).parentElement;
  expect(acoes).not.toHaveClass('bg-background/90');
  expect(screen.getByRole('button', { name: 'Excluir contrato QA-ARQUIVADO' })).toBeInTheDocument();
});


test('aba restaura do armazenamento sem mostrar visualmente Ativos no primeiro quadro', async () => {
  window.sessionStorage.setItem('tec08:carteira:estado:v1', JSON.stringify({
    aba: 'arquivados', campo: 'todos', busca: '', status: '', rolagem: 0,
  }));
  listar.mockResolvedValue([]);
  renderComConsultas(<ContratosListPage />);
  await waitFor(() => {
    const arquivados = screen.getByRole('tab', { name: 'Contratos arquivados' });
    expect(arquivados).toHaveAttribute('aria-selected', 'true');
    expect(arquivados.closest('[role="tablist"]')).not.toHaveClass('invisible');
  });
  expect(screen.getByRole('tab', { name: 'Contratos ativos' })).toHaveAttribute('aria-selected', 'false');
});


test('carteira não cria aba Ativos selecionada antes de recuperar a seleção persistida', async () => {
  window.sessionStorage.setItem('tec08:carteira:estado:v1', JSON.stringify({
    aba: 'arquivados', campo: 'todos', busca: '', status: '', rolagem: 0,
  }));
  listar.mockResolvedValue([]);
  renderComConsultas(<ContratosListPage />);
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: 'Contratos arquivados' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByTestId('abas-aguardando-restauracao')).not.toBeInTheDocument();
  });
  expect(screen.getByRole('tab', { name: 'Contratos ativos' })).toHaveAttribute('aria-selected', 'false');
});


test('carteira inclui filtro pendente de conclusão sem misturar concluídos', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  listar.mockResolvedValue([{ id, codigoPublico: '00001', numeroContrato: 'PENDENTE', orgaoContratante: 'UTFPR', objeto: 'Teste',
    status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2027-01-01' } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  pendentes.mockResolvedValue([id]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos pendentes de conclusão' }));
  expect(screen.getByText('PENDENTE')).toBeInTheDocument();
  expect(screen.getAllByText('Pendente de conclusão').length).toBeGreaterThan(0);
  const cartao = await screen.findByRole('button', { name: 'Abrir detalhes do contrato PENDENTE' });
  expect(within(cartao).getByText('Pendente de conclusão')).toHaveClass('border-yellow-400/60');
});


test('contrato reaberto sem alterações fica somente em revisão', async () => {
  const id = '11111111-1111-4111-8111-111111111112';
  listar.mockResolvedValue([{ id, codigoPublico: '00022', numeroContrato: 'QA-REVISAO',
    orgaoContratante: 'UTFPR', objeto: 'Auditoria', status: 'PLANEJAMENTO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2027-01-01', reabertoEm: '2026-11-06T20:00:00Z',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  // O backend só inclui este contrato na pendência se as alterações forem
  // confirmadas e seus descendentes estiverem novamente concluídos.
  pendentes.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos em revisão' }));
  const cartao = await screen.findByRole('button', { name: 'Abrir detalhes do contrato QA-REVISAO' });
  expect(within(cartao).getByText('Em revisão')).toBeInTheDocument();
  expect(within(cartao).queryByText('Pendente de conclusão')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos pendentes de conclusão' }));
  expect(screen.queryByRole('button', { name: 'Abrir detalhes do contrato QA-REVISAO' })).not.toBeInTheDocument();
});


test('TEC08: Todos é primeira aba, Ativos é segunda; pesquisa só aparece em Todos', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  const abas = within(screen.getByRole('tablist', { name: 'Situação dos contratos' })).getAllByRole('tab');
  expect(abas[0]).toHaveTextContent('Todos');
  expect(abas[1]).toHaveTextContent('Ativos');
  expect(abas[0]).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByLabelText('Pesquisar contrato')).toBeInTheDocument();
  fireEvent.click(abas[1]);
  expect(screen.queryByLabelText('Pesquisar contrato')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Filtrar por situação')).not.toBeInTheDocument();
});

test('TEC08: o filtro de conclusão fica apenas em Todos e não contradiz Ativos', async () => {
  const base = { id: '1', codigoPublico: '00001', numeroContrato: 'ATIVO',
    orgaoContratante: 'UTFPR', objeto: 'Teste', status: 'PLANEJAMENTO' as const,
    modoCalculo: 'SIMPLES' as const, inicioVigencia: '2026-01-01',
    terminoVigencia: '2026-12-31', arquivadoEm: null };
  listar.mockResolvedValue([
    base, { ...base, id: '2', numeroContrato: 'CONCLUIDO', status: 'CONCLUIDO' },
    { ...base, id: '3', numeroContrato: 'CONCLUIDO-ARQUIVADO', status: 'CONCLUIDO', arquivadoEm: '2026-11-07T00:00:00Z' },
  ] as Awaited<ReturnType<typeof listarContratos>>);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'CONCLUIDO' } });
  expect(screen.getByRole('button', { name: 'Abrir detalhes do contrato CONCLUIDO' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir detalhes do contrato CONCLUIDO-ARQUIVADO' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir detalhes do contrato ATIVO' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos ativos' }));
  expect(screen.queryByLabelText('Filtrar por situação')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Abrir detalhes do contrato ATIVO' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Abrir detalhes do contrato CONCLUIDO' })).not.toBeInTheDocument();
});


test('abas da carteira mantêm rolagem e suspensão disponível no filtro, não em aba', async () => {
  listar.mockResolvedValue([]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  const tabs = screen.getByRole('tablist', { name: 'Situação dos contratos' });
  expect(screen.queryByRole('tab', { name: 'Contratos suspensos' })).not.toBeInTheDocument();
  expect(tabs.closest('.tec08-abas-rolagem')).not.toBeNull();
  expect(screen.getByRole('option', { name: 'Suspenso' })).toHaveValue('SUSPENSO');
});


test('TEC08-03: suspensão exibe selo amarelo e não oferece Retomar nos cartões', async () => {
  listar.mockResolvedValue([{ id: 'suspenso-qa', codigoPublico: '00555', numeroContrato: 'SUSP-UI',
    orgaoContratante: 'UTFPR', objeto: 'Serviço suspenso', status: 'SUSPENSO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2027-01-01', arquivadoEm: null,
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  await screen.findByRole('button', { name: 'Abrir detalhes do contrato SUSP-UI' });
  fireEvent.change(screen.getByLabelText('Filtrar por situação'), { target: { value: 'SUSPENSO' } });
  const link = screen.getByRole('button', { name: 'Abrir detalhes do contrato SUSP-UI' });
  expect(link).toHaveAttribute('data-situacao', 'suspensos');
  expect(within(link).getByText('Suspenso')).toHaveClass('text-yellow-200');
  expect(screen.queryByRole('button', { name: /Retomar contrato/ })).not.toBeInTheDocument();
});

test('TEC08-03: ações de contrato arquivado permanecem no topo e fora do link do cartão', async () => {
  listar.mockResolvedValue([{ id: 'arquivado-qa', codigoPublico: '00666', numeroContrato: 'ARQ-UI',
    orgaoContratante: 'UTFPR', objeto: 'Serviço arquivado', status: 'EM_EXECUCAO', modoCalculo: 'SIMPLES',
    inicioVigencia: '2026-01-01', terminoVigencia: '2027-01-01', arquivadoEm: '2026-11-07T10:00:00Z',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  renderComConsultas(<ContratosListPage />);
  await screen.findByRole('tab', { name: 'Contratos arquivados' });
  fireEvent.click(screen.getByRole('tab', { name: 'Contratos arquivados' }));
  const link = screen.getByRole('button', { name: 'Abrir detalhes do contrato ARQ-UI' });
  const reativar = screen.getByRole('button', { name: 'Reativar contrato ARQ-UI' });
  const excluir = screen.getByRole('button', { name: 'Excluir contrato ARQ-UI' });
  expect(reativar.parentElement).toHaveClass('absolute', 'right-3', 'top-3');
  expect(reativar.parentElement).toContainElement(excluir);
  expect(reativar.parentElement).toHaveTextContent('Arquivado');
  expect(link).not.toContainElement(reativar);
  expect(link).not.toContainElement(excluir);
});


test.each([
  ['ENCERRADO', 'encerrado'],
  ['CONCLUIDO', 'concluido'],
  ['SUSPENSO', 'suspenso'],
  ['CANCELADO', 'cancelado'],
] as const)('carteira sinaliza %s com estado semântico %s sem depender do agrupamento da aba', async (status, estado) => {
  listar.mockResolvedValue([{
    id: '11111111-1111-4111-8111-111111111111', codigoPublico: '00427',
    numeroContrato: 'CONTRATO-ESTADO-2026', orgaoContratante: 'UTFPR', objeto: 'Serviços',
    status, modoCalculo: 'SIMPLES', inicioVigencia: '2026-01-01', terminoVigencia: '2026-12-31',
  } as Awaited<ReturnType<typeof listarContratos>>[number]]);
  await act(async () => { renderComConsultas(<ContratosListPage />); });
  expect(screen.getByRole('button', { name: /Abrir detalhes do contrato CONTRATO-ESTADO-2026/ }))
    .toHaveAttribute('data-tec08-estado', estado);
});
