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

test('carteira apresenta quatro indicadores independentes na mesma linha', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  const resumo = screen.getByTestId('resumo-planejamento-contrato');
  expect(resumo).toHaveTextContent('Etapas');
  expect(resumo).toHaveTextContent('Entregáveis');
  expect(resumo).toHaveTextContent('Evidências');
  expect(resumo).toHaveClass('grid-cols-4');
  expect(resumo).toHaveTextContent('Comprovação');
  expect(within(resumo).getByRole('img', { name: /1 de 2 etapas finalizadas/ })).toBeInTheDocument();
  expect(within(resumo).getByRole('img', { name: /1 de 2 entregáveis finalizados/ })).toBeInTheDocument();
  expect(within(resumo).getAllByRole('img')).toHaveLength(4);
  expect(resumo).not.toHaveTextContent('Pendente de conclusão');
});

test('página de detalhes preserva quatro indicadores circulares', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de etapas' })).getByText('1/2')).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de entregáveis' })).getByRole('img', { name: /1 de 2 entregáveis finalizados/ })).toBeInTheDocument();
  expect(within(screen.getByRole('region', { name: 'Resumo de evidências' })).getByRole('img', { name: /1 de 2 evidências verificadas/ })).toBeInTheDocument();
  expect(screen.getAllByRole('img')).toHaveLength(4);
});

test('revisão do contrato não altera os quatro contadores nem cria cartões independentes', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" contratoEmRevisao />);
  expect(screen.getAllByRole('img')).toHaveLength(4);
  expect(screen.getByRole('img', { name: '1 de 2 etapas finalizadas' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Resumo de etapas' })).not.toHaveClass('border-teal-700/45');
});

test('arquivos verificados não contam como etapa concluída quando o status dela ainda é planejamento', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, status: 'PLANEJADA' }], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas finalizadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 1 entregáveis finalizados/ })).toBeInTheDocument();
});

test('etapa explicitamente reaberta não fecha sozinha só porque seus entregáveis continuam concluídos', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, reabertoEm: '2026-11-06T20:00:00Z' }], carregando: false });
  entregaveis.mockReturnValue({ dados: [itemA], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas finalizadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /1 de 1 entregáveis finalizados/ })).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'true');
});

test('entregável explicitamente reaberto não conta como concluído mesmo com evidência ainda verificada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, reabertoEm: '2026-11-06T20:00:00Z' }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /1 de 1 etapas finalizadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /0 de 1 entregáveis finalizados/ })).toBeInTheDocument();
});

test('sem resumo documental não exibe falsamente 0/N enquanto dados estão carregando', () => {
  documental.mockReturnValue({ dados: undefined, carregando: true });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByText('Consultando planejamento...')).toBeInTheDocument();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
});

test('arquivados não entram em contagens ativas; sem falsificar estado dos filhos', () => {
  etapas.mockReturnValue({ dados: [{ ...etapaA, arquivadoEm: '2026-11-05T16:00:00Z' }, etapaB], carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" contratoArquivado />);
  expect(screen.getByRole('img', { name: /0 de 1 etapas finalizadas/ })).toHaveAttribute('data-percentual','0');
  expect(screen.getByRole('img', { name: /0 de 1 entregáveis finalizados/ })).toBeInTheDocument();
  expect(itemA.evidenciasEsperadas).toHaveLength(1);
});

test('uma única evidência opcional verificada não permite contar conclusão confirmada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, statusExecucao: 'NAO_INICIADO', evidenciasEsperadas: [{ id: 'ev-a', obrigatoria: false }] }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': { total: 1, obrigatorias: 0, verificadas: 0, verificadasTotal: 1 } }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" />);
  expect(screen.getByRole('img', { name: /1 de 1 etapas finalizadas/ })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /0 de 1 entregáveis finalizados/ })).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'false');
});

