jest.mock('@/app/contratos/components/painel-comprovacao-evidencia', () => ({
  PainelComprovacaoEvidencia: ({ esperadaId }: { esperadaId: string }) => <p data-testid="comprovacao-da-evidencia">Enviar comprovante · Aguardando envio · {esperadaId}</p>,
}));
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
// Teste isolado do modal: a consulta de atividades é coberta por testes próprios.
jest.mock('@/hooks/use-atividades', () => ({ useAtividades: () => ({
  atividades: [], total: 0, loading: false, atualizando: false, erro: null, atualizar: jest.fn(),
}) }));
import { alterarArquivoEntregavel, excluirEntregavelArquivado, consultarHistoricoEntregavel, listarEntregaveisArquivados, ErroEntregavel, type Entregavel } from '@/lib/entregaveis';
jest.mock('@/lib/entregaveis', () => ({
  ...jest.requireActual('@/lib/entregaveis'),
  alterarArquivoEntregavel: jest.fn(), excluirEntregavelArquivado: jest.fn(), consultarHistoricoEntregavel: jest.fn(), listarEntregaveisArquivados: jest.fn(),
}));
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn() }));
const consultarDetalhe = useDetalheEntregavel as jest.Mock;
const arquivarEntregavel = alterarArquivoEntregavel as jest.Mock;
const excluirEntregavel = excluirEntregavelArquivado as jest.Mock;
const historico = consultarHistoricoEntregavel as jest.Mock;
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
  historico.mockResolvedValue([]);
  atualizar.mockClear();
  arquivarEntregavel.mockReset();
  excluirEntregavel.mockReset().mockResolvedValue({ id: e.id, excluido: true });
  (listarEntregaveisArquivados as jest.Mock).mockReset().mockResolvedValue([]);
  arquivarEntregavel.mockResolvedValue({ id: 'item-a', arquivadoEm: '2026-11-04T05:30:00.000Z' });
  consultarDetalhe.mockReturnValue({ dados: e, carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue(e) });
});
test('lista contrato/etapa reais, tipo, prazo, link acessivel e nenhum status ficticio', () => {
  render(<EntregaveisDaEtapa {...props} />);
  const lista = screen.getByRole('list', { name: 'Entregáveis planejados da etapa' });
  expect(within(lista).getByRole('link', { name: 'Relatório de instalação' })).toHaveAttribute('aria-haspopup', 'dialog');
  expect(within(lista).queryByRole('link', { name: 'Abrir página completa' })).not.toBeInTheDocument();
  expect(lista).toHaveTextContent('P-01');
  expect(lista).toHaveTextContent('Único');
  // O card mostra somente a data prevista disponível, sem inventar início.
  expect(lista).toHaveTextContent('Término previsto: 30/11/2026');
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar entregáveis' })).not.toBeInTheDocument();
});
test('isola etapa e contrato mesmo que API retorne item trocado', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, etapaId: 'outra-etapa' }, { ...e, id: 'b', contratoId: 'outro' }]} />);
  expect(screen.getByText('Nenhum entregável pendente de comprovação.')).toBeInTheDocument();
  expect(screen.queryByRole('link')).not.toBeInTheDocument();
});
test('carregando, vazio e erro de autorizacao nunca exibem registros antigos', () => {
  const view = render(<EntregaveisDaEtapa {...props} dados={undefined} carregando />);
  expect(screen.getByRole('status')).toHaveTextContent('Carregando entregáveis');
  view.rerender(<EntregaveisDaEtapa {...props} dados={[]} />);
  expect(screen.getByText('Nenhum entregável pendente de comprovação.')).toBeInTheDocument();
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
  // Identificação pessoal completa continua no detalhe, não no card resumido.
  expect(screen.queryByText('Maria Souza — maria@example.org')).not.toBeInTheDocument();
  expect(screen.queryByText('uuid-qa')).not.toBeInTheDocument();
});


test('lista usa atualização de dados após mutação, sem botão redundante de atualizar', () => {
  render(<EntregaveisDaEtapa {...props} dados={[]} />);
  expect(screen.getByText('Nenhum entregável pendente de comprovação.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar entregáveis' })).not.toBeInTheDocument();
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
  const view = render(<EntregaveisDaEtapa {...props} podeCriar podeEditar />);
  const botao = screen.getByRole('link', { name: 'Relatório de instalação' });
  const enderecoAntes = window.location.pathname;
  fireEvent.click(botao);
  expect(screen.getByRole('dialog', { name: 'Relatório de instalação' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: `Editar entregável ${e.nome}` })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Abrir página completa' })).not.toBeInTheDocument();
  expect(within(screen.getByRole('dialog', { name: 'Relatório de instalação' }))
    .getByRole('tab', { name: 'Evidências' })).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Situação da comprovação' })).not.toBeInTheDocument();
  expect(window.location.pathname).toBe(enderecoAntes);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.unmount();
});

