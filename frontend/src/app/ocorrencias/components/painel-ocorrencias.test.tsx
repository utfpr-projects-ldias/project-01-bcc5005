import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { PainelOcorrencias } from './painel-ocorrencias';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { useProgresso } from '@/hooks/use-progresso';
import { consultarAtividade } from '@/hooks/use-atividades';

jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn() }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-ocorrencias', () => ({ useOcorrencias: jest.fn() }));
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: jest.fn() }));
jest.mock('@/hooks/use-atividades', () => ({ consultarAtividade: jest.fn() }));
jest.mock('@/app/contratos/components/modal-detalhe-entregavel', () => ({ ModalDetalheEntregavel: ({ entregavelId }: { entregavelId: string }) => <section role="dialog" aria-label="Planejamento do entregável">{entregavelId}</section> }));
jest.mock('@/app/contratos/components/modal-etapa', () => ({ ModalEtapa: ({ titulo, children, estadoContextual, acoes }: { titulo: string; children: ReactNode; estadoContextual?: string; acoes?: ReactNode }) => <section role="dialog" aria-label={titulo} data-estado={estadoContextual}><header>{acoes}</header>{children}</section> }));

const ocorrencias = useOcorrencias as jest.Mock;
const ocorrencia = { id: 'oc-1', contratoId: 'c-1', entregavelId: 'e-1', titulo: 'Medição de outubro',
  origem: 'MANUAL_QUANTITATIVA', periodoInicio: '2026-10-01', periodoFim: '2026-10-31', dataPrevista: '2026-11-05',
  dataRealizada: null, status: 'EM_ANDAMENTO', quantidadeRealizada: null, observacoes: null };

beforeEach(() => {
  jest.clearAllMocks();
  (useProgresso as jest.Mock).mockReturnValue({ progresso: { entregaveis: [] }, usarOcorrencias: jest.fn(), loading: false });
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { podeEditar: true, permissoes: { criarOcorrencias: true, editarOcorrencias: true, concluirOcorrencias: true, reabrirOcorrencias: true, configurarAgendaOcorrencias: true } }, erro: null });
  (useMeuPerfil as jest.Mock).mockReturnValue({ dados: { perfil: 'GESTOR', ativo: true } });
  (useEtapas as jest.Mock).mockReturnValue({ dados: [{ id: 'etapa-1', status: 'PLANEJADA', arquivadoEm: null }] });
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'QUANTITATIVO', nome: 'Medições', statusExecucao: 'EM_EXECUCAO', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [ocorrencia], loading: false, erro: null, criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
});

test('agenda vinculada usa cores do status real e abre detalhes pelo cartão', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  expect(screen.getByRole('heading', { name: 'Ocorrências' })).toBeInTheDocument();
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-[#65813b]/65');
  expect(card.className).not.toContain('teal');
  expect(card.className).not.toContain('violet');
  fireEvent.click(card);
  expect(screen.getByRole('dialog', { name: 'Medição de outubro' })).toHaveAttribute('data-estado', 'andamento');
});

test('situação não iniciada mantém cores neutras sem confundir com conclusão', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'NAO_INICIADO' }], loading: false, erro: null,
    criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-neutral-400/50');
  expect(card.className).not.toContain('border-violet');
  expect(screen.getByText('Não iniciada')).toBeInTheDocument();
});

test('somente a ocorrência realmente concluída recebe o estilo violeta', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'CONCLUIDO' }], loading: false, erro: null,
    criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Finalizadas' }));
  const card = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(card).toHaveClass('border-violet-400/45');
  expect(screen.getByText('Concluída')).toBeInTheDocument();
});

test('painel somente leitura preserva consulta e não permite cadastro nem edição', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" somenteLeitura />);
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
});

test('filtro de situação usa enum do backend, não valores antigos de frontend', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('button', { name: /Mais filtros/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar situação das ocorrências' }), { target: { value: 'NAO_INICIADO' } });
  expect(screen.queryByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Nenhuma ocorrência nesta situação/)).toBeInTheDocument();
});