test('resumo acompanha o card da etapa mesmo quando a execução do filho ainda não foi reconciliada', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, statusExecucao: 'EM_ANDAMENTO' }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': baseResumo['item-a'] }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(screen.getByRole('region', { name: 'Resumo de etapas' })).toHaveTextContent('1/1');
  expect(screen.getByRole('img', {name:'0 de 1 entregáveis finalizados'})).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'true');
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
])('indicadores do contrato $titulo respeitam status sem falsificar contagens', ({ propriedade }) => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" {...propriedade} />);
  const etapasResumo = screen.getByRole('region', { name: 'Resumo de etapas' });
  expect(within(etapasResumo).getByRole('img', { name: /1 de 2 etapas finalizadas/ })).toHaveAttribute('data-percentual', '50');
  expect(screen.getAllByRole('img')).toHaveLength(4);
  expect(etapasResumo).toHaveTextContent('1/2');
});


test('evidências incluem opcionais, comprovação conta somente exigências', () => {
  etapas.mockReturnValue({ dados: [etapaA], carregando: false });
  entregaveis.mockReturnValue({ dados: [{ ...itemA, evidenciasEsperadas: [
    { id: 'ev-a', obrigatoria: true }, { id: 'ev-opc', obrigatoria: false },
  ] }], carregando: false });
  documental.mockReturnValue({ dados: { 'item-a': { total: 2, obrigatorias: 1, verificadas: 1, verificadasTotal: 1 } }, carregando: false });
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(within(screen.getByRole('region', { name: 'Resumo de evidências' })).getByRole('img',
    { name: '1 de 2 evidências verificadas' })).toBeInTheDocument();
  expect(screen.getByTestId('resumo-planejamento-contrato')).toHaveAttribute('data-documental-completo', 'true');
});

test('R42: planejamento 0/1 pode ter comprovação 1/1 sem finalizar', () => {
  etapas.mockReturnValue({dados:[{...etapaA,status:'PLANEJADA'}]});
  entregaveis.mockReturnValue({dados:[{...itemA,statusExecucao:'NAO_INICIADO'}]});
  documental.mockReturnValue({dados:{'item-a':baseResumo['item-a']}});
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe"/>);
  expect(screen.getByRole('img',{name:'0 de 1 etapas finalizadas'})).toHaveAttribute('data-percentual','0');
  expect(screen.getByRole('img',{name:'0 de 1 entregáveis finalizados'})).toHaveAttribute('data-percentual','0');
  expect(screen.getByRole('img',{name:'1 de 1 evidências verificadas'})).toHaveAttribute('data-percentual','100');
  expect(screen.getByRole('img',{name:'1 de 1 exigências obrigatórias atendidas'})).toHaveAttribute('data-percentual','100');
});
test('R42: denominador vazio não é 100%',()=>{
  etapas.mockReturnValue({dados:[]});entregaveis.mockReturnValue({dados:[]});documental.mockReturnValue({dados:{}});
  render(<ResumoPlanejamentoContrato contratoId="contrato-a"/>);
  expect(screen.getAllByRole('img')).toHaveLength(4);
  screen.getAllByRole('img').forEach(img=>expect(img).toHaveAttribute('data-percentual','0'));
});

test('R46: planejamento lateral mantém três círculos; comprovações têm apresentação própria na execução', () => {
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="lateral" />);
  const painel = screen.getByTestId('resumo-planejamento-contrato');
  expect(painel).toHaveClass('grid-cols-3');
  expect(within(painel).getAllByRole('region')).toHaveLength(3);
  expect(within(painel).queryByRole('region', {name:'Resumo de comprovação'})).not.toBeInTheDocument();
  expect(within(painel).getByRole('img', {name:'1 de 2 evidências verificadas'})).toBeInTheDocument();
});

test('R46: resumo incompleto não inventa ausência de evidências ou de requisitos', () => {
  documental.mockReturnValue({dados:{'item-a':baseResumo['item-a']},carregando:false});
  render(<ResumoPlanejamentoContrato contratoId="contrato-a" variante="detalhe" />);
  expect(screen.getByRole('img',{name:'Evidências: indisponível'})).toHaveTextContent('—');
  expect(screen.getByRole('img',{name:'Comprovação: indisponível'})).not.toHaveAttribute('data-percentual');
  expect(screen.getByRole('img',{name:'1 de 2 entregáveis finalizados'})).toBeInTheDocument();
});
