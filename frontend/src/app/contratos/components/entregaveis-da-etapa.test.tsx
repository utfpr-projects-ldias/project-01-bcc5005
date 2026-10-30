import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { ErroEntregavel, type Entregavel } from '@/lib/entregaveis';
const c = 'contrato-a';
const etapa = 'etapa-a';
const e: Entregavel = {
  id: 'item-a', contratoId: c, etapaId: etapa, nome: 'Relatório de instalação', codigo: 'P-01', descricao: null,
  tipo: 'UNICO', responsavelId: null, inicioPrevisto: null, terminoPrevisto: '2026-11-30',
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null,
  periodicidade: null, configuracaoPeriodicidade: null, peso: null, criterioConclusao: null,
  statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, observacoes: null,
  evidenciasEsperadas: [],
};
const atualizar = jest.fn().mockResolvedValue([]);
const props = { contratoId: c, etapaId: etapa, dados: [e], carregando: false, atualizar };
beforeEach(() => atualizar.mockClear());
test('lista contrato/etapa reais, tipo, prazo, link acessivel e nenhum status ficticio', () => {
  render(<EntregaveisDaEtapa {...props} />);
  const lista = screen.getByRole('list', { name: 'Entregáveis planejados da etapa' });
  expect(within(lista).getByText('Relatório de instalação')).toHaveAttribute('href', '/contratos/contrato-a/entregaveis/item-a');
  expect(lista).toHaveTextContent('P-01');
  expect(lista).toHaveTextContent('Único');
  expect(lista).toHaveTextContent('30/11/2026');
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Atualizar entregáveis' })).toBeEnabled();
});
test('isola etapa e contrato mesmo que API retorne item trocado', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, etapaId: 'outra-etapa' }, { ...e, id: 'b', contratoId: 'outro' }]} />);
  expect(screen.getByText('Nenhum entregável cadastrado nesta etapa.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
test('carregando, vazio e erro de autorizacao nunca exibem registros antigos', () => {
  const view = render(<EntregaveisDaEtapa {...props} dados={undefined} carregando />);
  expect(screen.getByRole('status')).toHaveTextContent('Carregando entregáveis');
  view.rerender(<EntregaveisDaEtapa {...props} dados={[]} />);
  expect(screen.getByText('Nenhum entregável cadastrado nesta etapa.')).toBeInTheDocument();
  view.rerender(<EntregaveisDaEtapa {...props} erro={new ErroEntregavel(403, 'Acesso negado')} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Acesso negado');
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});

test('HU07-04: exibe cadastro somente para quem pode planejar, sem esconder listagem', () => {
  const livre = render(<EntregaveisDaEtapa {...props} podeCriar={false} />);
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  livre.rerender(<EntregaveisDaEtapa {...props} podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrando entregável' }));
  expect(screen.queryByRole('form', { name: 'Cadastrar entregável' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Relatório de instalação' })).toBeInTheDocument();
});

test('exibe nome e e-mail do responsável retornados pela API, sem UUID técnico', () => {
  const usuario = { nome: 'Maria Souza', email: 'maria@example.org' };
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, responsavelId: 'uuid-qa', responsavel: usuario }]} />);
  expect(screen.getByText('Maria Souza — maria@example.org')).toBeInTheDocument();
  expect(screen.queryByText('uuid-qa')).not.toBeInTheDocument();
});


test('Atualizar entregáveis: loading mínimo, bloqueio de clique repetido e aviso no estado vazio', async () => {
  jest.useFakeTimers();
  try {
    render(<EntregaveisDaEtapa {...props} dados={[]} />);
    expect(screen.getByText('Nenhum entregável cadastrado nesta etapa.')).toBeInTheDocument();
    const botao = screen.getByRole('button', { name: 'Atualizar entregáveis' });
    act(() => { fireEvent.click(botao); fireEvent.click(botao); });
    expect(atualizar).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Atualizando entregáveis...' })).toBeDisabled();
    await act(async () => { await Promise.resolve(); await jest.advanceTimersByTimeAsync(649); });
    expect(screen.getByRole('button', { name: 'Atualizando entregáveis...' })).toBeDisabled();
    await act(async () => { await jest.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('button', { name: 'Atualizar entregáveis' })).toBeEnabled();
    expect(screen.getByText('Lista de entregáveis atualizada.')).toBeInTheDocument();
    expect(screen.getByText('Nenhum entregável cadastrado nesta etapa.')).toBeInTheDocument();
  } finally {
    jest.useRealTimers();
  }
});
