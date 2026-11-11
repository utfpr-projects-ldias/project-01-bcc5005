jest.mock('@/hooks/use-entregaveis', () => ({
  useEntregaveis: jest.fn(),
  useResumoDocumentalContrato: jest.fn(),
}));
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import type { Entregavel } from '@/lib/entregaveis';
const entregaveisHook = useEntregaveis as jest.Mock;
const documentalHook = useResumoDocumentalContrato as jest.Mock;
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PainelEtapas } from './painel-etapas';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { ErroEtapa, alterarArquivamentoEtapa, type Etapa } from '@/lib/etapas';
import { alterarBloqueioOrdemEtapas } from '@/lib/contratos';
jest.mock('@/lib/contratos', () => ({ ...jest.requireActual('@/lib/contratos'), alterarBloqueioOrdemEtapas: jest.fn() }));
jest.mock('@/lib/etapas', () => ({ ...jest.requireActual('@/lib/etapas'), alterarArquivamentoEtapa: jest.fn() }));
const alterarTrava = alterarBloqueioOrdemEtapas as jest.Mock;

jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn(), useMutacoesEtapas: jest.fn() }));
const consultar = useEtapas as jest.Mock;
const mutacoesHook = useMutacoesEtapas as jest.Mock;
const atualizar = jest.fn();
const criar = jest.fn();
const editar = jest.fn();
const reordenar = jest.fn();
function liberarOrdenacao() {
  // Regra global: novo contrato e contrato migrado iniciam com ordem liberada.
  expect(screen.getByRole('button', { name: 'Descer etapa Planejamento' })).toBeEnabled();
}

const contrato = '11111111-1111-4111-8111-111111111111';
// jsdom não implementa toda a navegação same-document: simular a transição do
// histórico de forma explícita, mantendo testes determinísticos e sem rede real.
let voltarHistorico: jest.SpyInstance;
beforeEach(() => {
  voltarHistorico = jest.spyOn(window.history, 'back').mockImplementation(() => {
    const estado = window.history.state as Record<string, unknown> | null;
    if (!estado || !('__modalEtapa' in estado)) return;
    const { __modalEtapa: _marcador, ...anterior } = estado;
    void _marcador;
    window.history.replaceState(anterior, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: anterior }));
  });
});
afterEach(() => {
  voltarHistorico.mockRestore();
  const estado = window.history.state as Record<string, unknown> | null;
  if (estado && '__modalEtapa' in estado) {
    const { __modalEtapa: _marcador, ...anterior } = estado;
    void _marcador;
    window.history.replaceState(anterior, '', window.location.href);
  }
});

const base: Etapa = {
  id: 'etapa-1', contratoId: contrato, nome: 'Planejamento', codigo: 'E-01', descricao: 'Descrição da etapa',
  sequencia: 1, inicioPrevisto: '2026-10-10', terminoPrevisto: '2026-11-10',
  status: 'PLANEJADA', observacoes: 'Observações',
  vigenciaContrato: { inicioVigencia: '2026-10-01', terminoVigencia: '2026-12-01' }, avisoVigencia: false,
};
const duas: Etapa[] = [base, { ...base, id: 'etapa-2', nome: 'Entrega', sequencia: 2, codigo: null, descricao: null, observacoes: null, avisoVigencia: true }];
const estado = (dados: Etapa[] | undefined = duas, outros = {}) => ({
  dados, erro: undefined, carregando: dados === undefined, atualizando: false, atualizar, ...outros,
});
beforeEach(() => {
  jest.clearAllMocks();
  entregaveisHook.mockReturnValue({ dados: [], carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue([]) });
  documentalHook.mockReturnValue({ dados: {}, carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue({}) });
  consultar.mockReturnValue(estado());
  mutacoesHook.mockReturnValue({ criar, editar, reordenar });
  atualizar.mockResolvedValue(duas);
  criar.mockResolvedValue({ ...base, id: 'nova' });
  editar.mockResolvedValue(base);
  reordenar.mockResolvedValue([...duas].reverse());
  alterarTrava.mockResolvedValue({ id: contrato, ordemEtapasBloqueada: true });
});


