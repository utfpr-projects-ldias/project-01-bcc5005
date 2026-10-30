jest.mock('@/hooks/use-entregaveis', () => ({
  useEntregaveis: () => ({ dados: [], carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue([]) }),
}));
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PainelEtapas } from './painel-etapas';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { ErroEtapa, type Etapa } from '@/lib/etapas';

jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn(), useMutacoesEtapas: jest.fn() }));
const consultar = useEtapas as jest.Mock;
const mutacoesHook = useMutacoesEtapas as jest.Mock;
const atualizar = jest.fn();
const criar = jest.fn();
const editar = jest.fn();
const reordenar = jest.fn();
const contrato = '11111111-1111-4111-8111-111111111111';
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
  consultar.mockReturnValue(estado());
  mutacoesHook.mockReturnValue({ criar, editar, reordenar });
  atualizar.mockResolvedValue(duas);
  criar.mockResolvedValue({ ...base, id: 'nova' });
  editar.mockResolvedValue(base);
  reordenar.mockResolvedValue([...duas].reverse());
});

describe('HU06-03 — painel no contrato', () => {
  test('lista ordenada, campos, status, datas e aviso de vigência acessível', () => {
    render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
    const lista = screen.getByRole('list', { name: 'Etapas em ordem de execução' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
    expect(within(lista).getAllByRole('listitem')[1]).toHaveTextContent('Entrega');
    expect(within(within(lista).getAllByRole('listitem')[0]).getByText('10/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Descrição da etapa')).toBeInTheDocument();
    expect(screen.getByText(/datas previstas desta etapa estão fora/)).toHaveAttribute('role', 'note');
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
    expect(screen.getByRole('button', { name: 'Atualizando...' })).toBeDisabled();
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
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Descer etapa Planejamento' })); });
    expect(reordenar).toHaveBeenCalledWith(['etapa-1', 'etapa-2'], ['etapa-2', 'etapa-1']);
    const lista = screen.getByRole('list', { name: 'Etapas em ordem de execução' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
    expect(screen.getByText('Falha simulada')).toBeInTheDocument();
  });
  test('409 exige atualizar a lista; erro 403 impede reutilizar dados em tela', async () => {
    reordenar.mockRejectedValueOnce(new ErroEtapa(409, 'Ordem desatualizada'));
    const view = render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
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

test('botões de criação e edição alternam expandido/recolhido no próprio botão, sem salvar', () => {
  render(<PainelEtapas contratoId={contrato} habilitado podeGerenciar />);
  const novo = screen.getByRole('button', { name: 'Nova etapa' });
  expect(novo).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(novo);
  const criando = screen.getByRole('button', { name: 'Cadastrando etapa' });
  expect(criando).toBeEnabled();
  expect(criando).toHaveAttribute('aria-expanded', 'true');
  expect(criando.querySelector('svg')).not.toBeNull();
  expect(document.getElementById('formulario-nova-etapa')).toHaveClass('etapa-form-expandido');
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Rascunho não salvo' } });
  fireEvent.click(criando);
  expect(document.getElementById('formulario-nova-etapa')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(screen.getByRole('button', { name: 'Nova etapa' }));
  expect(screen.getByLabelText('Nome *')).toHaveValue('');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa Planejamento' }));
  const editando = screen.getByRole('button', { name: 'Editando etapa Planejamento' });
  expect(editando).toBeEnabled();
  expect(editando).toHaveAttribute('aria-expanded', 'true');
  expect(editando.querySelector('svg')).not.toBeNull();
  expect(document.getElementById('formulario-etapa-etapa-1')).toHaveClass('etapa-form-expandido');
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
  expect(screen.getByRole('button', { name: 'Editando etapa Planejamento' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Atualizar etapas' })).toBeDisabled();
  await act(async () => { concluir(base); });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Editando etapa Planejamento' })).not.toBeInTheDocument());
  expect(screen.getByRole('button', { name: 'Editar etapa Planejamento' })).toBeEnabled();
});
