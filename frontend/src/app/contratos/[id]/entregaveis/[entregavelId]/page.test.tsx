jest.mock('@/app/contratos/components/painel-comprovacao-evidencia', () => ({
  PainelComprovacaoEvidencia: ({ esperadaId }: { esperadaId: string }) => <p data-testid="comprovacao-esperada">Enviar comprovante · Aguardando envio · {esperadaId}</p>,
}));
import { fireEvent, render, screen } from '@testing-library/react';
import DetalheEntregavelPage from './page';
import { ConteudoEntregavel } from '@/app/contratos/components/conteudo-entregavel';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { consultarHistoricoEntregavel, type Entregavel } from '@/lib/entregaveis';
import { consultarEvidencia } from '@/lib/comprovantes';
jest.mock('@/lib/entregaveis', () => ({ ...jest.requireActual('@/lib/entregaveis'), consultarHistoricoEntregavel: jest.fn() }));
// O componente busca a situação de cada evidência. O teste não depende de HTTP real.
jest.mock('@/lib/comprovantes', () => ({ ...jest.requireActual('@/lib/comprovantes'), consultarEvidencia: jest.fn() }));
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-a', entregavelId: 'e-1' }) }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn() }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: jest.fn() }));
const historico = consultarHistoricoEntregavel as jest.Mock;
const evidenciaConsultada = consultarEvidencia as jest.Mock;
const perfil = useMeuPerfil as jest.Mock;
const detalhe = useDetalheEntregavel as jest.Mock;
const acesso = useAcessoContrato as jest.Mock;
const item: Entregavel = {
  id: 'e-1', contratoId: 'contrato-a', etapaId: 'etapa-a', nome: 'Manutenção mensal', codigo: 'M-01', descricao: 'Execução técnica', tipo: 'RECORRENTE',
  responsavelId: 'pessoa-1', inicioPrevisto: '2026-10-01', terminoPrevisto: '2026-12-31',
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, periodicidade: 'MENSAL',
  configuracaoPeriodicidade: { versao: 1 }, peso: '25.0000', criterioConclusao: 'Entrega dos relatórios assinados',
  statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, observacoes: null,
  evidenciasEsperadas: [{ id: 'prova-1', tipoEvidencia: 'Relatório', descricao: 'PDF previsto', obrigatoria: true },
    { id: 'prova-2', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false }],
};
const estado = (dados: unknown, extra = {}) => ({ dados, erro: undefined, carregando: false, atualizar: jest.fn(), ...extra });
beforeEach(() => {
  historico.mockResolvedValue([]);
  evidenciaConsultada.mockImplementation((contratoId: string, entregavelId: string, id: string) =>
    Promise.resolve({ id, contratoId, entregavelId, status: 'SEM_ENVIO', versoes: [] }));
  perfil.mockReturnValue(estado({ ativo: true }));
  detalhe.mockReturnValue(estado(item));
  acesso.mockReturnValue(estado({ podeEditar: false }));
});
test('visao separa planejamento, criterio proximo de execucao e checklist esperado', async () => {
  render(<ConteudoEntregavel item={item} />);
  expect(screen.getByRole('heading', { name: 'Identificação e planejamento' })).toBeInTheDocument();
  expect(screen.getByText('Execução técnica')).toBeInTheDocument();
  expect(screen.getByText('Entrega dos relatórios assinados')).toBeInTheDocument();
  expect(screen.getByText('Mensal')).toBeInTheDocument();
  expect(screen.getByText('31/12/2026')).toBeInTheDocument();
  expect(await screen.findByRole('list', { name: 'Evidências obrigatórias' })).toHaveTextContent('Relatório');
  expect(screen.getByRole('list', { name: 'Evidências opcionais' })).toHaveTextContent('Foto');
  // A prova não é usada como percentual de execução física: o critério permanece identificado no cadastro.
  expect(screen.getByText('Critério operacional')).toBeInTheDocument();
  expect(screen.queryByText('Comprovado')).not.toBeInTheDocument();
});
test('detalhe usa IDs da rota e valida correspondencia com contrato', () => {
  render(<DetalheEntregavelPage />);
  expect(detalhe).toHaveBeenCalledWith('contrato-a', 'e-1', true);
  expect(screen.getByRole('heading', { name: 'Manutenção mensal' })).toBeInTheDocument();
});
test('erro 403 nao revela dados mesmo se houver cache', () => {
  detalhe.mockReturnValue(estado(item, { erro: Object.assign(new Error('Sem acesso'), { status: 403 }) }));
  render(<DetalheEntregavelPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('Sem acesso');
  expect(screen.queryByText('Manutenção mensal')).not.toBeInTheDocument();
});
test('item de outro contrato nunca aparece e conta inativa desabilita consulta', () => {
  detalhe.mockReturnValue(estado({ ...item, contratoId: 'outro' }));
  const view = render(<DetalheEntregavelPage />);
  expect(screen.getByRole('alert')).toHaveTextContent('não encontrado neste contrato');
  perfil.mockReturnValue(estado({ ativo: false }));
  view.rerender(<DetalheEntregavelPage />);
  expect(detalhe).toHaveBeenLastCalledWith('contrato-a', 'e-1', false);
  expect(screen.queryByText('Manutenção mensal')).not.toBeInTheDocument();
});

test('leitor sem permissão de edição não vê formulário de planejamento', () => {
  render(<DetalheEntregavelPage />);
  expect(screen.queryByRole('button', { name: 'Editar entregável' })).not.toBeInTheDocument();
});
test('gestor autorizado pode alternar editor no próprio botão', () => {
  perfil.mockReturnValue(estado({ ativo: true, perfil: 'GESTOR' }));
  acesso.mockReturnValue(estado({ podeEditar: true }));
  render(<DetalheEntregavelPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar entregável' }));
  expect(screen.getByRole('form', { name: 'Editar entregável Manutenção mensal' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar edição' }));
  expect(screen.queryByRole('form', { name: 'Editar entregável Manutenção mensal' })).not.toBeInTheDocument();
});

test('checklist esperado abre detalhe sem afirmar comprovação, retornando à visão do entregável', async () => {
  render(<ConteudoEntregavel item={item} />);
  // Aguarda o resultado da busca de status antes de interagir com os cartões.
  fireEvent.click(await screen.findByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' }));
  // O painel de comprovação é mockado aqui. Testar a identidade vinculada, não a descrição que o mock não renderiza.
  expect(screen.getByRole('region', { name: 'Detalhe da evidência esperada' })).toContainElement(screen.getByTestId('comprovacao-esperada'));
  expect(screen.getByTestId('comprovacao-esperada')).toHaveTextContent('prova-1');
  expect(screen.getByText(/Enviar comprovante · Aguardando envio/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar evidência' }));
  expect(screen.getByText('Entrega dos relatórios assinados')).toBeInTheDocument();
});
