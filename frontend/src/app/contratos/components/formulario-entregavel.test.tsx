import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FormularioEntregavel } from './formulario-entregavel';
import type { Entregavel } from '@/lib/entregaveis';
const gravar = jest.fn().mockResolvedValue(undefined);
const cancelar = jest.fn();
beforeEach(() => { jest.clearAllMocks(); gravar.mockResolvedValue(undefined); });
const montar = (inicial?: Entregavel) => render(<FormularioEntregavel etapaId="etapa-a" inicial={inicial} onSalvar={gravar} onCancelar={cancelar} podeConfigurarPesos podeReplanejarOcorrencias />);
const item: Entregavel = {
  id: 'e1', contratoId: 'contrato', etapaId: 'etapa-a', nome: 'Manutenção', tipo: 'RECORRENTE',
  codigo: null, descricao: null, responsavelId: null, inicioPrevisto: null, terminoPrevisto: null,
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, periodicidade: 'MENSAL', configuracaoPeriodicidade: { versao: 1 },
  peso: null, criterioConclusao: null, statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, observacoes: null,
  evidenciasEsperadas: [{ id: 'ev1', tipoEvidencia: 'Relatório', descricao: 'PDF', obrigatoria: true }],
};
test('cadastro separa o planejamento operacional das ocorrências', async () => {
  montar();
  expect(screen.queryByLabelText('Tipo *')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Quantidade prevista *')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Periodicidade fixa *')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Obrigação nova' } });
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'UNICO', peso: '20', quantidadePrevista: null, periodicidade: null, evidenciasEsperadas: [] }));
});
test('peso operacional obrigatório aceita soma provisória e impede valor acima de 100', async () => {
  montar();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Projeto' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '101' } });
  expect(screen.getByLabelText('Peso operacional (%) *')).toHaveValue('100');
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '18.25' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ peso: '18.25' }));
});
test('edição preserva checklist e campos operacionais existentes sem modificá-los', async () => {
  montar({ ...item, peso: '20' });
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Manutenção periódica' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ nome: 'Manutenção periódica', periodicidade: 'MENSAL', evidenciasEsperadas: [expect.objectContaining({ id: 'ev1' })] }));
});
test('novo entregável mantém data única e esconde checklist na criação', () => {
  montar();
  expect(screen.getByRole('checkbox', { name: /Mesma data do início/ })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Adicionar evidência esperada/ })).not.toBeInTheDocument();
});
test('erro HTTP preserva campos; clique duplo só dispara uma mutação', async () => {
  let concluir!: () => void;
  gravar.mockImplementation(() => new Promise<void>((resolve) => { concluir = resolve; }));
  montar();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Serviço planejado' } });
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(screen.getByRole('button', { name: /Salvando\.\.\./ })).toBeDisabled();
  expect(gravar).toHaveBeenCalledTimes(1);
  await act(async () => { concluir(); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cadastrar entregável' })).toBeEnabled());
  expect(screen.getByLabelText('Nome *')).toHaveValue('Serviço planejado');
});

test('o formulário de cadastro não apresenta checklist junto ao planejamento', () => {
  montar();
  expect(screen.queryByText(/Evidências esperadas 10\/10/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Adicionar evidência esperada/ })).not.toBeInTheDocument();
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
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ responsavelId: usuario.id }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover atribuição' }));
  expect(screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' })).toBeInTheDocument();
});

test('explica a atribuição do responsável sem termos administrativos nem prometer acesso automático', () => {
  montar();
  expect(screen.getByText('Escolha a pessoa que acompanhará esta entrega. O acesso ao contrato é configurado separadamente.')).toBeInTheDocument();
  expect(screen.queryByText(/inclusive Administrador/)).not.toBeInTheDocument();
});

test('e-mail apenas digitado, sem opção selecionada, não cria vínculo automaticamente', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [], total: 0, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' }), { target: { value: 'inexistente@empresa.org' } });
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Obrigação sem responsável' } });
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ responsavelId: null }));
});


