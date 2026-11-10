import { fireEvent, render, screen, within } from '@testing-library/react';
import DetalheContratoPage from './page';
import { useConsulta } from '@/app/components/provedor-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato, usePendentesConclusao } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';
import type { Contrato } from '@/lib/contratos';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-real' }) }));
jest.mock('@/app/components/provedor-consultas', () => ({ useConsulta: jest.fn(), useRepositorioConsultas: () => ({ invalidar: jest.fn() }), useRepositorioConsultasOpcional: () => null }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({ useContrato: jest.fn(), useAcessoContrato: jest.fn(), useResponsaveis: jest.fn(), useMutacoesContrato: jest.fn(), usePendentesConclusao: jest.fn() }));
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
  (usePendentesConclusao as jest.Mock).mockReturnValue(retorno([]));
  (useEtapas as jest.Mock).mockReturnValue(retorno([]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({}));
  (useConsulta as jest.Mock).mockReturnValue(retorno(undefined));
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'GESTOR' }));
  contratoQuery.mockReturnValue(retorno(contrato));
  acessoQuery.mockReturnValue(retorno({ podeEditar: false, permissoes: { editarContrato: false } }));
  (useResponsaveis as jest.Mock).mockReturnValue(retorno({ usuarios: [] }));
  (useMutacoesContrato as jest.Mock).mockReturnValue({ editar: jest.fn().mockResolvedValue(contrato) });
});
test('HU06-03: integra Etapas uma vez ao detalhe real do Contrato sem cabeçalho adicional', () => {
  render(<DetalheContratoPage />);
  expect(screen.getByRole('tab', { name: 'Visão geral' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));
  expect(screen.getByRole('tab', { name: 'Documentos' })).toHaveAttribute('aria-selected', 'true');
  // Ser Gestor sem permissao de editar cadastro ou documentos nao libera gestao.
  expect(screen.getByTestId('painel-documentos')).toHaveTextContent('contrato-real consulta');
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('contrato-real consulta');
  expect(screen.getAllByTestId('painel-etapas')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: '01/2026', level: 2 })).toBeInTheDocument();
});
test('HU06-03: gestão depende da permissão individual, inclusive para Colaborador', () => {
  acessoQuery.mockReturnValue(retorno({ podeEditar: false }));
  const view = render(<DetalheContratoPage />);
  fireEvent.click(screen.getByRole('tab', { name: 'Etapas' }));
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta');
  fireEvent.click(screen.getByRole('tab', { name: 'Visão geral' }));
  fireEvent.click(screen.getByRole('tab', { name: 'Documentos' }));
  expect(screen.getByTestId('painel-documentos')).toHaveTextContent('consulta');
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'COLABORADOR' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: false, permissoes: { editarContrato: false } }));
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
  acessoQuery.mockReturnValue(retorno({ podeEditar: true, permissoes: { editarContrato: true } }));
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
test('ADMIN em revisão encontra Arquivar e Editar juntos no cabeçalho, sem Encerrar avulso', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true, permissoes: { editarContrato: true } }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, reabertoEm: '2026-11-07T14:00:00Z' }));
  render(<DetalheContratoPage />);
  const barra = screen.getByTestId('barra-navegacao-contrato');
  expect(within(barra).getByRole('button', { name: 'Arquivar contrato' })).toBeEnabled();
  expect(within(barra).getByRole('button', { name: 'Editar contrato' })).toBeEnabled();
  expect(within(barra).queryByRole('button', { name: 'Encerrar antecipadamente' })).not.toBeInTheDocument();
});

