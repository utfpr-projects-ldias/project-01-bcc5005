import { fireEvent, render, screen } from '@testing-library/react';
import OcorrenciasPage from './page';
import { useListaContratos } from '@/hooks/use-contratos';

jest.mock('@/hooks/use-contratos', () => ({ useListaContratos: jest.fn() }));
jest.mock('./components/painel-ocorrencias', () => ({ PainelOcorrencias: ({ contratoId, estadoContextual, somenteLeitura }: { contratoId: string; estadoContextual: string; somenteLeitura: boolean }) =>
  <section aria-label="Painel da agenda" data-contrato={contratoId} data-estado={estadoContextual} data-somente-leitura={String(somenteLeitura)}>Agenda do contrato selecionado</section> }));
const lista = useListaContratos as jest.Mock;
const itens = [{ id: 'c1', codigoPublico: '00001', objeto: 'Serviços Gerais' },
  { id: 'c2', codigoPublico: '00002', objeto: 'Análise de Laboratório' }];

beforeEach(() => { jest.clearAllMocks(); lista.mockReturnValue({ dados: itens, carregando: false, erro: null });
  window.history.replaceState(null, '', '/ocorrencias'); });

test('inicia sem contrato escolhido e exibe o mesmo combobox pesquisavel de atividades', () => {
  render(<OcorrenciasPage />);
  expect(screen.getByRole('combobox', { name: 'Contrato' })).toHaveAttribute('placeholder', 'Selecione um contrato...');
  expect(screen.getByText(/Selecione um contrato para consultar a agenda de ocorrências/)).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Painel da agenda' })).not.toBeInTheDocument();
  fireEvent.focus(screen.getByRole('combobox', { name: 'Contrato' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Contrato' }), { target: { value: 'laboratorio' } });
  fireEvent.click(screen.getByRole('option', { name: /Análise de Laboratório/ }));
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-contrato', 'c2');
});

test('deep-link usa somente contrato incluido na carteira autorizada', () => {
  window.history.replaceState(null, '', '/ocorrencias?contratoId=c2');
  const { unmount } = render(<OcorrenciasPage />);
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-contrato', 'c2');
  unmount();
  window.history.replaceState(null, '', '/ocorrencias?contratoId=fora-da-carteira');
  render(<OcorrenciasPage />);
  expect(screen.queryByRole('region', { name: 'Painel da agenda' })).not.toBeInTheDocument();
});


test('Patch 27: rota global mantém tema normal ao selecionar contrato em revisão ou suspenso', () => {
  lista.mockReturnValue({ dados: [
    { ...itens[0], status: 'PLANEJAMENTO', reabertoEm: '2026-11-10T00:00:00Z' },
    { ...itens[1], status: 'SUSPENSO' },
  ], carregando: false, erro: null });
  window.history.replaceState(null, '', '/ocorrencias?contratoId=c1');
  render(<OcorrenciasPage />);
  expect(screen.getByRole('main')).toHaveAttribute('data-tec08-estado', 'normal');
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-estado', 'normal');
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-somente-leitura', 'false');
  fireEvent.focus(screen.getByRole('combobox', { name: 'Contrato' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Contrato' }), { target: { value: 'laboratorio' } });
  fireEvent.click(screen.getByRole('option', { name: /Análise de Laboratório/ }));
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-estado', 'normal');
  expect(screen.getByRole('region', { name: 'Painel da agenda' })).toHaveAttribute('data-somente-leitura', 'true');
});
