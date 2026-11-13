import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioContrato } from './formulario-contrato';
import type { Contrato } from '@/lib/contratos';
const inicial: Contrato = {
  id: '11111111-1111-4111-8111-111111111111', codigoPublico: '00427', numeroContrato: '001/2026', processoAdministrativo: null,
  orgaoContratante: 'UTFPR', unidadeResponsavel: null, objeto: 'Prestação de serviços', descricao: null,
  dataAssinatura: null, inicioVigencia: '2026-10-17', terminoVigencia: '2027-10-16', status: 'PLANEJAMENTO',
  responsavelInternoId: null, fiscalGestor: null, modoCalculo: 'SIMPLES', observacoes: null,
};

test('cadastro usa campos reais, nenhum PDF fictício nem save desabilitado', () => {
  const { container } = render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Cadastrar contrato' })).toBeEnabled();
  expect(screen.getByLabelText('Número do contrato *')).toBeInTheDocument();
  expect(screen.getByLabelText('Responsável pelo contrato (opcional)')).toBeInTheDocument();
  // O cadastro persiste o contrato antes do upload; o arquivo não faz parte deste POST.
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.getByRole('note')).toHaveTextContent(/O contrato será salvo primeiro/i);
});

test('edição envia payload DTO sem id e sem string vazia em data de assinatura', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={salvar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  const enviado = salvar.mock.calls[0][0];
  expect(enviado).not.toHaveProperty('id');
  expect(enviado).not.toHaveProperty('codigoPublico');
  expect(enviado.dataAssinatura).toBeNull();
  expect(enviado.numeroContrato).toBe('001/2026');
});

test('fim de mês ambíguo exige escolha da data final', () => {
  render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Início da vigência *'), { target: { value: '2026-01-31' } });
  fireEvent.click(screen.getByRole('button', { name: 'Duração em meses' }));
  fireEvent.change(screen.getByLabelText('Duração em meses *'), { target: { value: '1' } });
  expect(screen.getByLabelText('Data de término explícita *')).toBeInTheDocument();
});


test('cadastro vazio mostra erro da aplicação em vez do balão de validação do navegador', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  const { container } = render(<FormularioContrato responsaveis={[]} onSalvar={salvar} />);
  expect(container.querySelector('form')).toHaveAttribute('novalidate');
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar contrato' }));
  expect(await screen.findByText('Número do contrato é obrigatório.')).toBeInTheDocument();
  expect(screen.getByLabelText('Número do contrato *')).toHaveAttribute('aria-invalid', 'true');
  expect(salvar).not.toHaveBeenCalled();
});


test('limites de caracteres e mensagens explicativas de modo de cálculo', () => {
  render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByLabelText('Objeto *')).toHaveAttribute('maxLength', '50');
  expect(screen.queryByLabelText('Modo de cálculo físico *')).not.toBeInTheDocument();
  expect(screen.getByText(/é configurado na aba Execução/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Informações complementares/));
  expect(screen.getByLabelText('Descrição')).toHaveAttribute('maxLength', '500');
  expect(screen.getByLabelText('Observações')).toHaveAttribute('maxLength', '200');
});

test('edicao nao reutiliza silenciosamente termino antigo em duracao ambigua', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<FormularioContrato inicial={{ ...inicial, inicioVigencia: '2026-01-31', terminoVigencia: '2027-01-30' }} responsaveis={[]} onSalvar={salvar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Duração em meses' }));
  fireEvent.change(screen.getByLabelText('Duração em meses *'), { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  expect(await screen.findByText(/Confirme explicitamente o término/)).toBeInTheDocument();
  expect(salvar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText(/Confirmo a data de término explícita/));
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0][0].terminoVigencia).toBe('2027-01-30');
});


test('responsável fora da lista aparece como Não atribuído sem expor ID nem apagar vínculo ao editar outro campo', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  const idAnterior = '22222222-2222-4222-8222-222222222222';
  render(<FormularioContrato inicial={{ ...inicial, responsavelInternoId: idAnterior }} responsaveis={[]} onSalvar={salvar} />);
  const seletor = screen.getByLabelText('Responsável pelo contrato (opcional)') as HTMLSelectElement;
  expect(seletor).toHaveValue('');
  expect(seletor).toHaveTextContent('Não atribuído');
  expect(seletor).not.toHaveTextContent(/identificador reservado/i);
  fireEvent.change(screen.getByLabelText('Número do contrato *'), { target: { value: '1232026' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0][0].responsavelInternoId).toBe(idAnterior);
});

test('seleção explícita de Não atribuído remove vínculo anterior não selecionável', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<FormularioContrato inicial={{ ...inicial, responsavelInternoId: '22222222-2222-4222-8222-222222222222' }} responsaveis={[]} onSalvar={salvar} />);
  const seletor = screen.getByLabelText('Responsável pelo contrato (opcional)');
  // A seleção nativa já mostra a opção neutra; change explícito sinaliza
  // intenção de remover a atribuição, sem depender de valor reservado.
  fireEvent.change(seletor, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0][0].responsavelInternoId).toBeNull();
});


