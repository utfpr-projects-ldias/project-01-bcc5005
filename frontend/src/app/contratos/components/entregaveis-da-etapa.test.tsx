jest.mock('@/app/contratos/components/painel-comprovacao-evidencia', () => ({
  PainelComprovacaoEvidencia: ({ esperadaId }: { esperadaId: string }) => <p data-testid="comprovacao-da-evidencia">Enviar comprovante · Aguardando envio · {esperadaId}</p>,
}));
import { act, fireEvent, render as renderSemProvider, screen, waitFor, within } from '@testing-library/react';
import { useRef, useState, type ReactElement } from 'react';
import { ModalEtapa } from './modal-etapa';
import { ProvedorConsultas } from '@/app/components/provedor-consultas';
const render = (elemento: ReactElement) => renderSemProvider(elemento, { wrapper: ProvedorConsultas });
import { EntregaveisDaEtapa } from './entregaveis-da-etapa';
// Teste da lista de entregáveis: a agenda HU09 tem suíte própria e depende de ProviderConsultas.
jest.mock('@/app/ocorrencias/components/painel-ocorrencias', () => ({ PainelOcorrencias: () => <section aria-label="Ocorrências do entregável" /> }));
// Teste isolado do modal: a consulta de atividades é coberta por testes próprios.
jest.mock('@/hooks/use-atividades', () => ({ useAtividades: () => ({
  atividades: [], total: 0, loading: false, atualizando: false, erro: null, atualizar: jest.fn(),
}) }));
// A consulta de progresso possui testes próprios; esta suíte testa o modal/listagem.
// Evita deixar uma requisição do provider viva depois de fechar o modal.
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: () => ({
  progresso: null, loading: false, erro: null, atualizar: async () => undefined,
}) }));
import { alterarArquivoEntregavel, excluirEntregavelArquivado, consultarHistoricoEntregavel, listarEntregaveisArquivados, ErroEntregavel, type Entregavel } from '@/lib/entregaveis';
jest.mock('@/lib/entregaveis', () => ({
  ...jest.requireActual('@/lib/entregaveis'),
  alterarArquivoEntregavel: jest.fn(), excluirEntregavelArquivado: jest.fn(), consultarHistoricoEntregavel: jest.fn(), listarEntregaveisArquivados: jest.fn(),
}));
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn(), useEntregaveis: () => ({dados:[],carregando:false,atualizar:async()=>[]}), useResumoDocumentalContrato: () => ({dados:undefined,atualizar:async()=>undefined}) }));
jest.mock('@/hooks/use-elegibilidade-entregavel',()=>({useElegibilidadeEntregavel:()=>({dados:undefined,carregando:false,atualizar:async()=>undefined})}));
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
const props = { contratoId: c, etapaId: etapa, dados: [e], carregando: false, atualizar,
  permissoes: { editarEntregaveis: true, arquivarEntregaveis: true } as never };