describe('TEC08-03 — etapa reaberta após conclusão', () => {
  const comprovado: Entregavel = {
    id: 'entregavel-verificado', contratoId: contrato, etapaId: base.id, nome: 'Relatório verificado', codigo: null,
    descricao: null, tipo: 'UNICO', responsavelId: null, inicioPrevisto: null, terminoPrevisto: null,
    quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, periodicidade: null,
    configuracaoPeriodicidade: null, peso: null, criterioConclusao: null, percentualExecucao: null,
    statusExecucao: 'CONCLUIDO', situacaoComprovacao: 'COMPROVADO', observacoes: null,
    reabertoEm: null, arquivadoEm: null,
    evidenciasEsperadas: [{ id: 'evidencia-verificada', tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true, reabertoEm: null }],
  };
  test('oferece Fechar novamente no cabeçalho se todos os filhos ativos permanecem completos', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    entregaveisHook.mockReturnValue({ dados: [comprovado], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    const modal = screen.getByRole('dialog', { name: /Planejamento/ });
    const cabecalho = modal.querySelector('header');
    expect(cabecalho).not.toBeNull();
    expect(within(cabecalho as HTMLElement).getByRole('button', { name: 'Fechar novamente' })).toBeEnabled();
    expect(within(modal).getAllByRole('button', { name: 'Fechar novamente' })).toHaveLength(1);
    fireEvent.click(within(cabecalho as HTMLElement).getByRole('button', { name: 'Fechar novamente' }));
    expect(screen.getByRole('dialog', { name: 'Fechar novamente?' })).toBeInTheDocument();
  });
  test('oculta Fechar novamente quando um novo entregável incompleto passa a integrar a etapa', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    entregaveisHook.mockReturnValue({ dados: [comprovado, { ...comprovado, id: 'entregavel-novo', nome: 'Pendência nova', statusExecucao: 'NAO_INICIADO' }], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    expect(within(screen.getByRole('dialog', { name: /Planejamento/ })).queryByRole('button', { name: 'Fechar novamente' })).not.toBeInTheDocument();
  });
  test('arquivar uma evidência opcional preserva o fechamento se a comprovação ativa permanece completa', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    const comOpcionalArquivada: Entregavel = { ...comprovado, evidenciasEsperadas: [
      ...comprovado.evidenciasEsperadas,
      { id: 'opcional-arquivada', tipoEvidencia: 'Fotografia', descricao: null, obrigatoria: false, arquivadoEm: '2026-11-08T08:05:00.000Z', reabertoEm: null },
    ] };
    entregaveisHook.mockReturnValue({ dados: [comOpcionalArquivada], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    const modal = screen.getByRole('dialog', { name: /Planejamento/ });
    expect(within(modal.querySelector('header') as HTMLElement).getByRole('button', { name: 'Fechar novamente' })).toBeEnabled();
  });
  test('nova evidência obrigatória sem verificação remove Fechar novamente', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    const comEvidenciaPendente: Entregavel = { ...comprovado, evidenciasEsperadas: [
      ...comprovado.evidenciasEsperadas,
      { id: 'evidencia-pendente', tipoEvidencia: 'Fotografia', descricao: null, obrigatoria: true, arquivadoEm: null, reabertoEm: null },
    ] };
    entregaveisHook.mockReturnValue({ dados: [comEvidenciaPendente], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 2, verificadas: 1, total: 2, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    expect(within(screen.getByRole('dialog', { name: /Planejamento/ })).queryByRole('button', { name: 'Fechar novamente' })).not.toBeInTheDocument();
  });
  test('nova evidência opcional sem verificação não impede Fechar novamente', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    const comEvidenciaPendente: Entregavel = { ...comprovado, evidenciasEsperadas: [
      ...comprovado.evidenciasEsperadas,
      { id: 'evidencia-pendente', tipoEvidencia: 'Fotografia', descricao: null, obrigatoria: false, arquivadoEm: null, reabertoEm: null },
    ] };
    entregaveisHook.mockReturnValue({ dados: [comEvidenciaPendente], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 1, verificadas: 1, total: 2, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    expect(within(screen.getByRole('dialog', { name: /Planejamento/ })).getByRole('button', { name: 'Fechar novamente' })).toBeEnabled();
  });
  test('não oferece conclusão manual quando falta permissão de concluirEtapas', () => {
    consultar.mockReturnValue(estado([{ ...base, status: 'PLANEJADA', reabertoEm: '2026-11-08T08:00:00.000Z' }]));
    entregaveisHook.mockReturnValue({ dados: [comprovado], carregando: false, erro: undefined, atualizar: jest.fn() });
    documentalHook.mockReturnValue({ dados: { [comprovado.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }, carregando: false, erro: undefined, atualizar: jest.fn() });
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
    expect(within(screen.getByRole('dialog', { name: /Planejamento/ })).queryByRole('button', { name: 'Fechar novamente' })).not.toBeInTheDocument();
  });
});

describe('HU06-03 — painel no contrato', () => {
  test('lista ordenada, campos, status, datas e aviso de vigência acessível', () => {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    const lista = screen.getByRole('list', { name: 'Etapas em ordem de execução' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
    expect(within(lista).getAllByRole('listitem')[1]).toHaveTextContent('Entrega');
    expect(within(within(lista).getAllByRole('listitem')[0]).getByText(/10\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir detalhes da etapa 1: Planejamento/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Abrir detalhes da etapa 2: Entrega/ }));
    expect(screen.getByText(/datas previstas desta etapa estão fora/)).toHaveAttribute('role', 'note');
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às etapas' }));
    fireEvent.click(screen.getByRole('button', { name: /Abrir detalhes da etapa 1: Planejamento/ }));
    expect(screen.getByText('Descrição da etapa')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Subir etapa Planejamento/ })).toBeDisabled();
  });
  test('Colaborador vê a lista, mas não vê controles de planejamento', () => {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false} />);
    expect(screen.getByText('Planejamento')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar etapa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descer etapa/ })).not.toBeInTheDocument();
  });
  test('estado vazio tem ação para gestor e apenas texto para colaborador', () => {
    consultar.mockReturnValue(estado([]));
    const view = render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    expect(screen.getByText(/Ainda não há etapas cadastradas/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeInTheDocument();
    view.rerender(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false} />);
    expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
  });
  test('atualização não apaga os registros e exibe estado de carregamento', () => {
    consultar.mockReturnValue(estado(duas, { atualizando: true }));
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    expect(screen.getByText('Planejamento')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Abrir detalhes da etapa 1: Planejamento/ })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Atualizar etapas' })).not.toBeInTheDocument();
  });
  test('formulário valida nome e data antes do POST e preserva dados após falha HTTP', async () => {
    criar.mockRejectedValueOnce(new ErroEtapa(400, 'Confira os campos informados e tente novamente.'));
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Nova etapa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' }));
    expect(screen.getByText('Informe o nome da etapa.')).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Nova etapa operacional' } });
    fireEvent.change(screen.getByLabelText('Início previsto'), { target: { value: '2026-11-20' } });
    fireEvent.change(screen.getByLabelText('Término previsto'), { target: { value: '2026-11-19' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' }));
    expect(screen.getByText('O término não pode ocorrer antes do início.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Término previsto'), { target: { value: '2026-11-21' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' })); });
    expect(criar).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Nova etapa operacional', inicioPrevisto: '2026-11-20' }));
    expect(screen.getByLabelText('Nome *')).toHaveValue('Nova etapa operacional');
    expect(screen.getByText('Confira os campos informados e tente novamente.')).toBeInTheDocument();
  });
  test('edita etapa sem apagar outros dados e não cria link para entregáveis ainda inexistentes', async () => {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
    expect(screen.getByLabelText('Nome *')).toHaveValue('Planejamento');
    fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Planejamento revisado' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' })); });
    expect(editar).toHaveBeenCalledWith(base.id, expect.objectContaining({ nome: 'Planejamento revisado', codigo: 'E-01' }));
    expect(screen.queryByRole('link', { name: /entregáveis/i })).not.toBeInTheDocument();
  });
  test('reordena com ordem original e ordem nova; após falha reverte a lista', async () => {
    reordenar.mockRejectedValueOnce(new ErroEtapa(500, 'Falha simulada'));
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    liberarOrdenacao();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' })); });
    expect(reordenar).toHaveBeenCalledWith(['etapa-1', 'etapa-2'], ['etapa-2', 'etapa-1']);
    const lista = screen.getByRole('list', { name: 'Etapas em ordem de execução' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
    expect(screen.getByText('Falha simulada')).toBeInTheDocument();
  });
  test('409 exige atualizar a lista; erro 403 impede reutilizar dados em tela', async () => {
    reordenar.mockRejectedValueOnce(new ErroEtapa(409, 'Ordem desatualizada'));
    const view = render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    liberarOrdenacao();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' })); });
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    reordenar.mockRejectedValueOnce(new ErroEtapa(403, 'Acesso revogado'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' })); });
    expect(screen.getByText(/acesso às etapas precisa ser verificado/)).toBeInTheDocument();
    expect(screen.queryByText('Planejamento')).not.toBeInTheDocument();
    view.unmount();
  });
  test('ausência de sessão não exibe dados protegidos de consulta', () => {
    consultar.mockReturnValue(estado(duas, { erro: new ErroEtapa(401, 'Sessão expirada') }));
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    expect(screen.queryByText('Planejamento')).not.toBeInTheDocument();
    expect(screen.getByText('Sessão expirada')).toBeInTheDocument();
  });
});

test('criação e edição abrem modal e fecham sem navegação nem salvamento', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const novo = screen.getByRole('button', { name: 'Nova etapa' });
  expect(novo).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(novo);
  const criando = screen.getByRole('button', { name: 'Cadastrando etapa' });
  expect(criando).toBeEnabled();
  expect(criando).toHaveAttribute('aria-expanded', 'true');
  expect(criando.querySelector('svg')).toBeNull();
  expect(screen.getByRole('dialog', { name: 'Nova etapa' })).toBeInTheDocument();
  expect(document.getElementById('formulario-nova-etapa')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Rascunho não salvo' } });
  fireEvent.click(criando);
  expect(document.getElementById('formulario-nova-etapa')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Nova etapa' }));
  expect(screen.getByLabelText('Nome *')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));

  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
  const editando = screen.getByRole('button', { name: 'Editar etapa Planejamento' });
  expect(editando).toBeEnabled();
  expect(editando).toHaveAttribute('aria-expanded', 'true');
  expect(editando.querySelector('svg')).not.toBeNull();
  expect(screen.getByRole('dialog', { name: /Editar etapa · Planejamento/ })).toBeInTheDocument();
  expect(document.getElementById('formulario-etapa-etapa-1')).toBeInTheDocument();
  fireEvent.click(editando);
  expect(document.getElementById('formulario-etapa-etapa-1')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar etapa Planejamento' })).toHaveAttribute('aria-expanded', 'false');
  expect(criar).not.toHaveBeenCalled();
  expect(editar).not.toHaveBeenCalled();
});

test('durante salvamento, não permite recolher ou trocar de formulário', async () => {
  let concluir!: (valor: Etapa) => void;
  editar.mockImplementationOnce(() => new Promise<Etapa>((resolve) => { concluir = resolve; }));
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' })); });
  expect(screen.getByRole('button', { name: 'Editar etapa Planejamento' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Voltar sem salvar' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Atualizar etapas' })).not.toBeInTheDocument();
  await act(async () => { concluir(base); });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: /Editar etapa · Planejamento/ })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Editar etapa Planejamento' })).toBeEnabled();
});

test('modal de etapa fecha por Esc e preserva o foco no botão que abriu', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const acao = screen.getByRole('button', { name: 'Editar etapa Planejamento' });
  acao.focus(); fireEvent.click(acao);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(acao).toHaveFocus();
});

test('funcionário com apenas reordenarEtapas move quando liberado, mas não vê controle global', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false}
    permissoes={{ reordenarEtapas: true, bloquearOrdemEtapas: false } as never} />);
  expect(screen.queryByRole('button', { name: 'Bloquear ordem das etapas' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descer etapa Planejamento' })).toBeEnabled();
});

test('funcionário com reordenarEtapas não supera trava global', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false}
    ordemEtapasBloqueada permissoes={{ reordenarEtapas: true, bloquearOrdemEtapas: false } as never} />);
  expect(screen.queryByRole('button', { name: 'Desbloquear ordem das etapas' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Descer etapa Planejamento' })).toBeDisabled();
  expect(reordenar).not.toHaveBeenCalled();
});

test('funcionário sem reordenarEtapas não vê cadeado nem ações de movimentação', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar={false}
    permissoes={{ reordenarEtapas: false, bloquearOrdemEtapas: false } as never} />);
  expect(screen.queryByRole('button', { name: 'Bloquear ordem das etapas' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Descer etapa/ })).not.toBeInTheDocument();
});

test('trava persiste por contrato e só ADMIN ou delegação explícita pode alternar', async () => {
  const atualizarContrato = jest.fn().mockResolvedValue(undefined);
  const view = render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar
    permissoes={{ reordenarEtapas: true, bloquearOrdemEtapas: true } as never}
    onOrdemAlterada={atualizarContrato} ordemEtapasBloqueada={false} />);
  expect(screen.getByRole('button', { name: 'Descer etapa Planejamento' })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Bloquear ordem das etapas' })); });
  expect(alterarTrava).toHaveBeenCalledWith(contrato, true);
  expect(atualizarContrato).toHaveBeenCalledTimes(1);
  view.rerender(<PainelEtapas contratoId={contrato} habilitado podeGerenciar
    permissoes={{ reordenarEtapas: true, bloquearOrdemEtapas: true } as never}
    onOrdemAlterada={atualizarContrato} ordemEtapasBloqueada />);
  expect(screen.getByRole('button', { name: 'Desbloquear ordem das etapas' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Descer etapa Planejamento' })).toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Desbloquear ordem das etapas' })); });
  expect(alterarTrava).toHaveBeenCalledWith(contrato, false);
});

