import { fireEvent, render, screen } from '@testing-library/react';
import AtividadesPage from './page';
import { useListaContratos, useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useAtividades } from '@/hooks/use-atividades';

jest.mock('next/navigation', () => ({ ...jest.requireActual('next/navigation'), useRouter: () => ({ push: jest.fn() }) }));

jest.mock('@/hooks/use-contratos', () => ({ useListaContratos: jest.fn(), useAcessoContrato: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn() }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-atividades', () => ({ useAtividades: jest.fn() }));
// O formulário agora consulta ocorrências para oferecer vínculo opcional.
jest.mock('@/hooks/use-ocorrencias', () => ({ useOcorrencias: () => ({ ocorrencias: [], loading: false, erro: null }) }));
const contratos = useListaContratos as jest.Mock;
const acesso = useAcessoContrato as jest.Mock;
const entregaveis = useEntregaveis as jest.Mock;
const etapas = useEtapas as jest.Mock;
const diario = useAtividades as jest.Mock;

beforeEach(() => {
  jest.resetAllMocks();
  contratos.mockReturnValue({ dados: [{ id: 'aaa', codigoPublico: '001', objeto: 'Contrato teste' }], carregando: false });
  acesso.mockReturnValue({ dados: { permissoes: { registrarAtividades: true, editarAtividades: true, verificarAtividades: false } }, carregando: false });
  entregaveis.mockReturnValue({ dados: [{ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', etapaId: 'etapa-qa', nome: 'Entregável 1', arquivadoEm: null }], carregando: false });
  etapas.mockReturnValue({ dados: [{ id: 'etapa-qa', nome: 'Etapa 1', arquivadoEm: null }], carregando: false });
  diario.mockReturnValue({ atividades: [], total: 0, loading: false, erro: null, criarAtividade: jest.fn(), editarAtividade: jest.fn(), transicionarAtividade: jest.fn() });
});

test('HU08 mostra diário e abre formulário com campos opcionais em modal', () => {
  render(<AtividadesPage />);
  expect(screen.getByRole('heading', { name: 'Diário de execução' })).toBeVisible();
  expect(screen.getByLabelText('Contrato')).toHaveValue('');
  fireEvent.focus(screen.getByRole('combobox', { name: 'Contrato' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Contrato' }), { target: { value: 'Contrato teste' } });
  fireEvent.click(screen.getByRole('option', { name: /Contrato teste/ }));
  expect(screen.getByText('Nenhuma atividade encontrada para o contrato ou período.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Participantes')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Nova atividade/ }));
  expect(screen.getByRole('dialog', { name: 'Nova atividade' })).toBeInTheDocument();
  expect(screen.getByLabelText('Participantes')).not.toBeRequired();
  expect(screen.getByRole('checkbox', { name: 'Entregável 1' })).toBeInTheDocument();
});

test('sem delegação de registro, a tela não oferece criação nem edição', () => {
  acesso.mockReturnValue({ dados: { permissoes: { registrarAtividades: false, editarAtividades: false } } });
  render(<AtividadesPage />);
  expect(screen.queryByRole('button', { name: /Nova atividade/ })).not.toBeInTheDocument();
});

test('verificada não mostra edição e só permite arquivar mediante permissão', () => {
  acesso.mockReturnValue({ dados: { permissoes: { registrarAtividades: true, editarAtividades: true, arquivarAtividades: true } } });
  diario.mockReturnValue({ atividades: [{ id: 'atividade1', titulo: 'Reunião registrada', dataHora: '2026-11-09T12:00:00Z',
    descricao: 'Acompanhamento', tipo: 'Reunião', responsavel: 'Equipe', entregaveis: [], status: 'VERIFICADA' }],
    total: 1, loading: false, erro: null });
  render(<AtividadesPage />);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Contrato' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Contrato' }), { target: { value: 'Contrato teste' } });
  fireEvent.click(screen.getByRole('option', { name: /Contrato teste/ }));
  expect(screen.getByText('Verificada')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Arquivar' })).toBeInTheDocument();
});


test('diário tem etapa e filtros automáticos sem Aplicar filtros', () => {
  render(<AtividadesPage />);
  expect(screen.getByLabelText('Etapa')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).not.toBeInTheDocument();
});


test('situação inicia em Registradas, inclui verificadas e não oferece Todas', () => {
  render(<AtividadesPage />);
  const seletor = screen.getByRole('combobox', { name: 'Situação' });
  expect(seletor).toHaveValue('ATIVAS');
  expect(screen.getByRole('option', { name: 'Registradas' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /^Todas$/ })).not.toBeInTheDocument();
  expect(diario).toHaveBeenLastCalledWith('', expect.objectContaining({ status: 'ATIVAS' }));
  fireEvent.change(seletor, { target: { value: 'VERIFICADA' } });
  expect(diario).toHaveBeenLastCalledWith('', expect.objectContaining({ status: 'VERIFICADA' }));
  fireEvent.change(seletor, { target: { value: 'ATIVAS' } });
  expect(diario).toHaveBeenLastCalledWith('', expect.objectContaining({ status: 'ATIVAS' }));
});