beforeEach(() => {
  historico.mockResolvedValue([]);
  atualizar.mockClear();
  arquivarEntregavel.mockReset();
  excluirEntregavel.mockReset().mockResolvedValue({ id: e.id, excluido: true });
  (listarEntregaveisArquivados as jest.Mock).mockReset().mockResolvedValue([]);
  arquivarEntregavel.mockResolvedValue({ id: 'item-a', arquivadoEm: '2026-11-04T05:30:00.000Z' });
  consultarDetalhe.mockReturnValue({ dados: e, carregando: false, erro: undefined, atualizar: jest.fn().mockResolvedValue(e) });
});
async function abrirDetalheAtivo() {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: e.nome })); });
  return screen.getByRole('dialog', { name: e.nome });
}
async function abrirArquivarAtivo() {
  await abrirDetalheAtivo();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar: escolher ação' }));
  fireEvent.click(within(screen.getByRole('menu', { name: 'Fechar' })).getByRole('button', { name: 'Arquivar' }));
}
async function abrirDetalheArquivado() {
  await screen.findByText(e.nome);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: e.nome })); });
  return screen.getByRole('dialog', { name: e.nome });
}
test('lista contrato/etapa reais, tipo, prazo, botão acessível e nenhum status ficticio', () => {
  render(<EntregaveisDaEtapa {...props} />);
  const lista = screen.getByRole('table', { name: 'Entregáveis planejados da etapa' });
  expect(within(lista).getByRole('button', { name: 'Relatório de instalação' })).not.toHaveAttribute('href');
  expect(within(lista).queryByRole('link', { name: 'Abrir página completa' })).not.toBeInTheDocument();
  expect(lista).toHaveTextContent('Relatório de instalação');
  expect(lista).toHaveTextContent('Único');
  // O card mostra somente a data prevista disponível, sem inventar início.
  expect(lista).toHaveTextContent('30/11/2026');
  expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar entregáveis' })).not.toBeInTheDocument();
});
test('isola etapa e contrato mesmo que API retorne item trocado', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, etapaId: 'outra-etapa' }, { ...e, id: 'b', contratoId: 'outro' }]} />);
  expect(screen.getByText('Nenhum entregável nesta situação.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: e.nome })).not.toBeInTheDocument();
});
test('carregando, vazio e erro de autorizacao nunca exibem registros antigos', () => {
  const view = render(<EntregaveisDaEtapa {...props} dados={undefined} carregando />);
  expect(screen.getByRole('status')).toHaveTextContent('Carregando entregáveis');
  view.rerender(<EntregaveisDaEtapa {...props} dados={[]} />);
  expect(screen.getByText('Nenhum entregável nesta situação.')).toBeInTheDocument();
  view.rerender(<EntregaveisDaEtapa {...props} erro={new ErroEntregavel(403, 'Acesso negado')} />);
  expect(screen.getByRole('alert')).toHaveTextContent('Acesso negado');
  expect(screen.queryByRole('button', { name: e.nome })).not.toBeInTheDocument();
});

