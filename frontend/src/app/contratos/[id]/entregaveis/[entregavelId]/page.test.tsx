import { render, screen } from '@testing-library/react';
import DetalheEntregavelPage, { ConteudoEntregavel } from './page';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import type { Entregavel } from '@/lib/entregaveis';
jest.mock('next/navigation', () => ({ useParams: () => ({ id: 'contrato-a', entregavelId: 'e-1' }) }));
jest.mock('@/hooks/use-meu-perfil', () => ({ useMeuPerfil: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useDetalheEntregavel: jest.fn() }));
const perfil = useMeuPerfil as jest.Mock;
const detalhe = useDetalheEntregavel as jest.Mock;
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
beforeEach(() => { perfil.mockReturnValue(estado({ ativo: true })); detalhe.mockReturnValue(estado(item)); });
test('visao separa planejamento, criterio proximo de execucao e checklist esperado', () => {
  render(<ConteudoEntregavel item={item} />);
  expect(screen.getByRole('heading', { name: 'Manutenção mensal' })).toBeInTheDocument();
  expect(screen.getByText('Entrega dos relatórios assinados')).toBeInTheDocument();
  expect(screen.getByText('Mensal')).toBeInTheDocument();
  expect(screen.getByText('31/12/2026')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Checklist de evidências esperadas' })).toHaveTextContent('Obrigatória');
  expect(screen.getByText('Opcional')).toBeInTheDocument();
  expect(screen.getByText(/Nenhum progresso foi presumido/)).toBeInTheDocument();
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