test('contrato em revisão colore painel e cadastro; filho não iniciado tem estado neutro próprio', () => {
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'QUANTITATIVO', nome: 'Medições', statusExecucao: 'NAO_INICIADO', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'NAO_INICIADO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" estadoContextual="revisao" embutido />);
  expect(screen.getByRole('region', { name: 'Ocorrências do contrato' })).toHaveAttribute('data-tec08-estado', 'revisao');
  const cadastrar = screen.getByRole('button', { name: /Nova ocorrência/ });
  expect(cadastrar).toHaveAttribute('data-pi-acao', 'primaria');
  fireEvent.click(cadastrar);
  expect(screen.getByRole('dialog', { name: 'Nova ocorrência' })).toHaveAttribute('data-estado', 'nao-iniciado');
});

test('ocorrência concluída mantém contexto violeta, impede edição direta e permite reabertura autorizada', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'CONCLUIDO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" estadoContextual="revisao" embutido />);
  fireEvent.click(screen.getByRole('tab', { name: 'Finalizadas' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.getByRole('dialog', { name: ocorrencia.titulo })).toHaveAttribute('data-estado', 'concluido');
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Reabrir ocorrência/ })).toBeInTheDocument();
});

test('entregável de etapa concluída não permite gerar ou cadastrar; explica o impedimento', () => {
  (useEtapas as jest.Mock).mockReturnValue({ dados: [{ id: 'etapa-1', status: 'CONCLUIDA', arquivadoEm: null }] });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
});

test('gestor com edição genérica mas sem permissão efetiva de criar/editar não recebe ações', () => {
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { podeEditar: true, permissoes: { criarOcorrencias: false, editarOcorrencias: false, concluirOcorrencias: false, reabrirOcorrencias: false } }, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.queryByRole('button', { name: /Nova ocorrência/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
});

test('quantidade declarada exige conciliação explícita antes de registrar ocorrências', async () => {
  const usarOcorrencias = jest.fn().mockResolvedValue(undefined);
  (useProgresso as jest.Mock).mockReturnValue({ progresso: { entregaveis: [{ entregavelId: 'e-1', tipo: 'QUANTITATIVO', fonte: 'DECLARADO', realizado: '12.000' }] }, usarOcorrencias });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('button', { name: /Nova ocorrência/ }));
  expect(screen.queryByRole('combobox', { name: /^Entregável\s*\*/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Este entregável já possui/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Registrar ocorrência' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Passar a registrar por ocorrências' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar conciliação' }));
  await waitFor(() => expect(usarOcorrencias).toHaveBeenCalledWith('e-1'));
  await waitFor(() => expect(screen.getByText(/Fonte alterada/)).toBeInTheDocument());
});


test('recorrente diária usa calendário automaticamente, sem escolha lista/calendário', () => {
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'RECORRENTE', periodicidade: 'DIARIA', nome: 'Rotina diária', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, origem: 'RECORRENTE', periodoInicio: '2026-12-01', periodoFim: '2026-12-01', dataPrevista: '2026-12-01', status: 'CONCLUIDO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.getByLabelText(/Calendário diaria de ocorrências/)).toHaveAttribute('data-periodicidade', 'DIARIA');
  expect(screen.getByRole('button', { name: /Abrir ocorrência Medição de outubro/ })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: /Lista/ })).not.toBeInTheDocument();
  expect(screen.getByText(/Todos os períodos concluídos/)).toBeInTheDocument();
});

test('recorrente sem agenda oferece geração manual com confirmação explícita', async () => {
  const gerarOcorrenciasRecorrentes = jest.fn().mockResolvedValue(6);
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'RECORRENTE', periodicidade: 'DIARIA', inicioPrevisto: '2026-12-01', terminoPrevisto: '2026-12-06', nome: 'Rotina', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [], loading: false, erro: null, gerarOcorrenciasRecorrentes, atualizar: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  const gerar = screen.getByRole('button', { name: /Gerar ocorrências/i });
  expect(gerar).toBeInTheDocument();
  expect(gerarOcorrenciasRecorrentes).not.toHaveBeenCalled();
  fireEvent.click(gerar);
  expect(screen.getByRole('dialog', { name: 'Gerar ocorrências recorrentes' })).toBeInTheDocument();
  expect(gerarOcorrenciasRecorrentes).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Confirmar geração/i }));
  await waitFor(() => expect(gerarOcorrenciasRecorrentes).toHaveBeenCalledWith('e-1'));
});
test('atividade vinculada abre detalhe contextual por API sem navegar para outra página', async () => {
  ocorrencias.mockReturnValue({ ocorrencias: [ocorrencia], loading: false, erro: null,
    consultarDetalhe: jest.fn().mockResolvedValue({ ...ocorrencia, atividades: [{ id: 'a-1', titulo: 'Conferência', status: 'REGISTRADA' }] }) });
  (consultarAtividade as jest.Mock).mockResolvedValue({ id: 'a-1', contratoId: 'c-1', titulo: 'Conferência', descricao: 'Descrição da atividade', status: 'REGISTRADA', dataHora: '2026-11-11T10:00:00Z', tipo: 'INSPECAO', responsavel: 'Equipe', entregaveis: [], observacoes: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ }));
  const botao = await screen.findByRole('button', { name: /Conferência/ });
  fireEvent.click(botao);
  await waitFor(() => expect(screen.getByText('Descrição da atividade')).toBeInTheDocument());
  expect(consultarAtividade).toHaveBeenCalledWith('c-1', 'a-1');
  expect(screen.queryByRole('link', { name: 'Conferência' })).not.toBeInTheDocument();
});