test('responsável ativo presente na lista segue identificado pelo nome, sem fallback', () => {
  const id = '22222222-2222-4222-8222-222222222222';
  const responsavel = { id, nome: 'Gestor Exemplo', email: 'gestor@example.com', perfil: 'GESTOR' as const, ativo: true, criadoEm: '2026-11-01T00:00:00.000Z' };
  render(<FormularioContrato inicial={{ ...inicial, responsavelInternoId: id }} responsaveis={[responsavel]} onSalvar={jest.fn()} />);
  const seletor = screen.getByLabelText('Responsável pelo contrato (opcional)');
  expect(seletor).toHaveValue(id);
  expect(seletor).toHaveTextContent('gestor@example.com');
  expect(seletor).not.toHaveTextContent(/identificador reservado/i);
});

test('TEC08: operações especiais são listadas no próprio status apenas com permissão', () => {
  const view = render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByLabelText('Status operacional *')).not.toHaveTextContent('Suspenso');
  expect(screen.getByLabelText('Status operacional *')).not.toHaveTextContent('Cancelado');
  view.rerender(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={jest.fn()} podeSuspender podeCancelar />);
  expect(screen.getByLabelText('Status operacional *')).toHaveTextContent('Suspenso');
  expect(screen.getByLabelText('Status operacional *')).toHaveTextContent('Cancelado');
});

test('TEC08: permissão exclusiva de suspensão não habilita edição dos demais dados', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={salvar} podeSuspender somenteSituacao />);
  expect(screen.queryByLabelText('Número do contrato *')).not.toBeInTheDocument();
  const status = screen.getByLabelText('Status operacional *');
  expect(status).toHaveTextContent('Suspenso');
  expect(status).not.toHaveTextContent('Cancelado');
  fireEvent.change(status, { target: { value: 'SUSPENSO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ status: 'SUSPENSO' })));
});


test('encerramento antecipado não deriva da edição ou da conclusão; exige permissão própria', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  const view = render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={salvar} />);
  const status = screen.getByLabelText('Status operacional *');
  expect(status).not.toHaveTextContent('Encerrar antecipadamente');
  view.rerender(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={salvar} podeEncerrar somenteSituacao />);
  expect(screen.getByLabelText('Status operacional *')).toHaveTextContent('Encerrar');
  fireEvent.change(screen.getByLabelText('Status operacional *'), { target: { value: 'ENCERRADO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ status: 'ENCERRADO' })));
});


test('editar texto ou fase durante revisão mantém a revisão sem retomar operação implicitamente', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  const revisao = { ...inicial, status: 'PLANEJAMENTO' as const, reabertoEm: '2026-11-08T09:00:00Z' };
  const tela = render(<FormularioContrato inicial={revisao} responsaveis={[]} onSalvar={salvar} />);
  expect(screen.getByLabelText('Status operacional *')).toHaveValue('PLANEJAMENTO');
  fireEvent.change(screen.getByLabelText('Número do contrato *'), { target: { value: '2026002' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0][0]).not.toHaveProperty('retomarOperacao');
  tela.unmount();
  salvar.mockClear();
  render(<FormularioContrato inicial={revisao} responsaveis={[]} onSalvar={salvar} />);
  fireEvent.change(screen.getByLabelText('Status operacional *'), { target: { value: 'EM_EXECUCAO' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  expect(salvar.mock.calls[0][0]).toEqual(expect.objectContaining({ status: 'EM_EXECUCAO' }));
  expect(salvar.mock.calls[0][0]).not.toHaveProperty('retomarOperacao');
});


test('diferencia visualmente cadastro verde de edição contextual sem alterar a validação', () => {
  const nova = render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByRole('form', { name: 'Cadastrar contrato' })).toHaveAttribute('data-tec08-criacao', 'true');
  expect(screen.getByRole('button', { name: 'Cadastrar contrato' })).toHaveAttribute('aria-busy', 'false');
  nova.unmount();
  render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByRole('form', { name: 'Editar dados do contrato' })).toHaveAttribute('data-tec08-edicao', 'true');
  expect(screen.getByRole('button', { name: 'Salvar alterações' })).toHaveAttribute('aria-busy', 'false');
});

test('campo número só admite algarismos em novo cadastro', () => {
  render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  const numero = screen.getByLabelText('Número do contrato *') as HTMLInputElement;
  fireEvent.change(numero, { target: { value: '2026/001-A' } });
  expect(numero.value).toBe('2026001');
  expect(numero).toHaveAttribute('inputMode', 'numeric');
});
