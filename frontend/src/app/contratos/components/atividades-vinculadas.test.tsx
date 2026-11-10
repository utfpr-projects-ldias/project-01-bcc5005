import { fireEvent, render, screen } from '@testing-library/react';
import { AtividadesVinculadas } from './atividades-vinculadas';
import { useAtividades } from '@/hooks/use-atividades';

jest.mock('@/app/components/provedor-consultas', () => ({ useRepositorioConsultasOpcional: () => ({}) }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: () => ({ dados: { permissoes: { registrarAtividades: true } }, erro: null }) }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: () => ({ dados: [{ id: 'entrega-1', etapaId: 'etapa-1', nome: 'Entregável 1', arquivadoEm: null }] }) }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: () => ({ dados: [{ id: 'etapa-1', nome: 'Etapa 1', arquivadoEm: null }] }) }));
jest.mock('@/hooks/use-atividades', () => ({ useAtividades: jest.fn(() => ({ atividades: [], total: 0, loading: false, erro: null })) }));
jest.mock('@/app/atividades/components/cartao-atividade', () => ({ CartaoAtividade: () => null, statusVisualEntregavel: () => 'normal' }));

test('modal de entregável oferece filtro por situação sem link circular', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" entregavelId="entregavel-qa" ocultarAcessoDiario />);
  expect(screen.getByRole('region', { name: 'Atividades vinculadas ao entregável' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Registradas' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tab', { name: 'Verificadas' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Arquivadas' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Abrir diário' })).not.toBeInTheDocument();
});

test('contrato oferece filtros automáticos por etapa, entregável, datas e status', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" />);
  expect(screen.getByLabelText('Data inicial')).toBeInTheDocument();
  expect(screen.getByLabelText('Data final')).toBeInTheDocument();
  expect(screen.getByLabelText('Etapa')).toBeInTheDocument();
  expect(screen.getByLabelText('Entregável')).toBeInTheDocument();
  expect(screen.getByLabelText('Situação')).toHaveValue('ATIVAS');
  expect(screen.queryByRole('button', { name: 'Aplicar filtros' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'VERIFICADA' } });
  expect(screen.getByLabelText('Situação')).toHaveValue('VERIFICADA');
});

test('datas invertidas são identificadas imediatamente, sem clicar em Aplicar', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" />);
  fireEvent.change(screen.getByLabelText('Data inicial'), { target: { value: '2026-11-28' } });
  fireEvent.change(screen.getByLabelText('Data final'), { target: { value: '2026-11-01' } });
  expect(screen.getByRole('alert')).toHaveTextContent('A data inicial não pode ser posterior');
});

test('seleção contextual apresenta Nova atividade e aplica etapa/entregável sem submit', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" />);
  expect(screen.queryByRole('button', { name: 'Nova atividade neste contexto' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Etapa'), { target: { value: 'etapa-1' } });
  fireEvent.change(screen.getByLabelText('Entregável'), { target: { value: 'entrega-1' } });
  expect(screen.getByRole('button', { name: 'Nova atividade neste contexto' })).toBeInTheDocument();
  expect(useAtividades as jest.Mock).toHaveBeenLastCalledWith('contrato-qa',
    expect.objectContaining({ etapaId: 'etapa-1', entregavelId: 'entrega-1', status: 'ATIVAS' }));
});

test('entregável vinculado pode ficar somente leitura mesmo com delegação de registro', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" entregavelId="entrega-1" somenteLeitura />);
  expect(screen.queryByRole('button', { name: 'Nova atividade neste contexto' })).not.toBeInTheDocument();
});


test('Nova atividade abre formulário em modal sem trocar de rota', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" entregavelId="entrega-1" />);
  fireEvent.click(screen.getByRole('button', { name: 'Nova atividade neste contexto' }));
  expect(screen.getByRole('dialog', { name: 'Nova atividade' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Formulário de atividade' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Nova atividade neste contexto' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Fechar cadastro de atividade' }));
  expect(screen.queryByRole('dialog', { name: 'Nova atividade' })).not.toBeInTheDocument();
});


test('lista de registradas consulta também as verificadas, sem incluir arquivadas', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" />);
  expect(useAtividades as jest.Mock).toHaveBeenLastCalledWith('contrato-qa',
    expect.objectContaining({ status: 'ATIVAS' }));
  expect(screen.getByText('Diário operacional — 0 registros')).toBeInTheDocument();
  expect(screen.queryByText(/independente das evidências previstas/)).not.toBeInTheDocument();
});
