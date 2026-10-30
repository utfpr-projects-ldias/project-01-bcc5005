import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioEntregavel } from './formulario-entregavel';
import type { Entregavel } from '@/lib/entregaveis';
const gravar = jest.fn().mockResolvedValue(undefined);
const cancelar = jest.fn();
beforeEach(() => { jest.clearAllMocks(); gravar.mockResolvedValue(undefined); });
const montar = (inicial?: Entregavel) => render(<FormularioEntregavel etapaId="etapa-a" inicial={inicial} onSalvar={gravar} onCancelar={cancelar} />);
const item: Entregavel = {
  id: 'e1', contratoId: 'contrato', etapaId: 'etapa-a', nome: 'Manutenção', tipo: 'RECORRENTE',
  codigo: null, descricao: null, responsavelId: null, inicioPrevisto: null, terminoPrevisto: null,
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, periodicidade: 'MENSAL', configuracaoPeriodicidade: { versao: 1 },
  peso: null, criterioConclusao: null, statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, observacoes: null,
  evidenciasEsperadas: [{ id: 'ev1', tipoEvidencia: 'Relatório', descricao: 'PDF', obrigatoria: true }],
};
test('alternar tipo revela apenas campos aplicáveis; quantitativo valida quantidade', async () => {
  montar();
  expect(screen.queryByLabelText('Quantidade prevista *')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tipo *'), { target: { value: 'QUANTITATIVO' } });
  expect(screen.getByLabelText('Quantidade prevista *')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Instalação' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(screen.getByText(/Informe quantidade maior que zero/)).toBeInTheDocument();
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Quantidade prevista *'), { target: { value: '3.250' } });
  fireEvent.change(screen.getByLabelText('Unidade de medida *'), { target: { value: 'unidades' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'QUANTITATIVO', quantidadePrevista: '3.250', unidadeMedida: 'unidades' }));
});
test('recorrente usa apenas periodicidade fixa; marco exige critério', async () => {
  montar();
  fireEvent.change(screen.getByLabelText('Tipo *'), { target: { value: 'RECORRENTE' } });
  expect(screen.getByRole('option', { name: 'Mensal' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Personalizada/ })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tipo *'), { target: { value: 'MARCO' } });
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Marco de entrega' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(screen.getByText(/critério textual é obrigatório/)).toBeInTheDocument();
});
test('checklist sem upload permite múltiplos itens e obrigatoriedade', async () => {
  montar();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Etapa técnica' } });
  fireEvent.click(screen.getByRole('button', { name: /Adicionar evidência esperada/ }));
  fireEvent.change(screen.getByLabelText('Tipo de evidência *'), { target: { value: 'Relatório fotográfico' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Obrigatória' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ evidenciasEsperadas: [expect.objectContaining({ tipoEvidencia: 'Relatório fotográfico', obrigatoria: true })] }));
});
test('edição protege mudança de periodicidade e preserva IDs do checklist', async () => {
  montar(item);
  fireEvent.change(screen.getByLabelText('Periodicidade fixa *'), { target: { value: 'ANUAL' } });
  expect(screen.getByText(/Atenção ao replanejamento/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox', { name: /Confirmo que compreendi/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ periodicidade: 'ANUAL', evidenciasEsperadas: [expect.objectContaining({ id: 'ev1' })] }));
});
test('erro HTTP preserva campos; clique duplo só dispara uma mutação', async () => {
  let concluir!: () => void;
  gravar.mockImplementation(() => new Promise<void>((resolve) => { concluir = resolve; }));
  montar();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Serviço planejado' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(screen.getByRole('button', { name: /Salvando entregável/ })).toBeDisabled();
  expect(gravar).toHaveBeenCalledTimes(1);
  await act(async () => { concluir(); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cadastrar entregável' })).toBeEnabled());
  expect(screen.getByLabelText('Nome *')).toHaveValue('Serviço planejado');
});
