import { fireEvent, render, screen, within } from '@testing-library/react';
import DetalheContratoPage from './page';
import { useConsulta } from '@/app/components/provedor-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import type { Contrato } from '@/lib/contratos';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-real' }) }));
jest.mock('@/app/components/provedor-consultas', () => ({ useConsulta: jest.fn(), useRepositorioConsultas: () => ({ invalidar: jest.fn() }) }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({ useContrato: jest.fn(), useAcessoContrato: jest.fn(), useResponsaveis: jest.fn(), useMutacoesContrato: jest.fn() }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn(), useResumoDocumentalContrato: jest.fn() }));
jest.mock('../components/painel-documentos', () => ({
  PainelDocumentos: ({ contratoId, podeAnexar }: { contratoId: string; podeAnexar: boolean }) =>
    <section data-testid="painel-documentos">{contratoId} {podeAnexar ? 'anexa' : 'consulta'}</section>,
}));
jest.mock('../components/resumo-planejamento-contrato', () => ({ ResumoPlanejamentoContrato: () => <div data-testid="resumo-planejamento-contrato">Resumo</div> }));
jest.mock('../components/painel-etapas', () => ({
  PainelEtapas: ({ contratoId, podeGerenciar, permissoes }: { contratoId: string; podeGerenciar: boolean; permissoes?: { reordenarEtapas?: boolean } }) =>
    <section data-testid="painel-etapas">{contratoId} {podeGerenciar ? 'gerencia' : 'consulta'} {permissoes?.reordenarEtapas ? 'reordena' : 'sem reordenação'}</section>,
}));
const perfil = useMeuPerfil as jest.Mock;
const contratoQuery = useContrato as jest.Mock;
const acessoQuery = useAcessoContrato as jest.Mock;
const contrato: Contrato = {
  id: 'contrato-real', codigoPublico: '00427', numeroContrato: '01/2026', orgaoContratante: 'Secretaria', objeto: 'Atendimento técnico',
  processoAdministrativo: null, unidadeResponsavel: null, descricao: null, dataAssinatura: null,
  inicioVigencia: '2026-10-01', terminoVigencia: '2027-10-01', status: 'EM_EXECUCAO',
  responsavelInternoId: null, fiscalGestor: null, modoCalculo: 'SIMPLES', observacoes: null,
};
const retorno = (dados: unknown) => ({ dados, carregando: false, erro: undefined, atualizando: false });
beforeEach(() => {
  (useEtapas as jest.Mock).mockReturnValue(retorno([]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({}));
  (useConsulta as jest.Mock).mockReturnValue(retorno(undefined));
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'GESTOR' }));
  contratoQuery.mockReturnValue(retorno(contrato));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true }));
  (useResponsaveis as jest.Mock).mockReturnValue(retorno({ usuarios: [] }));
  (useMutacoesContrato as jest.Mock).mockReturnValue({ editar: jest.fn().mockResolvedValue(contrato) });
});
test('HU06-03: integra Etapas uma vez ao detalhe real do Contrato sem cabeçalho adicional', () => {
  render(<DetalheContratoPage />);
  expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));
  expect(screen.getByRole('tab', { name: 'Documentos' })).toHaveAttribute('aria-selected', 'true');
  // Ser Gestor com permissão de editar contrato não concede permissão documental automaticamente.
  expect(screen.getByTestId('painel-documentos')).toHaveTextContent('contrato-real consulta');
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('contrato-real gerencia');
  expect(screen.getAllByTestId('painel-etapas')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: '01/2026', level: 2 })).toBeInTheDocument();
});
test('HU06-03: Gestor sem edição e Colaborador nunca recebem controle de gestão', () => {
  acessoQuery.mockReturnValue(retorno({ podeEditar: false }));
  const view = render(<DetalheContratoPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta');
  fireEvent.click(screen.getByRole('tab', { name: 'Visão geral' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));
  expect(screen.getByTestId('painel-documentos')).toHaveTextContent('consulta');
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'COLABORADOR' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true }));
  (useResponsaveis as jest.Mock).mockReturnValue(retorno({ usuarios: [] }));
  (useMutacoesContrato as jest.Mock).mockReturnValue({ editar: jest.fn().mockResolvedValue(contrato) });
  view.rerender(<DetalheContratoPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta');
  fireEvent.click(screen.getByRole('tab', { name: 'Visão geral' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));
  expect(screen.getByTestId('painel-documentos')).toHaveTextContent('consulta');
});
test('Colaborador com permissão específica de reordenação recebe autorização de etapas sem editar cadastro do contrato', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'COLABORADOR' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: false, permissoes: { reordenarEtapas: true, editarContrato: false } }));
  render(<DetalheContratoPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta reordena');
  expect(screen.queryByRole('button', { name: 'Editar contrato' })).not.toBeInTheDocument();
});