test('na página global, lista as ocorrências antes de selecionar o filtro de entregável', () => {
  render(<PainelOcorrencias contratoId="c-1" />);
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Mais filtros/ }));
  fireEvent.focus(screen.getByRole('combobox', { name: 'Filtrar entregável das ocorrências' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Filtrar entregável das ocorrências' }), { target: { value: 'Medições' } });
  fireEvent.click(screen.getByRole('option', { name: 'Medições' }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }));
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ })).toBeInTheDocument();
});


test('meta quantitativa exibe o executado sem confundi-lo com a quantidade aprovada', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, metaQuantidade: '20.000', quantidadeExecutada: '10.000', quantidadeAprovada: null, status: 'EM_ANDAMENTO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.getByText(/Executado: 10.000 \/ 20.000 unidades/)).toBeInTheDocument();
});

test('ocorrência pendente não admite edição e exige a permissão de concluir', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, metaQuantidade: '20.000', quantidadeExecutada: '20.000', status: 'PENDENTE_CONCLUSAO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pendentes de conclusão' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.getByRole('button', { name: /Aprovar/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar ocorrência' })).not.toBeInTheDocument();
});


test('contexto do entregável não repete filtros globais e apresenta busca por título ou observações', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  expect(screen.queryByRole('combobox', { name: 'Filtrar etapa das ocorrências' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Filtrar entregável das ocorrências' })).not.toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Campo da pesquisa de ocorrências' })).toHaveValue('titulo');
  fireEvent.change(screen.getByRole('combobox', { name: 'Campo da pesquisa de ocorrências' }), { target: { value: 'observacoes' } });
  fireEvent.change(screen.getByRole('searchbox', { name: 'Pesquisar ocorrências' }), { target: { value: 'sem correspondência' } });
  expect(screen.queryByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ })).not.toBeInTheDocument();
});

test('falha da API da agenda não permite gerar períodos sem confirmação do estado', () => {
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'RECORRENTE', periodicidade: 'DIARIA', nome: 'Rotina', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [], loading: false, erro: 'Falha HTTP 500' });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  expect(screen.queryByRole('button', { name: /Gerar ocorrências/i })).not.toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Gerar ocorrências recorrentes' })).not.toBeInTheDocument();
});
test('cadastro dentro do entregável não repete a seleção e usa meta textual sem setas nativas', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  fireEvent.click(screen.getByRole('button', { name: /Nova ocorrência/ }));
  expect(screen.queryByRole('combobox', { name: /^Entregável/ })).not.toBeInTheDocument();
  expect(screen.getByRole('textbox', { name: /Meta a executar/ })).toHaveAttribute('inputmode', 'decimal');
  expect(screen.getByText('Período da ocorrência (opcional)')).toBeInTheDocument();
});


test('ocorrência pendente apresenta cartão violeta com etiqueta amarela e aprovação somente no cabeçalho do modal', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'PENDENTE_CONCLUSAO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pendentes de conclusão' }));
  const cartao = screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ });
  expect(cartao).toHaveClass('border-violet-400/55');
  expect(cartao.querySelectorAll('span')[2]).toHaveClass('bg-amber-500/10');
  expect(screen.queryByRole('button', { name: /Editar ocorrência Medição de outubro/ })).not.toBeInTheDocument();
  fireEvent.click(cartao);
  const modal = screen.getByRole('dialog', { name: 'Medição de outubro' });
  expect(modal.querySelector('header')).toContainElement(screen.getByRole('button', { name: /Aprovar/ }));
});

