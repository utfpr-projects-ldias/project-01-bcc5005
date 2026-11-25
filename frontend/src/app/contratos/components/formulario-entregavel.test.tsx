import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { FormularioEntregavel } from './formulario-entregavel';
import type { Entregavel } from '@/lib/entregaveis';
const gravar = jest.fn().mockResolvedValue(undefined);
const cancelar = jest.fn();
beforeEach(() => { jest.clearAllMocks(); gravar.mockResolvedValue(undefined); });
function preencherInicio() { fireEvent.change(screen.getByLabelText('Início previsto *'), { target: { value: '2026-11-01' } }); }
const montar = (inicial?: Entregavel) => render(<FormularioEntregavel etapaId="etapa-a" inicial={inicial} onSalvar={gravar} onCancelar={cancelar} podeConfigurarPesos podeReplanejarOcorrencias />);
const item: Entregavel = {
  id: 'e1', contratoId: 'contrato', etapaId: 'etapa-a', nome: 'Manutenção', tipo: 'RECORRENTE',
  codigo: null, descricao: null, responsavelId: null, inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-11-30',
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
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  if (screen.queryByRole('button', { name: 'Entendi' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entendi' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'UNICO', peso: '20', quantidadePrevista: null, periodicidade: null, evidenciasEsperadas: [] }));
});
test('peso operacional obrigatório aceita soma provisória e impede valor acima de 100', async () => {
  montar();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Projeto' } });
  preencherInicio();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '101' } });
  expect(screen.getByLabelText('Peso operacional (%) *')).toHaveValue('100');
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '0' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' }));
  expect(gravar).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '18.25' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  if (screen.queryByRole('button', { name: 'Entendi' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entendi' })); });
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
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  if (screen.queryByRole('button', { name: 'Entendi' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entendi' })); });
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
test('responsável é único, opcional e escolhido por nome ou e-mail sem expor UUID', async () => {
  const usuario = { id: '12345678-1234-4123-8123-123456789abc', nome: 'Maria da Silva', email: 'maria@example.org' };
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [usuario], total: 1, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  expect(screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' })).toBeInTheDocument();
  expect(screen.queryByText(/Nenhum responsável atribuído/)).not.toBeInTheDocument();
  const busca = screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' });
  fireEvent.change(busca, { target: { value: 'maria@' } });
  const opcao = await screen.findByRole('option', { name: /maria@example.org/ });
  fireEvent.click(opcao);
  expect(screen.getByText('maria@example.org')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Remover atribuição' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Entregável da equipe' } });
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  if (screen.queryByRole('button', { name: 'Entendi' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entendi' })); });
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({ responsavelId: usuario.id }));
  fireEvent.click(screen.getByRole('button', { name: 'Remover atribuição' }));
  expect(screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' })).toBeInTheDocument();
});

test('explica a atribuição do responsável sem termos administrativos nem prometer acesso automático', () => {
  montar();
  expect(screen.getByText('Escolha a pessoa que acompanhará esta entrega. O acesso ao contrato é configurado separadamente.')).toBeInTheDocument();
  expect(screen.queryByText(/inclusive Administrador/)).not.toBeInTheDocument();
});

test('e-mail apenas digitado, sem opção selecionada, não cria vínculo automaticamente', async () => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({ itens: [], total: 0, pagina: 1, totalPaginas: 1 }) });
  render(<FormularioEntregavel contratoId="contrato-a" etapaId="etapa-a" onSalvar={gravar} onCancelar={cancelar} />);
  fireEvent.change(screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' }), { target: { value: 'inexistente@empresa.org' } });
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Obrigação sem responsável' } });
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '20' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  if (screen.queryByRole('button', { name: 'Entendi' })) await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entendi' })); });
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
  await waitFor(() => expect(within(screen.getByRole('listbox', { name: 'Responsáveis encontrados' })).getAllByRole('option')).toHaveLength(3));
  expect(screen.getByRole('option', {name: /Ana QA/})).toBeInTheDocument();
  expect(screen.getByText(/refine a busca pelo nome ou e-mail/i)).toBeInTheDocument();
  const campo = screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' });
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
  fireEvent.change(screen.getByRole('combobox', { name: 'Responsável pelo entregável (opcional)' }), { target: { value: 'admin@' } });
  const opcao = await screen.findByRole('option', { name: /admin@teste.local/ });
  fireEvent.click(opcao);
  expect(screen.getByText('admin@teste.local')).toBeInTheDocument();
  expect(screen.queryByText(usuario.id)).not.toBeInTheDocument();
});


test('edição de entregável não repete o checklist; arquivar é ação separada à esquerda', () => {
  const item = {
    id: 'item-qa', contratoId: 'contrato-qa', etapaId: 'etapa-qa', nome: 'Visita técnica', codigo: null,
    tipo: 'UNICO' as const, descricao: null, responsavelId: null, responsavel: null,
    inicioPrevisto: '2026-11-01', terminoPrevisto: '2026-11-30', quantidadePrevista: null, quantidadeRealizada: null,
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
  const inicio = screen.getByLabelText('Início previsto *') as HTMLInputElement;
  const fim = screen.getByLabelText('Término previsto') as HTMLInputElement;
  fireEvent.change(inicio, { target: { value: '2026-11-12' } });
  expect(fim.value).toBe('');
  fireEvent.click(screen.getByRole('checkbox', { name: /Mesma data do início/ }));
  expect(screen.queryByLabelText('Término previsto')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Data prevista *'), { target: { value: '2026-11-13' } });
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


test('peso ponderado considera saldo de todo contrato e devolve peso do próprio item na edição', async () => {
  const pesos = [{ id: 'a', peso: '25', arquivadoEm: null }, { id: 'b', peso: '50', arquivadoEm: null }];
  render(<FormularioEntregavel etapaId="etapa-a" modoCalculo="PONDERADO" pesosContrato={pesos} onSalvar={gravar} onCancelar={cancelar} />);
  expect(screen.getByText('25,00%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome *'), { target: { value: 'Novo serviço' } });
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), { target: { value: '30' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cadastrar entregável' })); });
  expect(screen.queryByRole('button', { name: 'Entendi' })).not.toBeInTheDocument();
  expect(gravar).not.toHaveBeenCalled();
  expect(screen.getByText(/Disponível apenas 25%/)).toBeInTheDocument();
});

test('seletor de tipos mantém escolha exclusiva e campos de planejamento dinâmicos',()=>{
  montar();
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  fireEvent.click(screen.getByRole('radio',{name:'Quantitativo'}));
  expect(screen.getByLabelText('Quantidade prevista *')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('radio',{name:'Recorrente'}));
  expect(screen.getByLabelText('Periodicidade *')).toBeInTheDocument();
  expect(screen.queryByLabelText('Quantidade prevista *')).not.toBeInTheDocument();
});


test('Média simples informa saldo ponderado real, exige ciência antes de cadastrar e preserva o peso', async () => {
  render(<FormularioEntregavel etapaId="etapa-a" modoCalculo="SIMPLES" pesosContrato={[{id:'outro',peso:'20'}]} onSalvar={gravar} onCancelar={cancelar}/>);
  fireEvent.change(screen.getByLabelText('Nome *'), {target:{value:'Nova entrega'}});
  preencherInicio();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'), {target:{value:'30'}});
  expect(screen.getByText('50,00%')).toBeInTheDocument();
  expect(screen.getByText(/não tem efeito na Média simples/)).toBeInTheDocument();
  await act(async()=>{fireEvent.click(screen.getByRole('button',{name:'Cadastrar entregável'}));});
  expect(gravar).not.toHaveBeenCalled();
  const aviso=screen.getByRole('dialog',{name:'Peso operacional informativo'});
  expect(within(aviso).getAllByRole('button')).toHaveLength(1);
  await act(async()=>{fireEvent.click(within(aviso).getByRole('button',{name:'Entendi'}));});
  expect(gravar).toHaveBeenCalledTimes(1);
  expect(gravar).toHaveBeenCalledWith(expect.objectContaining({peso:'30'}));
});

test('saldo na edição substitui o próprio peso sem somá-lo duas vezes',()=>{
  render(<FormularioEntregavel etapaId="etapa-a" modoCalculo="PONDERADO" inicial={{...item,peso:'20'}} pesosContrato={[{id:item.id,peso:'20'}]} onSalvar={gravar} onCancelar={cancelar} podeConfigurarPesos/>);
  expect(screen.getByText('80,00%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'),{target:{value:'0'}});
  expect(screen.getByText('100,00%')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Peso operacional (%) *'),{target:{value:'45'}});
  expect(screen.getByText('55,00%')).toBeInTheDocument();
});
