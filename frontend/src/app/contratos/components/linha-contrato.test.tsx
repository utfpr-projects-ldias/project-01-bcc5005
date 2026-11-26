import { fireEvent, render, screen, within } from '@testing-library/react';
import { LinhaContrato } from './linha-contrato';
import type { Contrato } from '@/lib/contratos';

jest.mock('@/hooks/use-etapas', () => ({useEtapas: () => ({dados: [{id:'etapa-1', contratoId:'c1', nome:'Planejamento inicial', sequencia:1, status:'EM_ANDAMENTO'}]})}));
jest.mock('@/hooks/use-entregaveis', () => ({
  useEntregaveis: () => ({dados:[
    {id:'e1', contratoId:'c1', etapaId:'etapa-1', nome:'Relatório técnico', tipo:'UNICO', statusExecucao:'EM_ANDAMENTO'},
    {id:'e2', contratoId:'c1', etapaId:'etapa-1', nome:'Entrega arquivada', tipo:'UNICO', arquivadoEm:'2026-11-24'},
  ]}),
  useResumoDocumentalContrato: () => ({dados:{}}),
}));
jest.mock('@/hooks/use-progresso', () => ({useProgresso: () => ({progresso:null})}));
jest.mock('./resumo-planejamento-contrato', () => ({useIndicadoresPlanejamentoContrato: () => ({indicadores:undefined})}));

test('expande e recolhe etapas e entregáveis na carteira sem coluna de ações', () => {
  const contrato = {id:'c1', codigoPublico:'00001', numeroContrato:'C-001', objeto:'Serviços', orgaoContratante:'Órgão', inicioVigencia:'2026-01-01', terminoVigencia:'2026-12-31', status:'EM_EXECUCAO', modoCalculo:'SIMPLES'} as Contrato;
  const abrir = jest.fn();
  render(<table><tbody><LinhaContrato contrato={contrato} pendente={false} abrir={abrir} onIndicadores={jest.fn()}/></tbody></table>);
  fireEvent.click(screen.getByRole('button',{name:'Expandir etapas'}));
  const etapas = screen.getByRole('table',{name:'Etapas de C-001'});
  expect(etapas.closest('td')).toHaveAttribute('colspan','9');
  fireEvent.click(within(etapas).getByRole('button',{name:'Expandir entregáveis'}));
  const entregaveis = screen.getByRole('table',{name:'Entregáveis de Planejamento inicial'});
  expect(entregaveis.closest('td')).toHaveAttribute('colspan','9');
  expect(within(entregaveis).queryByText('Entrega arquivada')).not.toBeInTheDocument();
  fireEvent.click(within(entregaveis).getByRole('button',{name:/Relatório técnico/}));
  expect(abrir).toHaveBeenCalledWith(expect.any(HTMLElement),{etapaId:'etapa-1',entregavelId:'e1'});
  fireEvent.click(within(etapas).getByRole('button',{name:'Recolher entregáveis'}));
  expect(entregaveis).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Recolher etapas'}));
  expect(etapas).not.toBeInTheDocument();
});