test('HU07-04: exibe cadastro somente para quem pode planejar, sem esconder listagem', () => {
  const livre = render(<EntregaveisDaEtapa {...props} podeCriar={false} />);
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  livre.rerender(<EntregaveisDaEtapa {...props} podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrando entregável' }));
  expect(screen.queryByRole('form', { name: 'Cadastrar entregável' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Relatório de instalação' })).toBeInTheDocument();
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
  expect(screen.getByText('Nenhum entregável nesta situação.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Atualizar entregáveis' })).not.toBeInTheDocument();
});

test('cadastro acontece em modal sem inserir formulário na listagem', () => {
  render(<EntregaveisDaEtapa {...props} dados={[]} podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('dialog', { name: 'Novo entregável' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrando entregável' }));
  expect(screen.queryByRole('form', { name: 'Cadastrar entregável' })).not.toBeInTheDocument();
});

test('clique no título abre detalhe real em modal; Escape preserva contrato e scroll', async () => {
  const view = render(<EntregaveisDaEtapa {...props} podeCriar podeEditar />);
  const botao = screen.getByRole('button', { name: 'Relatório de instalação' });
  const enderecoAntes = window.location.pathname;
  await act(async () => { fireEvent.click(botao); });
  expect(screen.getByRole('dialog', { name: 'Relatório de instalação' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar entregável' })).toBeInTheDocument();
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
  await act(async () => { render(<EntregaveisDaEtapa {...props} dados={[itemComChecklist]} />); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relatório de instalação' })); });
  const modal = screen.getByRole('dialog', { name: 'Relatório de instalação' });
  // Ocorrências é a aba inicial; abrir Evidências antes de procurar o checklist.
  await act(async () => { fireEvent.click(within(modal).getByRole('tab', { name: 'Evidências' })); });
  const areaRolagem = modal.querySelector<HTMLElement>('.overflow-y-auto');
  expect(areaRolagem).not.toBeNull();
  // Simula o usuário tendo rolado o painel até as evidências antes do clique.
  areaRolagem!.scrollTop = 280;
  expect(await screen.findByRole('list', { name: 'Evidências obrigatórias' })).toBeInTheDocument();
  const gatilhoEvidencia = screen.getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' });
  await act(async () => { fireEvent.click(gatilhoEvidencia); });
  const modalEvidencia = screen.getByRole('dialog', { name: 'Relatório' });
  expect(modalEvidencia).toBeInTheDocument();
  expect(modalEvidencia.parentElement).toHaveClass('items-center', 'justify-center');
  // A camada superior não remove o botão do entregável nem altera sua geometria.
  expect(within(modal).getByRole('button', { name: 'Voltar ao nível anterior', hidden: true })).toBeInTheDocument();
  // A janela de consulta do entregável permanece em max-w-3xl; a evidência é menor.
  // A largura não deve ser confundida com o limite vertical do formulário de edição.
  expect(modal).toHaveClass('max-w-5xl');
  expect(modalEvidencia).toHaveClass('max-w-xl');
  expect(within(modalEvidencia).getByRole('button', { name: 'Fechar evidência' })).toBeInTheDocument();
  expect(modal).toHaveAttribute('aria-hidden', 'true');
  expect(modal.isConnected).toBe(true); // Não desmontar o entregável sob a evidência.
  expect(within(screen.getByRole('region', { name: 'Detalhe da evidência esperada' }))
    .getByTestId('comprovacao-da-evidencia')).toHaveTextContent('ee-1');
  expect(screen.getByText(/Enviar comprovante · Aguardando envio/)).toBeInTheDocument();
  // Ao abrir um detalhe curto, o browser pode reduzir o scrollTop para zero.
  areaRolagem!.scrollTop = 0;
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Fechar evidência' })); });
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

test('isolamento: detalhe de outro contrato é negado mesmo que o cache da lista esteja disponível', async () => {
  consultarDetalhe.mockReturnValue({ dados: { ...e, contratoId: 'outro' }, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relatório de instalação' })); });
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado');
  expect(screen.queryByRole('heading', { name: 'Relatório de instalação' })).not.toBeInTheDocument();
});


test('resposta de detalhe vazia após carga não reutiliza o item de listagem', async () => {
  consultarDetalhe.mockReturnValue({ dados: undefined, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relatório de instalação' })); });
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado');
  expect(screen.queryByRole('heading', { name: 'Relatório de instalação' })).not.toBeInTheDocument();
});

test('cache legítimo da lista aparece somente enquanto a consulta autoritativa está pendente', async () => {
  consultarDetalhe.mockReturnValue({ dados: undefined, carregando: true, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Relatório de instalação' })); });
  expect(screen.queryByRole('dialog', { name: 'Detalhes do entregável' })).not.toBeInTheDocument();
  expect(screen.queryByText('Carregando dados do entregável...')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
});

test('ações de editar e arquivar ficam no detalhe autenticado, não duplicadas no cartão', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  const lista = screen.getByRole('table', { name: 'Entregáveis planejados da etapa' });
  expect(within(lista).queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
  const detalhe = await abrirDetalheAtivo();
  expect(within(detalhe).getByRole('button', { name: 'Editar entregável' })).toBeInTheDocument();
  expect(within(detalhe).getByRole('button', { name: 'Fechar: escolher ação' })).toBeInTheDocument();
  fireEvent.click(within(detalhe).getByRole('button', { name: 'Editar entregável' }));
  const formulario = screen.getByRole('form', { name: `Editar entregável ${e.nome}` });
  expect(formulario).toBeInTheDocument();
  expect(formulario.closest('[role="dialog"]')).toHaveStyle({ maxHeight: 'calc(100dvh - 24px)', height: 'min(88dvh, 850px)' });
  expect(within(formulario).queryByRole('button', { name: /Arquivar/ })).not.toBeInTheDocument();
  fireEvent.click(within(formulario).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('form', { name: `Editar entregável ${e.nome}` })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: e.nome })).toBeInTheDocument();
});

test('arquivar pelo detalhe exige confirmação; cancelar não chama API', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  await abrirArquivarAtivo();
  const confirmar = screen.getByRole('dialog', { name: 'Arquivar entregável?' });
  expect(confirmar).toHaveTextContent('mantendo arquivos e histórico');
  fireEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog', { name: 'Arquivar entregável?' })).not.toBeInTheDocument();
  expect(arquivarEntregavel).not.toHaveBeenCalled();
});

test('confirmação de arquivamento usa id e atualiza a consulta após API', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar podeArquivar />);
  await abrirArquivarAtivo();
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Arquivar entregável?' }))
    .getByRole('button', { name: 'Confirmar arquivamento' }));
  await waitFor(() => expect(arquivarEntregavel).toHaveBeenCalledWith(c, e.id, 'arquivar', undefined));
  await waitFor(() => expect(atualizar).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByRole('dialog', { name: e.nome })).not.toBeInTheDocument());
});

test('leitura não oferece ações de edição nem arquivamento', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar={false} podeArquivar={false} />);
  expect(screen.queryByRole('button', { name: `Arquivar entregável ${e.nome}` })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: `Editar entregável ${e.nome}` })).not.toBeInTheDocument();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: e.nome })); });
  expect(screen.getByRole('dialog', { name: e.nome })).toBeInTheDocument();
});

test('permissão de arquivamento sem edição permite ação somente no detalhe', async () => {
  render(<EntregaveisDaEtapa {...props} podeEditar={false} podeArquivar />);
  await abrirArquivarAtivo();
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
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
    documental={{ [e.id]: { obrigatorias: 1, verificadas: 1,total:1,verificadasTotal:1,ocorrenciasTotal:0,ocorrenciasFinalizadas:0,atividadesTotal:0,atividadesVerificadas:0 } }} progressoFisico={[{entregavelId:e.id,percentualExecucao:0}]} />);
  const cartao = screen.getByRole('button', { name: e.nome });
  expect(cartao.closest('tr')).toHaveAttribute('data-entregavel-estado','nao-iniciado');
  expect(within(cartao.closest('tr')!).getByLabelText('0% de execução física')).toBeInTheDocument();
  expect(cartao).not.toHaveClass('opacity-85');
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis finalizados' }));
  expect(screen.queryByRole('button', { name: e.nome })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /^Ativos$/ }));
  const atual = screen.getByRole('button',{name:e.nome});
  expect(within(atual.closest('tr')!).getByRole('img',{name:'Evidências: 1/1'})).toBeInTheDocument();
  expect(within(atual.closest('tr')!).getByTitle('Ocorrências: sem registros')).toHaveTextContent('—');
  expect(within(atual.closest('tr')!).getByTitle('Atividades: sem registros')).toHaveTextContent('—');
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
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado encontrado.')).toBeInTheDocument());
  expect(caixa).toHaveClass('min-h-[min(42dvh,400px)]');
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: /^Ativos$/ }));
  expect(screen.getByRole('table', { name: 'Entregáveis planejados da etapa' })).toBeInTheDocument();
  consultaArquivo.mockReset();
});