test('dropdown de responsáveis lista e-mails compactos e permite mouse, teclado e remoção', async () => {
  const pessoas = [
    { id: '11111111-1111-4111-8111-111111111111', nome: 'Ana QA', email: 'ana@empresa.test' },
    { id: '22222222-2222-4222-8222-222222222222', nome: 'Bruno QA', email: 'bruno@empresa.test' },
    { id: '33333333-3333-4333-8333-333333333333', nome: 'Carla QA', email: 'carla@empresa.test' },
  ];
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: pessoas, total: 503, pagina: 1, totalPaginas: 26 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Abrir lista de responsáveis' }));
  await waitFor(() => expect(within(screen.getByRole('listbox', { name: 'E-mails encontrados' })).getAllByRole('option')).toHaveLength(3));
  expect(screen.queryByText('Ana QA')).not.toBeInTheDocument();
  expect(screen.getByText(/refine pelo e-mail/i)).toBeInTheDocument();
  const campo = screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' });
  fireEvent.keyDown(campo, { key: 'ArrowDown' });
  fireEvent.keyDown(campo, { key: 'ArrowDown' });
  expect(screen.getByRole('option', { name: /bruno@empresa.test/ })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(campo, { key: 'Enter' });
  expect(screen.getByText('bruno@empresa.test')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remover atribuição' }));
  fireEvent.click(screen.getByRole('button', { name: 'Abrir lista de responsáveis' }));
  const opcao = await screen.findByRole('option', { name: /carla@empresa.test/ });
  fireEvent.click(opcao);
  expect(screen.getByText('carla@empresa.test')).toBeInTheDocument();
  expect(screen.queryByText('11111111-1111-4111-8111-111111111111')).not.toBeInTheDocument();
});


test('responsável cadastral pode ser Administrador ativo, sem incluí-lo em Funcionários', async () => {
  const usuario = { id: '44444444-4444-4444-8444-444444444444', nome: 'Admin de QA', email: 'admin@teste.local' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [usuario], total: 1, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Buscar responsável por e-mail' }), { target: { value: 'admin@' } });
  const opcao = await screen.findByRole('option', { name: /admin@teste.local/ });
  fireEvent.click(opcao);
  expect(screen.getByText('admin@teste.local')).toBeInTheDocument();
  expect(screen.queryByText(usuario.id)).not.toBeInTheDocument();
});


test('edição de entregável não repete o checklist; arquivar é ação separada à esquerda', () => {
  const item = {
    id: 'item-qa', contratoId: 'contrato-qa', etapaId: 'etapa-qa', nome: 'Visita técnica', codigo: null,
    tipo: 'UNICO' as const, descricao: null, responsavelId: null, responsavel: null,
    inicioPrevisto: null, terminoPrevisto: null, quantidadePrevista: null, quantidadeRealizada: null,
    unidadeMedida: null, periodicidade: null, configuracaoPeriodicidade: null, peso: null,
    criterioConclusao: null, statusExecucao: null, percentualExecucao: null,
    situacaoComprovacao: null, observacoes: null,
    evidenciasEsperadas: [{ id: 'evidencia-qa', tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true }],
  };
  const onArquivar = jest.fn();
  render(<FormularioEntregavel etapaId="etapa-qa" contratoId="contrato-qa" inicial={item}
    onSalvar={jest.fn()} onCancelar={jest.fn()} onArquivar={onArquivar} />);
  expect(screen.queryByRole('region', { name: 'Evidências do entregável' })).not.toBeInTheDocument();
  expect(screen.queryByText('Relatório')).not.toBeInTheDocument();
  const acoes = screen.getByRole('group', { name: 'Ações de edição do entregável' });
  fireEvent.click(within(acoes).getByRole('button', { name: 'Arquivar entregável' }));
  expect(onArquivar).toHaveBeenCalledTimes(1);
  expect(within(acoes).getByRole('button', { name: 'Salvar alterações' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Remover evidência esperada 1' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Adicionar evidência esperada' })).not.toBeInTheDocument();
});


test('opção explícita de entrega no mesmo dia sincroniza as datas sem presumir término', () => {
  render(<FormularioEntregavel etapaId="etapa-1" onSalvar={gravar} onCancelar={cancelar} />);
  const inicio = screen.getByLabelText('Início previsto') as HTMLInputElement;
  const fim = screen.getByLabelText('Término previsto') as HTMLInputElement;
  fireEvent.change(inicio, { target: { value: '2026-11-12' } });
  expect(fim.value).toBe('');
  fireEvent.click(screen.getByRole('checkbox', { name: /Mesma data do início/ }));
  expect(screen.queryByLabelText('Término previsto')).not.toBeInTheDocument();
  fireEvent.change(inicio, { target: { value: '2026-11-13' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Mesma data do início/ }));
  expect(screen.getByLabelText('Término previsto')).toHaveValue('');
});


test('nega edição de peso, datas e periodicidade recorrente sem delegação granular', () => {
  render(<FormularioEntregavel etapaId="etapa-a" inicial={{ ...item, inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-11-30', peso: '20' }}
    onSalvar={gravar} onCancelar={cancelar} podeConfigurarPesos={false} podeReplanejarOcorrencias={false} />);
  expect(screen.getByLabelText('Peso operacional (%) *')).toBeDisabled();
  expect(screen.getByLabelText('Periodicidade *')).toBeDisabled();
  expect(screen.getByLabelText('Início previsto *')).toBeDisabled();
  expect(screen.getByLabelText('Término previsto')).toBeDisabled();
  expect(screen.getByLabelText('Nome *')).toBeEnabled();
  expect(screen.getByText(/Somente leitura: requer permissão Configurar pesos/)).toBeInTheDocument();
});

test('delegações específicas liberam campos sem torná-los obrigatórios para outras permissões', () => {
  render(<FormularioEntregavel etapaId="etapa-a" inicial={{ ...item, inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-11-30', peso: '20' }}
    onSalvar={gravar} onCancelar={cancelar} podeConfigurarPesos podeReplanejarOcorrencias />);
  expect(screen.getByLabelText('Peso operacional (%) *')).toBeEnabled();
  expect(screen.getByLabelText('Periodicidade *')).toBeEnabled();
  expect(screen.getByLabelText('Início previsto *')).toBeEnabled();
});