test('Subir/Descer têm retorno visual em hover e respeitam limites da sequência', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    liberarOrdenacao();
  const primeiro = screen.getByRole('button', { name: 'Subir etapa Planejamento' });
  const ultimo = screen.getByRole('button', { name: 'Descer etapa Entrega' });
  expect(primeiro).toBeDisabled();
  expect(ultimo).toBeDisabled();
  expect(primeiro).toHaveClass('disabled:cursor-not-allowed');
  const ativo = screen.getByRole('button', { name: 'Descer etapa Planejamento' });
  expect(ativo).toBeEnabled();
  expect(ativo).toHaveClass('hover:bg-brand-green/20');
  expect(ativo).toHaveClass('focus-visible:outline-2');
  expect(ativo).toHaveTextContent('↓');
});


test('HU07-05/06: Voltar físico do mouse/navegador fecha o modal sem sair da URL ou perder foco', () => {
  const url = window.location.href;
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const abrir = screen.getByRole('button', { name: 'Editar etapa Planejamento' });
  abrir.focus();
  fireEvent.click(abrir);
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  const estadoAberto = window.history.state;
  expect(estadoAberto).toEqual(expect.objectContaining({ __modalEtapa: expect.any(String) }));
  // Em navegador real, clicar no botão lateral Voltar dispara este popstate.
  const { __modalEtapa: _marcador, ...anterior } = estadoAberto as Record<string, unknown>;
  void _marcador;
  act(() => {
    window.history.replaceState(anterior, '', url);
    window.dispatchEvent(new PopStateEvent('popstate', { state: anterior }));
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.location.href).toBe(url);
  expect(abrir).toHaveFocus();
  expect(voltarHistorico).not.toHaveBeenCalled(); // navegador JÁ voltou uma vez
});

test.each(['x', 'escape', 'fundo', 'voltar'] as const)(
  'HU07-05: fechar por %s consome exatamente uma entrada, não navega e não deixa Voltar fantasma', (metodo) => {
    const url = window.location.href;
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    const abrir = screen.getByRole('button', { name: 'Editar etapa Planejamento' });
    fireEvent.click(abrir);
    const dialogo = screen.getByRole('dialog');
    if (metodo === 'x') fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
    else if (metodo === 'escape') fireEvent.keyDown(dialogo, { key: 'Escape' });
    else if (metodo === 'voltar') fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));
    else fireEvent.mouseDown(dialogo.parentElement!, { button: 0 });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(abrir).toHaveFocus();
    expect(window.location.href).toBe(url);
    expect(voltarHistorico).toHaveBeenCalledTimes(1);
    expect(window.history.state?.__modalEtapa).toBeUndefined();
  },
);