test('editar ocorrência fica somente no cabeçalho do detalhe', () => {
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.queryByRole('button', { name: 'Editar ocorrência Medição de outubro' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência Medição de outubro/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
  expect(screen.getByRole('dialog', { name: 'Medição de outubro' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
});

test('reabertura exige justificativa em diálogo separado e não coloca textarea no detalhe', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'CONCLUIDO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Finalizadas' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('textbox', { name: /Justificativa/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Reabrir ocorrência/ }));
  const modal = screen.getByRole('dialog', { name: 'Reabrir ocorrência' });
  expect(modal).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Confirmar reabertura' })).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox', { name: /Justificativa/ }), { target: { value: 'Reabertura necessária por divergência no serviço.' } });
  expect(screen.getByRole('button', { name: 'Confirmar reabertura' })).toBeEnabled();
});


test('replanejamento de recorrente ativo abre o formulário direto, sem modal de confirmação intermediário', () => {
  (useEntregaveis as jest.Mock).mockReturnValue({ dados: [{ id: 'e-1', etapaId: 'etapa-1', tipo: 'RECORRENTE', nome: 'Rotina diária', periodicidade: 'DIARIA', terminoPrevisto: '2026-12-30', statusExecucao: 'EM_ANDAMENTO', arquivadoEm: null }] });
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, origem: 'RECORRENTE', status: 'NAO_INICIADO', periodoInicio: '2026-12-01', periodoFim: '2026-12-01' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" embutido />);
  fireEvent.click(screen.getByRole('button', { name: /Configurar ocorrências/ }));
  expect(screen.getByRole('dialog', { name: 'Replanejar ocorrências' })).toHaveAttribute('data-estado', 'andamento');
  expect(screen.queryByRole('dialog', { name: 'Agenda recorrente' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Analisar alterações' })).toBeInTheDocument();
});


test('Finalizadas reúne ocorrência concluída e encerrada sem apagar a distinção de cor', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [
    { ...ocorrencia, id: 'concluida', titulo: 'Execução aprovada', status: 'CONCLUIDO' },
    { ...ocorrencia, id: 'encerrada', titulo: 'Execução não integral', status: 'ENCERRADA' },
  ], loading: false, erro: null, criarOcorrenciaManual: jest.fn(), editarOcorrencia: jest.fn() });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  expect(screen.queryByRole('button', { name: /Ver detalhes da ocorrência Execução aprovada/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Finalizadas' }));
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência Execução aprovada/ })).toHaveClass('border-violet-400/45');
  expect(screen.getByRole('button', { name: /Ver detalhes da ocorrência Execução não integral/ })).toHaveClass('border-purple-500/65');
  expect(screen.getByText('Encerrada')).toBeInTheDocument();
  expect(screen.getByText('Concluída')).toBeInTheDocument();
});


test('solicitação de encerramento pendente permite Aprovar e Cancelar no cabeçalho conforme permissão', () => {
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'PENDENTE_ENCERRAMENTO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pendentes de conclusão' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  const modal = screen.getByRole('dialog', { name: ocorrencia.titulo });
  expect(within(modal.querySelector('header') as HTMLElement).getByRole('button', { name: /Aprovar/ })).toBeEnabled();
  expect(within(modal.querySelector('header') as HTMLElement).getByRole('button', { name: /Cancelar/ })).toBeEnabled();
});

test('sem permissão de reabrir não oferece cancelar solicitação', () => {
  (useAcessoContrato as jest.Mock).mockReturnValue({ dados: { podeEditar: true, permissoes: {
    editarOcorrencias: false, concluirOcorrencias: true, reabrirOcorrencias: false,
  } }, erro: null });
  ocorrencias.mockReturnValue({ ocorrencias: [{ ...ocorrencia, status: 'PENDENTE_ENCERRAMENTO' }], loading: false, erro: null });
  render(<PainelOcorrencias contratoId="c-1" entregavelIdInicial="e-1" />);
  fireEvent.click(screen.getByRole('tab', { name: 'Pendentes de conclusão' }));
  fireEvent.click(screen.getByRole('button', { name: /Ver detalhes da ocorrência/ }));
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Aprovar/ })).toBeEnabled();
});