test('HU06-03: sem acesso ao contrato não expõe o painel nem registros', () => {
  contratoQuery.mockReturnValue({ ...retorno(undefined), erro: new Error('Acesso negado') });
  render(<DetalheContratoPage />);
  expect(screen.queryByTestId('painel-etapas')).not.toBeInTheDocument();
  expect(screen.queryByTestId('painel-documentos')).not.toBeInTheDocument();
  expect(screen.getByText('Acesso negado')).toBeInTheDocument();
});

test('administrador consulta nome do responsavel sem revelar API administrativa a gestor', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, responsavelInternoId: 'funcionario-1' }));
  (useConsulta as jest.Mock).mockReturnValue(retorno({ nome: 'Maria Gestora', email: 'gestora@example.test' }));
  render(<DetalheContratoPage />);
  expect(screen.getByText('Maria Gestora — gestora@example.test')).toBeInTheDocument();
  expect(useConsulta).toHaveBeenCalledWith(
    ['contratos', 'responsavel', 'funcionario-1'], expect.any(Function),
    expect.objectContaining({ habilitada: true }),
  );
});
test('consulta administrativa desabilitada para Gestor no detalhe', () => {
  contratoQuery.mockReturnValue(retorno({ ...contrato, responsavelInternoId: 'funcionario-1' }));
  render(<DetalheContratoPage />);
  expect(useConsulta).toHaveBeenCalledWith(
    ['contratos', 'responsavel', 'funcionario-1'], expect.any(Function),
    expect.objectContaining({ habilitada: false }),
  );
});

test('ADMIN mantém ações no cabeçalho e exige confirmação ao arquivar contrato ativo', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  render(<DetalheContratoPage />);
  expect(screen.getByRole('button', { name: 'Arquivar contrato' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar contrato' }));
  expect(screen.getByRole('dialog', { name: 'Arquivar contrato?' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog', { name: 'Arquivar contrato?' })).not.toBeInTheDocument();
  // Regressão preservada do hotfix posterior: arquivar nunca dentro da edição.
  fireEvent.click(screen.getByRole('button', { name: 'Editar contrato' }));
  const modal = screen.getByRole('dialog', { name: /Editar contrato/ });
  expect(within(modal).queryByRole('button', { name: 'Arquivar contrato' })).not.toBeInTheDocument();
});
test('contrato arquivado desabilita edição e arquivamento; reativação é na lista', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, arquivadoEm: '2026-11-03T15:00:00Z' }));
  render(<DetalheContratoPage />);
  expect(screen.queryByRole('button', { name: 'Reativar contrato' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Editar contrato' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Arquivar contrato' })).toBeDisabled();
});
test('ADMIN pode reabrir documentalmente completo, mas nunca arquivar sem reabertura', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  const etapa = { id:'etapa-1', contratoId:'contrato-real', arquivadoEm:null, reabertoEm:null };
  const entregavel = { id:'entregavel-1', contratoId:'contrato-real', etapaId:'etapa-1', arquivadoEm:null, reabertoEm:null };
  (useEtapas as jest.Mock).mockReturnValue(retorno([etapa]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([entregavel]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({ 'entregavel-1': {total: 1, verificadasTotal: 1} }));
  render(<DetalheContratoPage />);
  expect(screen.getByRole('button', {name:'Reabrir contrato concluído'})).toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Arquivar contrato'})).not.toBeInTheDocument();
  expect(screen.getByRole('button', {name:'Editar contrato'})).toBeDisabled();
});
test('modal de edição conserva contrato sem navegar e retorna ao card com Escape', () => {
  render(<DetalheContratoPage />);
  const editar = screen.getByRole('button', { name: 'Editar contrato' });
  editar.focus(); fireEvent.click(editar);
  const modal = screen.getByRole('dialog', { name: /Editar contrato/ });
  expect(modal).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Editar dados do contrato' })).toBeInTheDocument();
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /Editar contrato/ })).not.toBeInTheDocument();
  expect(editar).toHaveFocus();
});

test('informações permanecem em largura total após planejamento, sem painel lateral redundante', () => {
  render(<DetalheContratoPage />);
  const planejamento = screen.getByRole('region', { name: 'Planejamento do contrato' });
  const informacoes = screen.getByRole('region', { name: 'Informações do contrato' });
  const identificacao = screen.getByRole('region', { name: 'Identificação do contrato' });
  const descricao = screen.getByRole('region', { name: 'Descrição e observações' });
  const documentos = screen.getByTestId('painel-documentos');
  expect(identificacao).toHaveTextContent('Atendimento técnico');
  expect(informacoes).toContainElement(identificacao);
  expect(planejamento.compareDocumentPosition(informacoes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(informacoes.compareDocumentPosition(descricao) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(descricao.compareDocumentPosition(documentos) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(informacoes).getByText('Vigência e execução')).toBeInTheDocument();
  expect(within(informacoes).getByText('Vigência e execução').closest('details')).toHaveAttribute('open');
  expect(within(informacoes).getByText('Responsáveis').closest('details')).toHaveAttribute('open');
  expect(within(informacoes).getByText('Responsáveis')).toBeInTheDocument();
  expect(screen.queryByRole('complementary', { name: 'Informações do contrato' })).not.toBeInTheDocument();
});
