import { render, screen } from '@testing-library/react';
import AtividadesPage from './page';
import { useListaContratos } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useAtividades } from '@/hooks/use-atividades';

jest.mock('@/hooks/use-contratos', () => ({ useListaContratos: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn() }));
jest.mock('@/hooks/use-atividades', () => ({ useAtividades: jest.fn() }));
const contratos = useListaContratos as jest.Mock;
const entregaveis = useEntregaveis as jest.Mock;
const diario = useAtividades as jest.Mock;

beforeEach(() => {
  contratos.mockReturnValue({ dados: [{ id: 'aaa', codigoPublico: '001', objeto: 'Contrato teste' }], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ id: 'bbb', nome: 'Entregável 1', arquivadoEm: null }], carregando: false });
  diario.mockReturnValue({ atividades: [], total: 0, loading: false, erro: null, criarAtividade: jest.fn(), editarAtividade: jest.fn() });
});

test('HU08-03 mostra contrato autorizado, formulários opcionais e seleção múltipla', () => {
  render(<AtividadesPage />);
  expect(screen.getByRole('heading', { name: 'Diário de execução' })).toBeInTheDocument();
  expect(screen.getByLabelText('Contrato autorizado')).toHaveValue('aaa');
  expect(screen.getByText('Entregável 1')).toBeInTheDocument();
  expect(screen.getByLabelText('Participantes')).not.toBeRequired();
  expect(screen.getByText('Nenhuma atividade encontrada para o contrato ou período.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Diário de execução' })).toBeVisible();
});
