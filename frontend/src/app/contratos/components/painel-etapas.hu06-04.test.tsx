import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PainelEtapas } from './painel-etapas';
import { useEtapas, useMutacoesEtapas } from '@/hooks/use-etapas';
import { ErroEtapa, type Etapa } from '@/lib/etapas';

/** HU06-04: testes DOM com respostas MOCKADAS, sem alegar integração de rede/DB. */
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn(), useMutacoesEtapas: jest.fn() }));
const hookConsulta = useEtapas as jest.Mock;
const hookMutacao = useMutacoesEtapas as jest.Mock;
const atualizar = jest.fn();
const criar = jest.fn();
const editar = jest.fn();
const reordenar = jest.fn();
const contratoId = '11111111-1111-4111-8111-111111111111';
const registros: Etapa[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', contratoId, codigo: 'E-1',
    nome: 'Planejamento', descricao: 'Atividades iniciais', sequencia: 1,
    inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-11-30',
    status: 'PLANEJADA', observacoes: null,
    vigenciaContrato: { inicioVigencia: '2026-10-01', terminoVigencia: '2027-03-31' },
    avisoVigencia: false,
  },
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', contratoId, codigo: 'E-2',
    nome: 'Execução', descricao: null, sequencia: 2,
    inicioPrevisto: '2027-05-01', terminoPrevisto: '2027-05-31',
    status: 'EM_ANDAMENTO', observacoes: 'Verificar vigência',
    vigenciaContrato: { inicioVigencia: '2026-10-01', terminoVigencia: '2027-03-31' },
    avisoVigencia: true,
  },
];
const retorno = (dados: Etapa[] | undefined, adicionais = {}) => ({
  dados, erro: undefined, carregando: dados === undefined, atualizando: false,
  atualizar, ...adicionais,
});

beforeEach(() => {
  jest.resetAllMocks();
  atualizar.mockResolvedValue(registros);
  criar.mockResolvedValue(registros[0]);
  editar.mockResolvedValue(registros[0]);
  reordenar.mockResolvedValue([...registros].reverse());
  hookConsulta.mockReturnValue(retorno(registros));
  hookMutacao.mockReturnValue({ criar, editar, reordenar });
});

describe('HU06-04 — estados e acessibilidade do painel (React com mocks)', () => {
  it('apresenta carregamento e vazio sem exibir lista fictícia', () => {
    hookConsulta.mockReturnValue(retorno(undefined));
    const view = render(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar />);
    expect(screen.getByRole('status')).toHaveTextContent('Carregando etapas');
    expect(screen.queryByRole('list', { name: 'Etapas em ordem de execução' })).not.toBeInTheDocument();
    hookConsulta.mockReturnValue(retorno([]));
    view.rerender(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar />);
    expect(screen.getByText(/Ainda não há etapas cadastradas/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova etapa' })).toBeEnabled();
  });

  it('mostra erro de rede e permite atualizar sem inventar dados', async () => {
    hookConsulta.mockReturnValue(retorno(undefined, { carregando: false, erro: new Error('Falha simulada') }));
    render(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível consultar as etapas');
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Atualizar etapas' })); });
    expect(atualizar).toHaveBeenCalledTimes(1);
  });

  it('bloqueia planejamento para somente-leitura e não renderiza lista em erro 401', () => {
    const view = render(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar={false} />);
    expect(screen.getByRole('list', { name: 'Etapas em ordem de execução' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova etapa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Editar etapa/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Descer etapa/ })).not.toBeInTheDocument();
    hookConsulta.mockReturnValue(retorno(registros, { erro: new ErroEtapa(401, 'Sessão expirada') }));
    view.rerender(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar={false} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sessão expirada');
  });

  it('expõe botões nativos e nomes acessíveis, mantém aviso de vigência separado do status', async () => {
    render(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar />);
    const botoes = [
      screen.getByRole('button', { name: 'Descer etapa Planejamento' }),
      screen.getByRole('button', { name: 'Subir etapa Execução' }),
      screen.getByRole('button', { name: 'Editar etapa Planejamento' }),
    ];
    for (const botao of botoes) {
      expect(botao).toHaveAttribute('type', 'button');
      expect(botao).toBeEnabled();
    }
    expect(screen.getByRole('button', { name: 'Subir etapa Planejamento' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Descer etapa Execução' })).toBeDisabled();
    expect(screen.getByRole('note')).toHaveTextContent('nenhuma data foi alterada automaticamente');
    expect(screen.getByText('Em andamento')).toBeInTheDocument();
    botoes[0].focus();
    expect(botoes[0]).toHaveFocus();
    await act(async () => { fireEvent.click(botoes[0]); });
    expect(reordenar).toHaveBeenCalledWith(
      [registros[0].id, registros[1].id], [registros[1].id, registros[0].id],
    );
    expect(screen.getByRole('status')).toHaveTextContent('Ordem das etapas salva');
  });

  it('conflito 409 mantém ordem anterior e solicita recarga; falha 500 não altera a lista', async () => {
    reordenar.mockRejectedValueOnce(new ErroEtapa(409, 'Ordem desatualizada'));
    reordenar.mockRejectedValueOnce(new ErroEtapa(500, 'Falha na persistência'));
    render(<PainelEtapas contratoId={contratoId} habilitado podeGerenciar />);
    const descer = screen.getByRole('button', { name: 'Descer etapa Planejamento' });
    await act(async () => { fireEvent.click(descer); });
    await waitFor(() => expect(atualizar).toHaveBeenCalledTimes(1));
    const lista = screen.getByRole('list', { name: 'Etapas em ordem de execução' });
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
    await act(async () => { fireEvent.click(descer); });
    expect(screen.getByRole('alert')).toHaveTextContent('Falha na persistência');
    expect(within(lista).getAllByRole('listitem')[0]).toHaveTextContent('Planejamento');
  });
});
