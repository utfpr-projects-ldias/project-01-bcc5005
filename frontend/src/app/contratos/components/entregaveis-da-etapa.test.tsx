import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
import { ErroEntregavel, type Entregavel } from '@/lib/entregaveis';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn() }));
const consultarDetalhe = useDetalheEntregavel as jest.Mock;
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
beforeEach(() => {
  atualizar.mockClear();
  consultarDetalhe.mockReturnValue({ dados: e, carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue(e) });
});
test('lista contrato/etapa reais, tipo, prazo, link acessivel e nenhum status ficticio', () => {
  render(<EntregaveisDaEtapa {...props} />);
  const lista = screen.getByRole('list', { name: 'Entregáveis planejados da etapa' });
  expect(within(lista).getByRole('link', { name: 'Relatório de instalação' })).toHaveAttribute('aria-haspopup', 'dialog');
  expect(within(lista).queryByRole('link', { name: 'Abrir página completa' })).not.toBeInTheDocument();
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


test('recolher e reabrir cadastro preserva rascunho sem animation; envio bem-sucedido reinicia', async () => {
  const atualizar = jest.fn().mockResolvedValue(undefined);
  const { rerender } = render(<EntregaveisDaEtapa contratoId="qa" etapaId="etapa" dados={[]} carregando={false} atualizar={atualizar} podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Rascunho não enviado' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrando entregável' }));
  expect(screen.queryByLabelText('Nome *')).not.toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByLabelText('Nome *')).toHaveValue('Rascunho não enviado');
  rerender(<EntregaveisDaEtapa contratoId="qa" etapaId="etapa" dados={[]} carregando={false} atualizar={atualizar} podeCriar />);
});


test('clique no título abre detalhe real em modal; Escape preserva contrato e scroll', () => {
  const view = render(<EntregaveisDaEtapa {...props} podeCriar />);
  const botao = screen.getByRole('link', { name: 'Relatório de instalação' });
  const enderecoAntes = window.location.pathname;
  fireEvent.click(botao);
  expect(screen.getByRole('dialog', { name: 'Relatório de instalação' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar entregável' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Abrir página completa' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('dialog', { name: 'Relatório de instalação' }))
    .getByRole('region', { name: 'Situação da comprovação' })).toHaveTextContent('Comprovação ainda não acompanhada');
  expect(window.location.pathname).toBe(enderecoAntes);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.unmount();
});

test('modal de entregável: evidência planejada abre detalhe sem simular arquivo entregue', () => {
  const itemComChecklist = { ...e, evidenciasEsperadas: [{ id: 'ee-1', tipoEvidencia: 'Relatório', descricao: 'Relatório mensal', obrigatoria: true }] };
  consultarDetalhe.mockReturnValue({ dados: itemComChecklist, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} dados={[itemComChecklist]} />);
  fireEvent.click(screen.getByRole('link', { name: 'Relatório de instalação' }));
  const modal = screen.getByRole('dialog', { name: 'Relatório de instalação' });
  const areaRolagem = modal.querySelector<HTMLElement>('.overflow-y-auto');
  expect(areaRolagem).not.toBeNull();
  // Simula o usuário tendo rolado o painel até as evidências antes do clique.
  areaRolagem!.scrollTop = 280;
  expect(screen.getByRole('list', { name: 'Evidências obrigatórias' })).toBeInTheDocument();
  const gatilhoEvidencia = screen.getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  fireEvent.click(gatilhoEvidencia);
  expect(screen.getByRole('region', { name: 'Detalhe da evidência esperada' })).toHaveTextContent('Relatório mensal');
  expect(screen.getByText(/Nenhum arquivo foi marcado como recebido/)).toBeInTheDocument();
  // Ao abrir um detalhe curto, o browser pode reduzir o scrollTop para zero.
  areaRolagem!.scrollTop = 0;
  fireEvent.click(screen.getByRole('button', { name: /Voltar ao entregável/ }));
  expect(screen.getByRole('heading', { name: 'Evidências esperadas' })).toBeInTheDocument();
  expect(areaRolagem!.scrollTop).toBe(280);
  // O botão anterior foi desmontado pelo React: a restauração precisa focar
  // o elemento NOVO, e não uma referência DOM já desconectada.
  expect(gatilhoEvidencia.isConnected).toBe(false);
  const gatilhoRemontado = screen.getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  expect(gatilhoRemontado).not.toBe(gatilhoEvidencia);
  expect(gatilhoRemontado).toHaveFocus();
  expect(areaRolagem!.scrollTop).toBe(280);
});

test('isolamento: detalhe de outro contrato é negado mesmo que o cache da lista esteja disponível', () => {
  consultarDetalhe.mockReturnValue({ dados: { ...e, contratoId: 'outro' }, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  fireEvent.click(screen.getByRole('link', { name: 'Relatório de instalação' }));
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado');
  expect(screen.queryByRole('heading', { name: 'Relatório de instalação' })).not.toBeInTheDocument();
});