test('HU06/HU07: Subir/Descer aplica FLIP aos dois cartões e anima a troca de posição', async () => {
  let concluir!: (registros: Etapa[]) => void;
  reordenar.mockImplementationOnce(() => new Promise<Etapa[]>((resolve) => { concluir = resolve; }));
  const medir = jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.tagName !== 'LI' || !this.parentElement) return {} as DOMRect;
    const indice = Array.prototype.indexOf.call(this.parentElement.children, this) as number;
    return { top: indice * 250, left: 0, right: 800, bottom: indice * 250 + 200, width: 800, height: 200, x: 0, y: indice * 250, toJSON: () => ({}) } as DOMRect;
  });
  const animar = jest.fn();
  const anteriorAnimacao = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animar });
  try {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    liberarOrdenacao();
    fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' }));
    const itens = within(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Entrega');
    expect(itens[1]).toHaveTextContent('Planejamento');
    expect(animar).toHaveBeenCalledTimes(2);
    expect(animar.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({ transform: expect.stringMatching(/translateY\(-?250px\)/) })]));
    expect(animar.mock.calls[0][1]).toEqual(expect.objectContaining({ duration: 340 }));
    await act(async () => { concluir([...duas].reverse()); });
  } finally {
    medir.mockRestore();
    if (anteriorAnimacao) Object.defineProperty(HTMLElement.prototype, 'animate', anteriorAnimacao);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  }
});