test('contrato arquivado não oferece edição ou arquivamento no detalhe; reativação é na carteira', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, arquivadoEm: '2026-11-03T15:00:00Z' }));
  render(<DetalheContratoPage />);
  expect(screen.queryByRole('button', { name: 'Reativar contrato' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar contrato' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Arquivar contrato' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Alterar situação autorizada' })).not.toBeInTheDocument();
});
test('ADMIN com documentação completa vê Pendente de conclusão e ação autorizada', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  const etapa = { id:'etapa-1', contratoId:'contrato-real', status:'CONCLUIDA', arquivadoEm:null, reabertoEm:null };
  const entregavel = { id:'entregavel-1', contratoId:'contrato-real', etapaId:'etapa-1', statusExecucao:'CONCLUIDO', evidenciasEsperadas:[{id:'e-1', arquivadoEm:null}], arquivadoEm:null, reabertoEm:null };
  (useEtapas as jest.Mock).mockReturnValue(retorno([etapa]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([entregavel]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({ 'entregavel-1': {total: 1, verificadasTotal: 1} }));
  render(<DetalheContratoPage />);
  expect(screen.getByRole('button', {name:'Aprovar conclusão do contrato'})).toBeDisabled();
  expect(screen.getByRole('button', {name:'Não aprovar conclusão'})).toBeEnabled();
  const faixaDecisoes = screen.getByTestId('barra-navegacao-contrato');
  const abas = screen.getByRole('tablist', { name: 'Seções do contrato' });
  const naoAprovar = screen.getByRole('button', { name: 'Não aprovar conclusão' });
  expect(faixaDecisoes).toContainElement(abas);
  expect(faixaDecisoes).toContainElement(naoAprovar);
  expect(abas).not.toContainElement(naoAprovar);
  expect(screen.getAllByText(/Pendente de conclusão/).length).toBeGreaterThan(0);
  expect(screen.queryByRole('button', {name:'Reabrir contrato concluído'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Arquivar contrato'})).not.toBeInTheDocument();
  // Em pendência, aprovação e devolução para revisão são os fluxos disponíveis;
  // a edição de status não pode contornar a decisão do contrato.
  expect(screen.queryByRole('button', {name:'Editar contrato'})).not.toBeInTheDocument();
  expect(screen.queryByRole('button', {name:'Alterar situação autorizada'})).not.toBeInTheDocument();
});
test('modal de edição conserva contrato sem navegar e retorna ao card com Escape', () => {
  acessoQuery.mockReturnValue(retorno({ podeEditar: true, permissoes: { editarContrato: true } }));
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

test('decisão pendente exige PDF principal verificado e permite aprovação ou devolução autorizadas', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, reabertoEm: null }));
  (useEtapas as jest.Mock).mockReturnValue(retorno([{ id: 'etapa-1', contratoId: 'contrato-real', status: 'CONCLUIDA', reabertoEm: null }]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([{ id:'item-1', contratoId:'contrato-real', etapaId:'etapa-1', statusExecucao:'CONCLUIDO', reabertoEm:null, evidenciasEsperadas:[{id:'ev-1'}] }]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({ 'item-1': { total:1, verificadasTotal:1 } }));
  (useConsulta as jest.Mock).mockReturnValue(retorno({ itens: [{ categoria:'CONTRATO_PRINCIPAL', verificadoEm:'2026-11-07T04:00:00Z', reabertoEm:null, arquivadoEm:null }] }));
  render(<DetalheContratoPage />);
  expect(screen.getByRole('button', { name:'Aprovar conclusão do contrato' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name:'Não aprovar conclusão' }));
  const dialogoDevolucao = screen.getByRole('dialog', { name:'Não aprovar a conclusão do contrato?' });
  expect(dialogoDevolucao).toBeInTheDocument();
  expect(within(dialogoDevolucao).getByRole('button', { name:'Cancelar' }).className).not.toContain('bg-red-600');
  expect(within(dialogoDevolucao).getByRole('button', { name:'Não aprovar e devolver para revisão' })).toHaveClass('bg-red-600');
  fireEvent.click(within(dialogoDevolucao).getByRole('button', { name:'Cancelar' }));
  expect(screen.queryByRole('dialog', { name:'Não aprovar a conclusão do contrato?' })).not.toBeInTheDocument();
});


test('TEC08-03: aprovação bloqueada orienta claramente anexar o PDF e abre a aba correta', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  (useEtapas as jest.Mock).mockReturnValue(retorno([{ id: 'etapa-qa', contratoId: 'contrato-real', status: 'CONCLUIDA', reabertoEm: null }]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([{ id: 'entregavel-qa', contratoId: 'contrato-real', etapaId: 'etapa-qa', statusExecucao: 'CONCLUIDO', reabertoEm: null, evidenciasEsperadas: [{ id: 'e-qa' }] }]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({ 'entregavel-qa': { total: 1, verificadasTotal: 1 } }));
  (useConsulta as jest.Mock).mockReturnValue(retorno({ itens: [], total: 0 }));
  render(<DetalheContratoPage />);
  const aprovar = screen.getByRole('button', { name: 'Aprovar conclusão do contrato' });
  expect(aprovar).toBeDisabled();
  expect(aprovar).toHaveAttribute('aria-describedby', 'aviso-pdf-principal-conclusao');
  expect(aprovar).toHaveClass('text-green-200');
  const aviso = screen.getByTestId('aviso-pdf-principal-conclusao');
  expect(aviso).toHaveTextContent('Falta anexar e verificar o PDF principal');
  fireEvent.click(within(aviso).getByRole('button', { name: 'Ir para Documentos' }));
  expect(screen.getByRole('tab', { name: 'Documentos' })).toHaveAttribute('aria-selected', 'true');
});

test('TEC08-03: PDF anexado mas não verificado continua bloqueando a aprovação', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  (useEtapas as jest.Mock).mockReturnValue(retorno([{ id: 'etapa-qa', contratoId: 'contrato-real', status: 'CONCLUIDA', reabertoEm: null }]));
  (useEntregaveis as jest.Mock).mockReturnValue(retorno([{ id: 'entregavel-qa', contratoId: 'contrato-real', etapaId: 'etapa-qa', statusExecucao: 'CONCLUIDO', reabertoEm: null, evidenciasEsperadas: [{ id: 'e-qa' }] }]));
  (useResumoDocumentalContrato as jest.Mock).mockReturnValue(retorno({ 'entregavel-qa': { total: 1, verificadasTotal: 1 } }));
  (useConsulta as jest.Mock).mockReturnValue(retorno({ itens: [{ categoria: 'CONTRATO_PRINCIPAL', verificadoEm: null, reabertoEm: null, arquivadoEm: null }] }));
  render(<DetalheContratoPage />);
  expect(screen.getByRole('button', { name: 'Aprovar conclusão do contrato' })).toBeDisabled();
  expect(screen.getByTestId('aviso-pdf-principal-conclusao')).toHaveTextContent('Verifique o PDF principal');
});

test('TEC08-03: no contrato suspenso, Retomar substitui Editar/Arquivar no topo', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, status: 'SUSPENSO' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true, permissoes: { retomarContrato: true, editarContrato: true } }));
  render(<DetalheContratoPage />);
  const faixa = screen.getByTestId('barra-navegacao-contrato');
  expect(within(faixa).getByRole('button', { name: 'Retomar contrato suspenso' })).toBeEnabled();
  expect(within(faixa).queryByRole('button', { name: 'Editar contrato' })).not.toBeInTheDocument();
  expect(within(faixa).queryByRole('button', { name: 'Arquivar contrato' })).not.toBeInTheDocument();
});

test('TEC08-03: reabertura substitui ações bloqueadas do contrato concluído', () => {
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'ADMINISTRADOR' }));
  contratoQuery.mockReturnValue(retorno({ ...contrato, status: 'CONCLUIDO', reabertoEm: null }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true, permissoes: { reabrirContrato: true, editarContrato: true } }));
  render(<DetalheContratoPage />);
  const faixa = screen.getByTestId('barra-navegacao-contrato');
  expect(within(faixa).getByRole('button', { name: 'Reabrir contrato concluído' })).toBeInTheDocument();
  expect(within(faixa).queryByRole('button', { name: 'Editar contrato' })).not.toBeInTheDocument();
  expect(within(faixa).queryByRole('button', { name: 'Arquivar contrato' })).not.toBeInTheDocument();
});


test('contrato encerrado informa ao design system estado cinza nas abas e ações contextuais', () => {
  contratoQuery.mockReturnValue(retorno({ ...contrato, status: 'ENCERRADO', reabertoEm: null }));
  render(<DetalheContratoPage />);
  const aba = screen.getByRole('tab', { name: 'Documentos' });
  fireEvent.click(aba);
  expect(aba).toHaveAttribute('aria-selected', 'true');
  expect(aba.closest('.contrato-detalhe-documental')).toHaveAttribute('data-tec08-estado', 'encerrado');
});