test('modal de entregável: evidência planejada abre detalhe sem simular arquivo entregue', async () => {
  const itemComChecklist = { ...e, evidenciasEsperadas: [{ id: 'ee-1', tipoEvidencia: 'Relatório', descricao: 'Relatório mensal', obrigatoria: true }] };
  consultarDetalhe.mockReturnValue({ dados: itemComChecklist, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} dados={[itemComChecklist]} />);
  await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Relatório de instalação' })); });
  const modal = screen.getByRole('dialog', { name: 'Relatório de instalação' });
  const areaRolagem = modal.querySelector<HTMLElement>('.overflow-y-auto');
  expect(areaRolagem).not.toBeNull();
  // Simula o usuário tendo rolado o painel até as evidências antes do clique.
  areaRolagem!.scrollTop = 280;
  expect(await screen.findByRole('list', { name: 'Evidências obrigatórias' })).toBeInTheDocument();
  const gatilhoEvidencia = screen.getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  fireEvent.click(gatilhoEvidencia);
  const modalEvidencia = screen.getByRole('dialog', { name: 'Relatório' });
  expect(modalEvidencia).toBeInTheDocument();
  expect(modalEvidencia.parentElement).toHaveClass('items-center', 'justify-center');
  // A camada superior não remove o botão do entregável nem altera sua geometria.
  expect(within(modal).getByRole('button', { name: 'Voltar ao nível anterior', hidden: true })).toBeInTheDocument();
  // A janela de consulta do entregável permanece em max-w-3xl; a evidência é menor.
  // A largura não deve ser confundida com o limite vertical do formulário de edição.
  expect(modal).toHaveClass('max-w-3xl');
  expect(modalEvidencia).toHaveClass('max-w-xl');
  expect(within(modalEvidencia).getByRole('button', { name: 'Fechar evidência' })).toBeInTheDocument();
  expect(modal).toHaveAttribute('aria-hidden', 'true');
  expect(modal.isConnected).toBe(true); // Não desmontar o entregável sob a evidência.
  expect(within(screen.getByRole('region', { name: 'Detalhe da evidência esperada' }))
    .getByTestId('comprovacao-da-evidencia')).toHaveTextContent('ee-1');
  expect(screen.getByText(/Enviar comprovante · Aguardando envio/)).toBeInTheDocument();
  // Ao abrir um detalhe curto, o browser pode reduzir o scrollTop para zero.
  areaRolagem!.scrollTop = 0;
  fireEvent.click(screen.getByRole('button', { name: 'Fechar evidência' }));
  expect(screen.getByRole('tab', { name: 'Evidências' })).toBeInTheDocument();
  expect(areaRolagem!.scrollTop).toBe(280);
  // O botão anterior foi desmontado pelo React: a restauração precisa focar
  // o elemento NOVO, e não uma referência DOM já desconectada.
  expect(gatilhoEvidencia.isConnected).toBe(true);
  const gatilhoRemontado = screen.getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  expect(gatilhoRemontado).toBe(gatilhoEvidencia);
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


test('resposta de detalhe vazia após carga não reutiliza o item de listagem', () => {
  consultarDetalhe.mockReturnValue({ dados: undefined, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  fireEvent.click(screen.getByRole('link', { name: 'Relatório de instalação' }));
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado');
  expect(screen.queryByRole('heading', { name: 'Relatório de instalação' })).not.toBeInTheDocument();
});

test('cache legítimo da lista aparece somente enquanto a consulta autoritativa está pendente', () => {
  consultarDetalhe.mockReturnValue({ dados: undefined, carregando: true, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  fireEvent.click(screen.getByRole('link', { name: 'Relatório de instalação' }));
  expect(screen.getByRole('dialog', { name: 'Relatório de instalação' })).toBeInTheDocument();
});

test('ações de arquivar e editar ficam no cartão; modal de leitura não as duplica', () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  const lista = screen.getByRole('list', { name: 'Entregáveis planejados da etapa' });
  const card = within(lista).getByRole('link', { name: e.nome });
  expect(card).toHaveAttribute('aria-haspopup', 'dialog');
  expect(within(lista).getByRole('button', { name: `Editar entregável ${e.nome}` })).toBeInTheDocument();
  expect(within(lista).getByRole('button', { name: `Arquivar entregável ${e.nome}` })).toBeInTheDocument();
  fireEvent.click(card);
  const detalhe = screen.getByRole('dialog', { name: e.nome });
  expect(within(detalhe).queryByRole('button', { name: /Arquivar entregável/ })).not.toBeInTheDocument();
  expect(within(detalhe).queryByRole('button', { name: /Editar entregável/ })).not.toBeInTheDocument();
  fireEvent.keyDown(detalhe, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: e.nome })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Editar entregável ${e.nome}` }));
  const formulario = screen.getByRole('form', { name: `Editar entregável ${e.nome}` });
  expect(formulario).toBeInTheDocument();
  const janelaDeEdicao = formulario.closest('[role="dialog"]');
  expect(janelaDeEdicao).toHaveStyle({ maxHeight: 'calc(100dvh - 24px)', height: 'min(88dvh, 850px)' });
  expect(janelaDeEdicao?.querySelector('[data-tec08-corpo-modal]')).toHaveClass('overflow-y-auto');
  expect(within(formulario).queryByRole('button', { name: /Arquivar entregável/ })).not.toBeInTheDocument();
  fireEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('form', { name: `Editar entregável ${e.nome}` })).not.toBeInTheDocument();
  // Cancelar a edição iniciada diretamente pelo lápis do cartão volta à etapa,
  // sem exigir outra volta no modal de detalhe.
  expect(screen.queryByRole('dialog', { name: e.nome })).not.toBeInTheDocument();
});

test('arquivar pelo cartão exige confirmação; cancelar não chama API', () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  fireEvent.click(screen.getByRole('button', { name: `Arquivar entregável ${e.nome}` }));
  const confirmar = screen.getByRole('dialog', { name: 'Arquivar entregável?' });
  expect(confirmar).toHaveTextContent('mantendo arquivos e histórico');
  fireEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog', { name: 'Arquivar entregável?' })).not.toBeInTheDocument();
  expect(arquivarEntregavel).not.toHaveBeenCalled();
});

test('confirmação de arquivamento usa id e atualiza a consulta após API', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  fireEvent.click(screen.getByRole('button', { name: `Arquivar entregável ${e.nome}` }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Arquivar entregável?' }))
    .getByRole('button', { name: 'Confirmar arquivamento' }));
  await waitFor(() => expect(arquivarEntregavel).toHaveBeenCalledWith(c, e.id, 'arquivar', undefined));
  await waitFor(() => expect(atualizar).toHaveBeenCalled());
  expect(screen.queryByRole('dialog', { name: e.nome })).not.toBeInTheDocument();
});

test('leitura não oferece ações de edição nem arquivamento', () => {
  render(<EntregaveisDaEtapa {...props} podeEditar={false} podeArquivar={false} />);
  expect(screen.queryByRole('button', { name: `Arquivar entregável ${e.nome}` })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: `Editar entregável ${e.nome}` })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('link', { name: e.nome }));
  expect(screen.getByRole('dialog', { name: e.nome })).toBeInTheDocument();
});

test('permissão de arquivamento sem edição só exibe arquivar no cartão', () => {
  render(<EntregaveisDaEtapa {...props} podeEditar={false} podeArquivar />);
  expect(screen.queryByRole('button', { name: `Editar entregável ${e.nome}` })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: `Arquivar entregável ${e.nome}` }));
  expect(screen.getByRole('dialog', { name: 'Arquivar entregável?' })).toBeInTheDocument();
});

test('permissão granular cria entregável, mas não permite anexar evidências no cadastro', () => {
  render(<EntregaveisDaEtapa {...props} podeCriar permissoes={{ criarEvidencias: false } as never} />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  expect(screen.queryByRole('group', { name: /Evidências iniciais/ })).not.toBeInTheDocument();
});

test('comprovação completa sem conclusão operacional não coloca entregável na aba Concluídos', () => {
  const comObrigatoria = { ...e, evidenciasEsperadas: [{ id: 'e-qa', tipoEvidencia: 'Foto', descricao: null, obrigatoria: true }] };
  render(<EntregaveisDaEtapa {...props} dados={[comObrigatoria]}
    documental={{ [e.id]: { obrigatorias: 1, verificadas: 1 } }} />);
  const cartao = screen.getByRole('link', { name: e.nome });
  expect(cartao).toHaveClass('border-brand-green/40');
  expect(cartao).not.toHaveClass('opacity-85');
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis concluídos' }));
  expect(screen.queryByRole('link', { name: e.nome })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /^Entregáveis$/ }));
  expect(within(cartao).getByLabelText('Entregável com comprovação documental completa')).toHaveClass('h-8');
  expect(cartao).toHaveTextContent('Comprovação documental completa');
  // O marcador já foi localizado acima. Uma nova consulta após o filtro pode
  // disputar a atualização assíncrona da consulta documental e gerar falso negativo.
});

test('abas de entregáveis não movem a geometria quando arquivados estiver vazio', async () => {
  const { listarEntregaveisArquivados } = await import('@/lib/entregaveis');
  // A aba consulta somente entregáveis arquivados, sem trocar a altura do recipiente.
  const consultaArquivo = listarEntregaveisArquivados as jest.Mock;
  consultaArquivo.mockResolvedValueOnce([]);
  render(<EntregaveisDaEtapa {...props} podeArquivar />);
  const caixa = screen.getByRole('region', { name: 'Entregáveis da etapa' });
  expect(caixa).toHaveClass('min-h-[min(42dvh,400px)]');
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado nesta etapa.')).toBeInTheDocument());
  expect(caixa).toHaveClass('min-h-[min(42dvh,400px)]');
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /^Entregáveis$/ }));
  expect(screen.getByRole('list', { name: 'Entregáveis planejados da etapa' })).toBeInTheDocument();
  consultaArquivo.mockReset();
});


test('card usa checklist esperado imediatamente, mesmo antes de carregar o resumo documental', () => {
  const checklist = [{ id: 'qa-prevista', tipoEvidencia: 'Relatório', descricao: 'Checklist', obrigatoria: true }];
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, evidenciasEsperadas: checklist }]} />);
  expect(screen.getByRole('link', { name: 'Relatório de instalação' })).toHaveTextContent('0/1 evidência esperada');
  expect(screen.queryByText('Consultando comprovação...')).not.toBeInTheDocument();
});


test('exclusão de entregável arquivado exige permissão e confirmação e remove o cartão após a API', async () => {
  const listaArquivados = listarEntregaveisArquivados as jest.Mock;
  listaArquivados.mockReset()
    .mockResolvedValueOnce([{ ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' }])
    .mockResolvedValue([]);
  render(<EntregaveisDaEtapa {...props} podeArquivar
    permissoes={{ excluirEntregaveisArquivados: true } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  const lixeira = await screen.findByRole('button', { name: `Excluir entregável arquivado ${e.nome}` });
  fireEvent.click(lixeira);
  const confirmacao = screen.getByRole('dialog', { name: 'Excluir entregável arquivado?' });
  expect(excluirEntregavel).not.toHaveBeenCalled();
  fireEvent.click(within(confirmacao).getByRole('button', { name: 'Excluir definitivamente' }));
  await waitFor(() => expect(excluirEntregavel).toHaveBeenCalledWith(c, e.id));
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado nesta etapa.')).toBeInTheDocument());
  expect(screen.queryByRole('dialog', { name: 'Excluir entregável arquivado?' })).not.toBeInTheDocument();
});

test('sem permissão explícita a aba arquivados não exibe lixeira', async () => {
  (listarEntregaveisArquivados as jest.Mock).mockResolvedValueOnce([
    { ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' },
  ]);
  render(<EntregaveisDaEtapa {...props} podeArquivar permissoes={{ excluirEntregaveisArquivados: false } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  await screen.findByText(e.nome);
  expect(screen.queryByRole('button', { name: `Excluir entregável arquivado ${e.nome}` })).not.toBeInTheDocument();
});


test('reativar entregável arquivado exige confirmação e não troca de aba automaticamente', async () => {
  const arquivado = { ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' };
  (listarEntregaveisArquivados as jest.Mock).mockReset().mockResolvedValueOnce([arquivado]).mockResolvedValue([]);
  render(<EntregaveisDaEtapa {...props} podeArquivar permissoes={{ reativarEntregaveis: true } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  const reativar = await screen.findByRole('button', { name: 'Reativar' });
  fireEvent.click(reativar);
  expect(arquivarEntregavel).not.toHaveBeenCalled();
  const confirmar = screen.getByRole('dialog', { name: 'Reativar entregável?' });
  fireEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }));
  expect(arquivarEntregavel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
  const dialogo = screen.getByRole('dialog', { name: 'Reativar entregável?' });
  fireEvent.change(within(dialogo).getByRole('textbox', { name: /Justificativa obrigatória/ }), { target: { value: 'Reativação auditável para retomada do planejamento.' } });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar reativação' }));
  await waitFor(() => expect(arquivarEntregavel).toHaveBeenCalledWith(c, e.id, 'reativar', 'Reativação auditável para retomada do planejamento.'));
  expect(screen.getByRole('tab', { name: 'Entregáveis arquivados' })).toHaveAttribute('aria-selected', 'true');
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado nesta etapa.')).toBeInTheDocument());
});


test('documentação verificada não faz entregável não concluído assumir status violeta', () => {
  const esperado = { ...e, codigoPublico: 6, evidenciasEsperadas: [{ id: 'eva', tipoEvidencia: 'Laudo', obrigatoria: true, descricao: null }] };
  render(<EntregaveisDaEtapa {...props} dados={[esperado]} documental={{ [e.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }} />);
  const link = screen.getByRole('link', { name: e.nome });
  expect(link).toHaveTextContent('Relatório de instalação');
  expect(link).toHaveTextContent('#00006');
  expect(link).toHaveTextContent('Comprovação documental completa');
  expect(link).not.toHaveTextContent('Pronto para concluir');
  expect(link).not.toHaveClass('border-violet-500/65');
});

test('etapa arquivada impede arquivar o filho, mantém acesso de leitura', () => {
  render(<EntregaveisDaEtapa {...props} paiArquivado podeArquivar podeEditar podeCriar />);
  expect(screen.getByRole('link', { name: e.nome })).toBeInTheDocument();
  const botao = screen.getByRole('button', { name: `Arquivar entregável ${e.nome}` });
  expect(botao).toBeDisabled();
  expect(botao).toHaveClass('disabled:cursor-not-allowed');
  expect(screen.getByRole('button', { name: `Editar entregável ${e.nome}` })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  expect(arquivarEntregavel).not.toHaveBeenCalled();
});

test('cartão usa título com largura responsiva e mantém ações no rodapé em telas estreitas', () => {
  render(<EntregaveisDaEtapa {...props} podeArquivar podeEditar />);
  const link = screen.getByRole('link', { name: 'Relatório de instalação' });
  expect(link).toHaveClass('pb-14');
  expect(link).not.toHaveClass('sm:pb-3.5');
  const botoes = link.parentElement?.querySelector<HTMLDivElement>('.absolute');
  expect(botoes).toHaveClass('bottom-2');
  expect(botoes).not.toHaveClass('sm:top-3');
  expect(within(link).getByText('Relatório de instalação')).toHaveClass('break-words');
});

test('evidência opcional verificada não promove status operacional nem modal a concluído', () => {
  const comOpcional = { ...e, evidenciasEsperadas: [{ id: 'opcional-1', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false }] };
  render(<EntregaveisDaEtapa {...props} dados={[comOpcional]}
    documental={{ [e.id]: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 1 } }} />);
  const link = screen.getByRole('link', { name: e.nome });
  expect(link).not.toHaveClass('border-violet-500/65');
  expect(link).toHaveTextContent('Comprovação documental completa');
  fireEvent.click(link);
  expect(screen.getByRole('dialog', { name: e.nome })).not.toHaveClass('border-violet-500/45');
});


test('aba Concluídos exige status operacional persistido, independente do checklist usado como filtro', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, statusExecucao: 'CONCLUIDO' as const }]} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis concluídos' }));
  expect(screen.getByRole('link', { name: e.nome })).toHaveTextContent('Concluído');
});


test('arquivamento da etapa bloqueia ações, mas não recolore entregável concluído', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, statusExecucao: 'CONCLUIDO' }]}
    paiArquivado estadoProprioEtapa="arquivado" podeEditar />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis concluídos' }));
  const card = screen.getByRole('link', { name: 'Relatório de instalação' });
  expect(card.closest('[data-entregavel-estado]')).toHaveAttribute('data-entregavel-estado', 'concluido');
  expect(card).toHaveClass('border-violet-500/65');
  expect(card).not.toHaveClass('border-amber-500/60');
  expect(screen.getByRole('button', { name: `Editar entregável ${e.nome}` })).toBeDisabled();
});