test('HU07: Voltar do mouse durante salvamento não sai do contrato e conserva o modal', async () => {
  let concluir!: (etapa: Etapa) => void;
  editar.mockImplementationOnce(() => new Promise<Etapa>((resolve) => { concluir = resolve; }));
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar etapa' })); });
  const estadoModal = window.history.state as Record<string, unknown>;
  const { __modalEtapa: _marcador, ...anterior } = estadoModal;
  void _marcador;
  act(() => {
    window.history.replaceState(anterior, '', window.location.href);
    window.dispatchEvent(new PopStateEvent('popstate', { state: anterior }));
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(window.history.state?.__modalEtapa).toBe(estadoModal.__modalEtapa);
  await act(async () => { concluir(base); });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('HU07: preferência de movimento reduzido desliga animação FLIP sem impedir reordenação', async () => {
  let concluir!: (etapas: Etapa[]) => void;
  reordenar.mockImplementationOnce(() => new Promise<Etapa[]>((resolve) => { concluir = resolve; }));
  const animar = jest.fn();
  const anteriorAnimacao = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate');
  const anteriorMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animar });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn().mockReturnValue({ matches: true }),
  });
  try {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    liberarOrdenacao();
    fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' }));
    const itens = within(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).getAllByRole('listitem');
    expect(itens[0]).toHaveTextContent('Entrega');
    expect(animar).not.toHaveBeenCalled();
    await act(async () => { concluir([...duas].reverse()); });
  } finally {
    if (anteriorMedia) Object.defineProperty(window, 'matchMedia', anteriorMedia);
    else Reflect.deleteProperty(window, 'matchMedia');
    if (anteriorAnimacao) Object.defineProperty(HTMLElement.prototype, 'animate', anteriorAnimacao);
    else Reflect.deleteProperty(HTMLElement.prototype, 'animate');
  }
});

