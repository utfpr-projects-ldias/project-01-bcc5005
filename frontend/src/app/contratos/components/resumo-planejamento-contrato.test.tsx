import { render, screen, within } from '@testing-library/react';
import { ResumoPlanejamentoContrato } from './resumo-planejamento-contrato';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';

jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn(), useResumoDocumentalContrato: jest.fn() }));

const etapas = useEtapas as jest.Mock;
const entregaveis = useEntregaveis as jest.Mock;
const documental = useResumoDocumentalContrato as jest.Mock;
const etapaA = { id: 'etapa-a', contratoId: 'contrato-a', status: 'PLANEJADA' };
const etapaB = { id: 'etapa-b', contratoId: 'contrato-a', status: 'EM_ANDAMENTO' };
const itemA = { id: 'item-a', contratoId: 'contrato-a', etapaId: 'etapa-a', evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: true }] };
const itemB = { id: 'item-b', contratoId: 'contrato-a', etapaId: 'etapa-b', evidenciasEsperadas: [{ id: 'ev-b', obrigatoria: true }] };

// JSDOM não aciona interseções reais; testar o fallback não-intersectável do componente.
const observador = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
beforeAll(() => { Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: undefined }); });
afterAll(() => {
  if (observador) Object.defineProperty(globalThis, 'IntersectionObserver', observador);
  else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});

beforeEach(() => {
  etapas.mockReturnValue({ dados: [etapaA, etapaB], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA, itemB], carregando: false });
  documental.mockReturnValue({ dados: {
    'item-a': { total: 1, obrigatorias: 1, verificadas: 1, verificadasTotal: 1 },
    'item-b': { total: 1, obrigatorias: 1, verificadas: 0, verificadasTotal: 0 },
  }, carregando: false });
});

test('comprovação completa de uma etapa e de um entregável não altera status de execução', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('1/2')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 2 etapas com documentação completa/ })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByText('1/2')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de evidências' })).getByText('1/2')).toBeInTheDocument();
  expect(etapaA.status).toBe('PLANEJADA');
  expect(etapaB.status).toBe('EM_ANDAMENTO');
});

test('carteira mostra razão de evidências verificadas, em vez de barra puramente decorativa', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  const resumo = screen.getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveTextContent('1 de 2');
  expect(within(resumo).getByRole('img', { name: /1 de 2 evidências verificadas/ })).toBeInTheDocument();
});

test('sem consulta documental não inventa uma evidência verificada', () => {
  documental.mockReturnValue({ dados: undefined, carregando: true });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  const resumo = screen.getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveTextContent('… de 2');
});


test('arquivar etapa e entregável retira os itens dos indicadores ativos sem perder cadastro', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, arquivadoEm: '2026-11-05T16:00:00Z' }, etapaB], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA, itemB], carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('0/1')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByText('0/1')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de evidências' })).getByText('0/1')).toBeInTheDocument();
  expect(itemA.evidenciasEsperadas).toHaveLength(1); // arquivo histórico continua no objeto fonte.
});

test('entregável arquivado também deixa de entrar no planejamento da etapa ativa', () => {
  entregaveis.mockReturnValue({ dados: [{ ...itemA, arquivadoEm: '2026-11-05T16:00:00Z' }, itemB], carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByText('0/1')).toBeInTheDocument();
});


test('comprovação opcional verificada também conclui indicadores documentais de etapa e entregável', () => {
  entregaveis.mockReturnValue({ dados: [{ ...itemA, evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: false }] }], carregando: false });
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': { total: 1, obrigatorias: 0, verificadas: 0, verificadasTotal: 1 } }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('1/1')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByText('1/1')).toBeInTheDocument();
  expect(etapaA.status).toBe('PLANEJADA'); // A validação documental NÃO atualiza status físico no banco.
});


test('contrato marcado completo quando todas as evidências ativas inclusive opcionais estão verificadas', () => {
  entregaveis.mockReturnValue({ dados: [{ ...itemA, evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: false }] }], carregando: false });
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': { total: 1, obrigatorias: 0, verificadas: 0, verificadasTotal: 1 } }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'true');
  // Comprovação documental não muda status operacional.
  expect(etapaA.status).toBe('PLANEJADA');
});

test('contrato incompleto, sem dados ou sem entregáveis não recebe destaque roxo', () => {
  const { rerender } = render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'false');
  entregaveis.mockReturnValue({ dados: [], carregando: false });
  documental.mockReturnValue({ dados: {}, carregando: false });
  rerender(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'false');
});
