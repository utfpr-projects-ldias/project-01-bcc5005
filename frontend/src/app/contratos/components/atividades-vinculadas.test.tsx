import { fireEvent, render, screen } from '@testing-library/react';
import { AtividadesVinculadas } from './atividades-vinculadas';
import { useAtividades } from '@/hooks/use-atividades';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';

jest.mock('@/app/components/provedor-consultas', () => ({ useRepositorioConsultasOpcional: () => ({}) }));
jest.mock('@/hooks/use-contratos', () => ({ useAcessoContrato: () => ({ dados: { permissoes: { registrarAtividades: true } }, erro: null }) }));
jest.mock('@/hooks/use-entregaveis', () => ({ useEntregaveis: jest.fn(() => ({ dados: [{ id: 'entrega-1', etapaId: 'etapa-1', nome: 'Entregável 1', arquivadoEm: null }, { id: 'entrega-2', etapaId: 'etapa-2', nome: 'Entregável 2', arquivadoEm: null }] })) }));
jest.mock('@/hooks/use-etapas', () => ({ useEtapas: jest.fn(() => ({ dados: [{ id: 'etapa-1', nome: 'Etapa 1', arquivadoEm: null }, { id: 'etapa-2', nome: 'Etapa 2', arquivadoEm: null }] })) }));
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
  expect(screen.getByRole('button', { name: 'Nova atividade neste contexto' })).toBeInTheDocument();
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


test('cadastro na aba do contrato independe dos filtros de etapa e entregavel e aceita vinculos de etapas diferentes', () => {
  render(<AtividadesVinculadas contratoId="contrato-qa" />);
  fireEvent.click(screen.getByRole('button', { name: 'Nova atividade neste contexto' }));
  expect(screen.getByRole('dialog', { name: 'Nova atividade' })).toBeInTheDocument();
  const primeiro = screen.getByRole('checkbox', { name: 'Entregável 1' });
  const segundo = screen.getByRole('checkbox', { name: 'Entregável 2' });
  fireEvent.click(primeiro);
  fireEvent.click(segundo);
  expect(primeiro).toBeChecked();
  expect(segundo).toBeChecked();
  expect(screen.queryByLabelText('Etapa *')).not.toBeInTheDocument();
});


test('entregável reaberto em etapa aberta restabelece CTA e mantém a cor de revisão do contrato', () => {
  const entregaveis = useEntregaveis as jest.Mock;
  const etapas = useEtapas as jest.Mock;
  const registro = { id: 'entrega-1', etapaId: 'etapa-1', nome: 'Entregável 1', arquivadoEm: null, statusExecucao: 'CONCLUIDO' };
  entregaveis.mockReturnValueOnce({ dados: [registro] });
  etapas.mockReturnValueOnce({ dados: [{ id: 'etapa-1', status: 'PLANEJADA', arquivadoEm: null }] });
  const tela = render(<AtividadesVinculadas contratoId="contrato-qa" estadoContextual="revisao" />);
  expect(screen.queryByRole('button', { name: 'Nova atividade neste contexto' })).not.toBeInTheDocument();
  entregaveis.mockReturnValueOnce({ dados: [{ ...registro, statusExecucao: 'EM_ANDAMENTO', reabertoEm: '2026-11-11' }] });
  etapas.mockReturnValueOnce({ dados: [{ id: 'etapa-1', status: 'PLANEJADA', arquivadoEm: null }] });
  tela.rerender(<AtividadesVinculadas contratoId="contrato-qa" estadoContextual="revisao" />);
  expect(screen.getByRole('region', { name: 'Atividades do contrato' })).toHaveAttribute('data-tec08-estado', 'revisao');
  expect(screen.getByRole('button', { name: 'Nova atividade neste contexto' })).toHaveAttribute('data-pi-acao', 'primaria');
  expect(screen.queryByRole('option', { name: /^Todas$/ })).not.toBeInTheDocument();
});

test('reabertura do entregável não contorna etapa ainda concluída', () => {
  (useEntregaveis as jest.Mock).mockReturnValueOnce({ dados: [{ id: 'entrega-1', etapaId: 'etapa-1', statusExecucao: 'EM_ANDAMENTO', arquivadoEm: null }] });
  (useEtapas as jest.Mock).mockReturnValueOnce({ dados: [{ id: 'etapa-1', status: 'CONCLUIDA', arquivadoEm: null }] });
  render(<AtividadesVinculadas contratoId="contrato-qa" estadoContextual="revisao" />);
  expect(screen.queryByRole('button', { name: 'Nova atividade neste contexto' })).not.toBeInTheDocument();
  expect(screen.getByText(/Reabra um entregável e sua etapa/)).toBeInTheDocument();
});