test('card de etapa mostra numeração ordinal e abre detalhe; voltar não fecha contrato', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const acao = screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' });
  expect(screen.getByLabelText('Posição 1')).toBeInTheDocument();
  acao.focus(); fireEvent.click(acao);
  const modal = screen.getByRole('dialog', { name: /1 · Planejamento/ });
  expect(modal).toBeInTheDocument();
  expect(screen.getByText('Descrição da etapa')).toBeInTheDocument();
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(acao).toHaveFocus();
});

test('card possui botão de editar; detalhe da etapa não duplica ações no cabeçalho', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir detalhes da etapa 1: Planejamento' }));
  expect(screen.getByRole('dialog', { name: /1 · Planejamento/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar etapa' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar às etapas' }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
  expect(screen.getByRole('dialog', { name: /Editar etapa · Planejamento/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
});


test('abas: Etapas mantém concluídas em ordem e arquivadas aparecem somente em Arquivadas', () => {
  const arquivada = { ...base, id: 'etapa-arch', nome: 'Planejamento encerrado', sequencia: 3, arquivadoEm: '2026-11-05T00:00:00Z' };
  consultar.mockReturnValue(estado([...duas, arquivada]));
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const todas = within(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).getAllByRole('listitem');
  expect(todas).toHaveLength(2);
  expect(todas[0]).toHaveTextContent('Planejamento');
  expect(todas[1]).toHaveTextContent('Entrega');
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas arquivadas' }));
  const arquivo = within(screen.getByRole('list', { name: 'Etapas arquivadas' })).getAllByRole('listitem');
  expect(arquivo).toHaveLength(1);
  expect(arquivo[0]).toHaveTextContent('Planejamento encerrado');
  fireEvent.click(screen.getByRole('tab', { name: 'Todas' }));
  expect(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).toBeInTheDocument();
});

test('arquivar etapa exige confirmação, com cancelamento sem mutação', async () => {
  (alterarArquivamentoEtapa as jest.Mock).mockResolvedValue({ ...base, arquivadoEm: '2026-11-05T00:00:00Z' });
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar permissoes={{ arquivarEtapas: true } as never} />);
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar etapa Planejamento' }));
  const caixa = screen.getByRole('dialog', { name: 'Arquivar etapa?' });
  expect(alterarArquivamentoEtapa).not.toHaveBeenCalled();
  fireEvent.click(within(caixa).getByRole('button', { name: 'Cancelar' }));
  expect(alterarArquivamentoEtapa).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar etapa Planejamento' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Arquivar etapa?' })).getByRole('button', { name: 'Confirmar arquivamento' }));
  await waitFor(() => expect(alterarArquivamentoEtapa).toHaveBeenCalledWith(contrato, base.id, 'arquivar', undefined));
});


