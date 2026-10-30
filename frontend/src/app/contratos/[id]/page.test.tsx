import { render, screen } from '@testing-library/react';
import DetalheContratoPage from './page';
import { useConsulta } from '@/app/components/provedor-consultas';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato } from '@/hooks/use-contratos';
import type { Contrato } from '@/lib/contratos';

jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-real' }) }));
jest.mock('@/app/components/provedor-consultas', () => ({ useConsulta: jest.fn() }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({ useContrato: jest.fn(), useAcessoContrato: jest.fn() }));
jest.mock('../components/painel-etapas', () => ({
  PainelEtapas: ({ contratoId, podeGerenciar }: { contratoId: string; podeGerenciar: boolean }) =>
    <section data-testid="painel-etapas">{contratoId} {podeGerenciar ? 'gerencia' : 'consulta'}</section>,
}));
const perfil = useMeuPerfil as jest.Mock;
const contratoQuery = useContrato as jest.Mock;
const acessoQuery = useAcessoContrato as jest.Mock;
const contrato: Contrato = {
  id: 'contrato-real', numeroContrato: '01/2026', orgaoContratante: 'Secretaria', objeto: 'Atendimento técnico',
  processoAdministrativo: null, unidadeResponsavel: null, descricao: null, dataAssinatura: null,
  inicioVigencia: '2026-10-01', terminoVigencia: '2027-10-01', status: 'EM_EXECUCAO',
  responsavelInternoId: null, fiscalGestor: null, modoCalculo: 'SIMPLES', observacoes: null,
};
const retorno = (dados: unknown) => ({ dados, carregando: false, erro: undefined, atualizando: false });
beforeEach(() => {
  (useConsulta as jest.Mock).mockReturnValue(retorno(undefined));
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'GESTOR' }));
  contratoQuery.mockReturnValue(retorno(contrato));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true }));
});
test('HU06-03: integra Etapas uma vez ao detalhe real do Contrato sem cabeçalho adicional', () => {
  render(<DetalheContratoPage />);
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('contrato-real gerencia');
  expect(screen.getAllByTestId('painel-etapas')).toHaveLength(1);
  expect(screen.getByRole('heading', { name: '01/2026', level: 2 })).toBeInTheDocument();
});
test('HU06-03: Gestor sem edição e Colaborador nunca recebem controle de gestão', () => {
  acessoQuery.mockReturnValue(retorno({ podeEditar: false }));
  const view = render(<DetalheContratoPage />);
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta');
  perfil.mockReturnValue(retorno({ ativo: true, perfil: 'COLABORADOR' }));
  acessoQuery.mockReturnValue(retorno({ podeEditar: true }));
  view.rerender(<DetalheContratoPage />);
  expect(screen.getByTestId('painel-etapas')).toHaveTextContent('consulta');
});
test('HU06-03: sem acesso ao contrato não expõe o painel nem registros', () => {
  contratoQuery.mockReturnValue({ ...retorno(undefined), erro: new Error('Acesso negado') });
  render(<DetalheContratoPage />);
  expect(screen.queryByTestId('painel-etapas')).not.toBeInTheDocument();
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
