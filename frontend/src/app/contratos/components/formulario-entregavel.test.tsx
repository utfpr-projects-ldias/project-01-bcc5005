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

test('limite 10 impede adicionar mais itens, sem apagar o checklist anterior', () => {
  montar();
  const adicionar = screen.getByRole('button', { name: /Adicionar evidência esperada/ });
  for (let n = 0; n < 10; n++) fireEvent.click(adicionar);
  expect(screen.getAllByRole('button', { name: /Remover evidência esperada/ })).toHaveLength(10);
  expect(adicionar).toBeDisabled();
  expect(screen.getByText(/máximo de 10/)).toBeInTheDocument();
});

test('responsável é único, opcional e escolhido somente pelo e-mail sem expor UUID', async () => {
  const usuario = { id: '12345678-1234-4123-8123-123456789abc', nome: 'Maria da Silva', email: 'maria@example.org' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [usuario], total: 1, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  expect(screen.queryByRole('combobox', { name: 'Responsável pelo entregável (opcional)' })).not.toBeInTheDocument();
  expect(screen.getByText(/Nenhum responsável atribuído/)).toBeInTheDocument();
  const busca = screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' });
  fireEvent.change(busca, { target: { value: 'maria@' } });
  const opcao = await screen.findByRole('option', { name: /maria@example.org/ });
  fireEvent.click(opcao);
  expect(screen.getByText('maria@example.org')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remover atribuição' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Entregável da equipe' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ responsavelId: usuario.id }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover atribuição' }));
  expect(screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' })).toBeInTheDocument();
});

test('e-mail apenas digitado, sem opção selecionada, não cria vínculo automaticamente', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [], total: 0, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' }), { target: { value: 'inexistente@empresa.org' } });
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Obrigação sem responsável' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ responsavelId: null }));
});