test('cadeado e Nova etapa são exclusivos da aba de etapas, sem remover concluídas da ordem', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Concluídas/ }));
  expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas arquivadas' }));
  expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Todas' }));
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeInTheDocument();
});


test('contrato pendente de conclusão não apresenta Nova etapa nem edição operacional', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar contratoPendenteConclusao />);
  expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar etapa Planejamento' })).not.toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).toBeInTheDocument();
});

test('etapa encerrada usa situação cinza, mas aparece na aba de finalizadas sem contar execução', () => {
  consultar.mockReturnValue(estado([{ ...base, status: 'ENCERRADA' }]));
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  expect(screen.getByText('Encerrada')).toBeInTheDocument();
  expect(document.querySelector('[data-etapa-estado="encerrada"]')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /Concluídas/ }));
  expect(screen.getByText('Planejamento')).toBeInTheDocument();
});


test('contrato arquivado preserva título, selo e roxo próprios da etapa concluída', () => {
  consultar.mockReturnValue(estado([{ ...base, status: 'CONCLUIDA' }]));
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar contratoArquivado />);
  const li = document.querySelector('[data-etapa-estado="concluida"]');
  expect(li).toBeInTheDocument();
  expect(within(li as HTMLElement).getByText('Concluída')).toBeInTheDocument();
  expect(within(li as HTMLElement).queryByText('Contrato arquivado')).not.toBeInTheDocument();
});


test.each([
  [{}, 'normal'],
  [{ contratoEmRevisao: true }, 'revisao'],
  [{ contratoConcluido: true }, 'concluido'],
  [{ contratoPendenteConclusao: true }, 'concluido'],
  [{ contratoSuspenso: true }, 'suspenso'],
  [{ contratoCancelado: true }, 'cancelado'],
  [{ contratoEncerrado: true }, 'encerrado'],
  [{ contratoArquivado: true }, 'arquivado'],
] as const)('Patch 27: filtros das etapas usam o contexto %o (%s)', (situacao, esperado) => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar {...situacao} />);
  const filtros = screen.getByRole('tablist', { name: 'Visualizações das etapas' });
  expect(filtros).toHaveAttribute('data-pi-etapas-filtros');
  expect(filtros.closest('[data-pi-painel-contextual]')).toHaveAttribute('data-tec08-estado', esperado);
  expect(within(filtros).getByRole('tab', { name: 'Todas' })).toHaveAttribute('aria-selected', 'true');
});
