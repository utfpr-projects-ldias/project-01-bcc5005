import { render, screen, within } from '@testing-library/react';
import { ResumoPlanejamentoContrato } from './resumo-planejamento-contrato';
import { useEtapas } from '@/hooks/use-etapas';
import { useEntregaveis, useResumoDocumentalContrato } from '@/hooks/use-entregaveis';

jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn() }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn(), useResumoDocumentalContrato: jest.fn() }));
const etapas = useEtapas as jest.Mock;
const entregaveis = useEntregaveis as jest.Mock;
const documental = useResumoDocumentalContrato as jest.Mock;
const etapaA = { id: 'etapa-a', contratoId: 'contrato-a', status: 'CONCLUIDA', reabertoEm: null };
const etapaB = { id: 'etapa-b', contratoId: 'contrato-a', status: 'EM_ANDAMENTO', reabertoEm: null };
const itemA = { id: 'item-a', contratoId: 'contrato-a', etapaId: 'etapa-a', statusExecucao: 'CONCLUIDO', reabertoEm: null, evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: true }] };
const itemB = { id: 'item-b', contratoId: 'contrato-a', etapaId: 'etapa-b', statusExecucao: 'EM_ANDAMENTO', reabertoEm: null, evidenciasEsperadas: [{ id: 'ev-b', obrigatoria: true }] };
const baseResumo = {
  'item-a': { total: 1, obrigatorias: 1, verificadas: 1, verificadasTotal: 1 },
  'item-b': { total: 1, obrigatorias: 1, verificadas: 0, verificadasTotal: 0 },
};
const observador = Object.getOwnPropertyDescriptor(globalThis, 'IntersectionObserver');
beforeAll(() => { Object.defineProperty(globalThis, 'IntersectionObserver', { configurable: true, value: undefined }); });
afterAll(() => {
  if (observador) Object.defineProperty(globalThis, 'IntersectionObserver', observador);
  else Reflect.deleteProperty(globalThis, 'IntersectionObserver');
});
beforeEach(() => {
  etapas.mockReturnValue({ dados: [etapaA, etapaB], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA, itemB], carregando: false });
  documental.mockReturnValue({ dados: baseResumo, carregando: false });
});

test('carteira apresenta três indicadores de execução com layout adaptável', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  const resumo = screen.getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveTextContent('Etapas');
  expect(resumo).toHaveTextContent('Entregáveis');
  expect(resumo).toHaveTextContent('Evidências');
  expect(within(resumo).getByRole('img', { name: /1 de 2 etapas concluídas e comprovadas/ })).toBeInTheDocument();
  expect(within(resumo).getByRole('img', { name: /1 de 2 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(within(resumo).getAllByRole('img')).toHaveLength(3);
  expect(resumo).not.toHaveTextContent('Pendente de conclusão');
});

test('página de detalhes preserva três indicadores: barra de etapas e pizzas de entregáveis e evidências', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('1/2')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByRole('img', { name: /1 de 2 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de evidências' })).getByRole('img', { name: /1 de 2 evidências verificadas/ })).toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(3);
});

test('em revisão mostra teal no lugar do roxo sem alterar contagens dos filhos', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" contratoEmRevisao />);
  expect(screen.getByRole('region', { name: 'Resumo de etapas' })).toHaveClass('border-teal-700/45');
  expect(screen.getByRole('img', { name: /1 de 2 etapas concluídas/ })).toHaveClass('bg-teal-900/30');
  expect(screen.getByRole('region', { name: 'Resumo de evidências' })).toHaveClass('border-teal-700/45');
});

test('arquivos verificados não contam como etapa concluída quando o status dela ainda é planejamento', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, status: 'PLANEJADA' }], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas concluídas e comprovadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 1 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
});

test('etapa explicitamente reaberta não fecha sozinha só porque seus entregáveis continuam concluídos', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, reabertoEm: '2026-11-06T20:00:00Z' }], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas concluídas e comprovadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 1 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'false');
});

test('entregável explicitamente reaberto não conta como concluído mesmo com evidência ainda verificada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, reabertoEm: '2026-11-06T20:00:00Z' }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas concluídas e comprovadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /0 de 1 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
});

test('sem resumo documental não exibe falsamente 0/N enquanto dados estão carregando', () => {
  documental.mockReturnValue({ dados: undefined, carregando: true });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByText('Consultando planejamento...')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('arquivados não entram em contagens ativas; indicador arquivado fica âmbar', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, arquivadoEm: '2026-11-05T16:00:00Z' }, etapaB], carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" contratoArquivado />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas concluídas e comprovadas/ })).toHaveClass('bg-amber-500/20');
  expect(screen.getByRole('img', { name: /0 de 1 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(itemA.evidenciasEsperadas).toHaveLength(1);
});

test('uma única evidência opcional verificada também permite contar conclusão confirmada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: false }] }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': { total: 1, obrigatorias: 0, verificadas: 0, verificadasTotal: 1 } }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /1 de 1 etapas concluídas e comprovadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 1 entregáveis documentalmente comprovados/ })).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'true');
});

test('resumo acompanha o card da etapa mesmo quando a execução do filho ainda não foi reconciliada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, statusExecucao: 'EM_ANDAMENTO' }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(screen.getByRole('region', { name: 'Resumo de etapas' })).toHaveTextContent('1/1');
  expect(screen.getByRole('region', { name: 'Resumo de entregáveis' })).toHaveTextContent('Entregáveis');
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'false');
});

test('encerramento administrativo preserva indicadores reais sem inventar barra de cem por cento', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" contratoEncerrado />);
  expect(screen.queryByText(/Encerramento antecipado · execução incompleta preservada/)).not.toBeInTheDocument();
  expect(screen.queryByText(/A barra cinza representa/)).not.toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('1/2')).toBeInTheDocument();
});


test.each([
  { titulo: 'cancelado', propriedade: { contratoCancelado: true }, borda: 'border-red-500/45', fundo: 'bg-red-500/20' },
  { titulo: 'concluído', propriedade: { contratoConcluido: true }, borda: 'border-violet-500/45', fundo: 'bg-violet-500/20' },
  { titulo: 'encerrado', propriedade: { contratoEncerrado: true }, borda: 'border-slate-500/45', fundo: 'bg-slate-600/25' },
])('indicadores do contrato $titulo respeitam status sem falsificar contagens', ({ propriedade, borda, fundo }) => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" {...propriedade} />);
  const etapasResumo = screen.getByRole('region', { name: 'Resumo de etapas' });
  expect(etapasResumo).toHaveClass(borda);
  expect(within(etapasResumo).getByRole('img', { name: /1 de 2 etapas concluídas/ })).toHaveClass(fundo);
  expect(etapasResumo).toHaveTextContent('1/2');
});