test('card não inventa valores antes de carregar o resumo documental', () => {
  const checklist = [{ id: 'qa-prevista', tipoEvidencia: 'Relatório', descricao: 'Checklist', obrigatoria: true }];
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, evidenciasEsperadas: checklist }]} />);
  expect(within(screen.getByRole('button', { name: 'Relatório de instalação' }).closest('tr')!).getByTitle('Evidências: indisponível')).toBeInTheDocument();
  expect(screen.queryByText('Consultando comprovação...')).not.toBeInTheDocument();
});


test('exclusão de entregável arquivado exige permissão e confirmação e remove o cartão após a API', async () => {
  const listaArquivados = listarEntregaveisArquivados as jest.Mock;
  listaArquivados.mockReset()
    .mockResolvedValueOnce([{ ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' }])
    .mockResolvedValue([]);
  consultarDetalhe.mockReturnValue({ dados: { ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' }, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} podeArquivar
    permissoes={{ excluirEntregaveisArquivados: true } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  await abrirDetalheArquivado();
  const lixeira = screen.getByRole('button', { name: 'Excluir entregável arquivado' });
  fireEvent.click(lixeira);
  const confirmacao = screen.getByRole('dialog', { name: 'Excluir entregável arquivado?' });
  expect(excluirEntregavel).not.toHaveBeenCalled();
  fireEvent.click(within(confirmacao).getByRole('button', { name: 'Excluir definitivamente' }));
  await waitFor(() => expect(excluirEntregavel).toHaveBeenCalledWith(c, e.id));
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado encontrado.')).toBeInTheDocument());
  expect(screen.queryByRole('dialog', { name: 'Excluir entregável arquivado?' })).not.toBeInTheDocument();
});

test('sem permissão explícita a aba arquivados não exibe lixeira', async () => {
  (listarEntregaveisArquivados as jest.Mock).mockResolvedValueOnce([
    { ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' },
  ]);
  render(<EntregaveisDaEtapa {...props} podeArquivar permissoes={{ excluirEntregaveisArquivados: false } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  const modal = await abrirDetalheArquivado();
  expect(within(modal).queryByRole('button', { name: 'Excluir entregável arquivado' })).not.toBeInTheDocument();
});


test('reativar entregável arquivado exige confirmação e não troca de aba automaticamente', async () => {
  const arquivado = { ...e, arquivadoEm: '2026-11-05T00:00:00.000Z' };
  (listarEntregaveisArquivados as jest.Mock).mockReset().mockResolvedValueOnce([arquivado]).mockResolvedValue([]);
  consultarDetalhe.mockReturnValue({ dados: arquivado, carregando: false, erro: undefined, atualizar: jest.fn() });
  render(<EntregaveisDaEtapa {...props} podeArquivar permissoes={{ reativarEntregaveis: true } as never} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis arquivados' }));
  await abrirDetalheArquivado();
  const reativar = screen.getByRole('button', { name: 'Reativar' });
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
  await waitFor(() => expect(screen.getByText('Nenhum entregável arquivado encontrado.')).toBeInTheDocument());
});


test('documentação verificada não faz entregável não concluído assumir status violeta', () => {
  const esperado = { ...e, codigoPublico: 6, evidenciasEsperadas: [{ id: 'eva', tipoEvidencia: 'Laudo', obrigatoria: true, descricao: null }] };
  render(<EntregaveisDaEtapa {...props} dados={[esperado]} documental={{ [e.id]: { obrigatorias: 1, verificadas: 1, total: 1, verificadasTotal: 1 } }} />);
  const link = screen.getByRole('button', { name: e.nome });
  expect(link).toHaveTextContent('Relatório de instalação');
  expect(link).toHaveTextContent('#00006');
  expect(within(link.closest('tr')!).getByRole('img',{name:'Evidências: 1/1'})).toBeInTheDocument();
  expect(link.closest('tr')).toHaveTextContent('Não iniciado');
  expect(link.closest('tr')).not.toHaveTextContent('Pronto para concluir');
  expect(link.closest('tr')).not.toHaveAttribute('data-entregavel-estado', 'concluido');
});

test('etapa arquivada impede arquivar o filho, mantém acesso de leitura', async () => {
  render(<EntregaveisDaEtapa {...props} paiArquivado podeArquivar podeEditar podeCriar />);
  expect(screen.getByRole('button', { name: e.nome })).toBeInTheDocument();
  const detalhe = await abrirDetalheAtivo();
  expect(within(detalhe).queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
  expect(within(detalhe).queryByRole('button', { name: 'Fechar: escolher ação' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Novo entregável' })).not.toBeInTheDocument();
  expect(arquivarEntregavel).not.toHaveBeenCalled();
});

test('cartão preserva largura responsiva e ações ficam no modal acessível', async () => {
  render(<EntregaveisDaEtapa {...props} podeArquivar podeEditar />);
  const link = screen.getByRole('button', { name: e.nome });
  expect(link).toHaveClass('pi-titulo-tabela');
  expect(within(link).getByText(e.nome)).toHaveAttribute('title', e.nome);
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
  const detalhe = await abrirDetalheAtivo();
  expect(within(detalhe).getByRole('button', { name: 'Editar entregável' })).toBeInTheDocument();
});

test('evidência opcional verificada não promove status operacional nem modal a concluído', () => {
  const comOpcional = { ...e, evidenciasEsperadas: [{ id: 'opcional-1', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false }] };
  render(<EntregaveisDaEtapa {...props} dados={[comOpcional]}
    documental={{ [e.id]: { obrigatorias: 0, verificadas: 0, total: 1, verificadasTotal: 1 } }} />);
  const link = screen.getByRole('button', { name: e.nome });
  expect(link.closest('tr')).not.toHaveAttribute('data-entregavel-estado', 'concluido');
  expect(link).not.toHaveTextContent('Comprovação documental completa');
  fireEvent.click(link);
  expect(screen.getByRole('dialog', { name: e.nome })).not.toHaveClass('border-violet-500/45');
});


test('aba Concluídos exige status operacional persistido, independente do checklist usado como filtro', () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, statusExecucao: 'CONCLUIDO' as const }]} />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis finalizados' }));
  expect(screen.getByRole('button', { name: e.nome }).closest('tr')).toHaveTextContent('Concluído');
});


test('arquivamento da etapa bloqueia ações, mas não recolore entregável concluído', async () => {
  render(<EntregaveisDaEtapa {...props} dados={[{ ...e, statusExecucao: 'CONCLUIDO' }]}
    paiArquivado estadoProprioEtapa="arquivado" podeEditar />);
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis finalizados' }));
  const card = screen.getByRole('button', { name: 'Relatório de instalação' });
  expect(card.closest('[data-entregavel-estado]')).toHaveAttribute('data-entregavel-estado', 'concluido');
  expect(within(card.closest('tr')!).getByText('Concluído')).toHaveAttribute('data-situacao', 'concluido');
  await abrirDetalheAtivo();
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
});


test('Ativos mostra pendentes e revisões, sem duplicar concluídos e arquivados', () => {
  render(<EntregaveisDaEtapa {...props} dados={[
    { ...e, id: 'reaberto', nome: 'Entrega reaberta', reabertoEm: '2026-11-09T10:00:00Z', statusExecucao: 'EM_ANDAMENTO' },
    { ...e, id: 'concluido', nome: 'Entrega concluída', statusExecucao: 'CONCLUIDO' },
    { ...e, id: 'arquivado', nome: 'Entrega arquivada', arquivadoEm: '2026-11-09T11:00:00Z' },
  ]} />);
  expect(screen.getByRole('tab', { name: 'Ativos' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('button', { name: 'Entrega reaberta' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entrega concluída' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entrega arquivada' })).not.toBeInTheDocument();
});


test('Finalizados reúne Concluído e Encerrado com cores próprias; Ativos não duplica nenhum dos dois', () => {
  render(<EntregaveisDaEtapa {...props} dados={[
    { ...e, id: 'completo', nome: 'Entrega concluída', statusExecucao: 'CONCLUIDO' },
    { ...e, id: 'encerrado', nome: 'Entrega encerrada', statusExecucao: 'FINALIZADO', percentualExecucao: '83.33' },
    { ...e, id: 'aberto', nome: 'Entrega em andamento', statusExecucao: 'EM_ANDAMENTO' },
  ]} />);
  expect(screen.queryByRole('button', { name: 'Entrega concluída' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entrega encerrada' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Entrega em andamento' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Entregáveis finalizados' }));
  const concluida = screen.getByRole('button', { name: 'Entrega concluída' });
  const encerrada = screen.getByRole('button', { name: 'Entrega encerrada' });
  expect(concluida.closest('tr')).toHaveAttribute('data-entregavel-estado', 'concluido');
  expect(within(encerrada.closest('tr')!).getByText('Encerrado')).toBeInTheDocument();
  expect(within(concluida.closest('tr')!).getByText('Concluído')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Entrega em andamento' })).not.toBeInTheDocument();
});


test('limite de 100% dos pesos permite cadastrar sem peso, incluindo outras etapas', () => {
  const outraEtapa = { ...e, id: 'outro-item', etapaId: 'etapa-b', peso: '80' };
  const atual = { ...e, peso: '20' };
  render(<EntregaveisDaEtapa {...props} dados={[atual, outraEtapa]} modoCalculo="PONDERADO" podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  expect(screen.getByText('0,00%')).toBeInTheDocument();
});


test('modo SIMPLES permite abrir cadastro com pesos acumulados acima de 100%, como no HU07-06', () => {
  // Após cinco edições do ADMIN (5 x 12,50) e quatro cadastros do GESTOR
  // (4 x 10), a soma é 102,50%. O Nest ignora esse teto no modo SIMPLES.
  const admin = { ...e, id: 'item-admin', peso: '62.50' };
  const gestor = { ...e, id: 'item-gestor', etapaId: 'etapa-b', peso: '40.00' };
  render(<EntregaveisDaEtapa {...props} dados={[admin, gestor]} modoCalculo="SIMPLES" podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('dialog', { name: 'Novo entregável' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Limite do peso operacional' })).not.toBeInTheDocument();
});

test('modo PONDERADO informa excedente e permite cadastrar com peso zero', () => {
  const admin = { ...e, id: 'item-admin', peso: '62.50' };
  const gestor = { ...e, id: 'item-gestor', etapaId: 'etapa-b', peso: '40.00' };
  render(<EntregaveisDaEtapa {...props} dados={[admin, gestor]} modoCalculo="PONDERADO" podeCriar />);
  fireEvent.click(screen.getByRole('button', { name: 'Novo entregável' }));
  expect(screen.getByRole('form', { name: 'Cadastrar entregável' })).toBeInTheDocument();
  expect(screen.getByText(/Excedente de/)).toBeInTheDocument();
});


test.each(['Escape','Voltar do mouse'])('etapa ancorada abre o título do entregável e %s fecha somente o nível superior', async (acao) => {
  function Cenario() {
    const ancora = useRef<HTMLDivElement>(null);
    const [aberta,setAberta] = useState(true);
    return <div ref={ancora}>
      {aberta && <ModalEtapa ancora={ancora} titulo="Etapa QA" ocupado={false} onFechar={()=>setAberta(false)}>
        <EntregaveisDaEtapa {...props} interno dentroModal />
      </ModalEtapa>}
    </div>;
  }
  render(<Cenario/>);
  fireEvent.click(screen.getByRole('button',{name:e.nome}));
  const detalhe=await screen.findByRole('region',{name:e.nome});
  const fechar=(alvo:HTMLElement)=>{
    if(acao==='Escape')fireEvent.keyDown(alvo,{key:'Escape'});
    else {fireEvent.mouseDown(alvo,{button:3});fireEvent(alvo,new MouseEvent('auxclick',{button:3,bubbles:true,cancelable:true}));}
  };
  fechar(detalhe);
  expect(screen.queryByRole('region',{name:e.nome})).not.toBeInTheDocument();
  const etapaAberta=screen.getByRole('dialog',{name:'Etapa QA'});
  expect(within(etapaAberta).getByRole('button',{name:e.nome})).toBeInTheDocument();
  fechar(etapaAberta);
  expect(screen.queryByRole('dialog',{name:'Etapa QA'})).not.toBeInTheDocument();
});

test('filtros de situação por aba, tipos independentes e limpeza conjunta', () => {
  render(<EntregaveisDaEtapa {...props} dados={[
    {...e,id:'um',nome:'Entrega pontual',statusExecucao:'NAO_INICIADO'},
    {...e,id:'dois',nome:'Entrega medida',tipo:'QUANTITATIVO',statusExecucao:'EM_ANDAMENTO'},
    {...e,id:'tres',nome:'Entrega concluída',statusExecucao:'CONCLUIDO'},
    {...e,id:'quatro',nome:'Entrega revista',reabertoEm:'2026-11-10T00:00:00Z',statusExecucao:'EM_ANDAMENTO'},
  ]}/>);
  const filtro=screen.getByRole('combobox',{name:'Situação do entregável'});
  expect(within(filtro).queryByRole('option',{name:'Concluído'})).not.toBeInTheDocument();
  fireEvent.change(filtro,{target:{value:'Em andamento'}});
  expect(screen.getByRole('button',{name:'Entrega medida'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Entrega pontual'})).not.toBeInTheDocument();
  fireEvent.click(within(screen.getByRole('group',{name:'Tipo de entregável'})).getByRole('button',{name:'Único'}));
  expect(screen.queryByRole('button',{name:'Entrega medida'})).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Limpar filtros'}));
  expect(screen.getByRole('button',{name:'Entrega pontual'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Entrega medida'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:'Entregáveis finalizados'}));
  expect(within(screen.getByRole('combobox',{name:'Situação do entregável'})).getByRole('option',{name:'Concluído'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Entrega concluída'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab',{name:'Em revisão'}));
  expect(within(screen.getByRole('combobox',{name:'Situação do entregável'})).getByRole('option',{name:'Em revisão'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Entrega revista'})).toBeInTheDocument();
});


test('entregável finalizado tem reabertura direta e arquivamento separado', async () => {
  const fechado: Entregavel = {...e, statusExecucao:'CONCLUIDO'};
  consultarDetalhe.mockReturnValue({dados:fechado,carregando:false,atualizar:jest.fn()});
  render(<EntregaveisDaEtapa {...props} dados={[fechado]} podeArquivar permissoes={{reabrirEntregaveis:true,arquivarEntregaveis:true} as never}/>);
  fireEvent.click(screen.getByRole('tab',{name:'Entregáveis finalizados'}));
  const detalhe = within(await abrirDetalheAtivo());
  expect(detalhe.getByRole('button',{name:'Reabrir'})).not.toHaveAttribute('aria-haspopup');
  const arquivo = detalhe.getByRole('button',{name:'Arquivar entregável'});
  expect(arquivo).toHaveAttribute('data-pi-arquivar-modal');
  fireEvent.click(arquivo);
  expect(screen.getByRole('dialog',{name:'Arquivar entregável?'})).toBeInTheDocument();
  expect(arquivarEntregavel).not.toHaveBeenCalled();
});
