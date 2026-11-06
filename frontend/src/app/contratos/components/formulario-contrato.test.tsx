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
  expect(screen.getByLabelText('Objeto *')).toHaveAttribute('maxLength', '500');
  expect(screen.getByText(/média dos percentuais de execução/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Modo de cálculo físico *'), { target: { value: 'PONDERADO' } });
  expect(screen.getByText(/pesos válidos deverão somar 100%/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Informações complementares/));
  expect(screen.getByLabelText('Descrição')).toHaveAttribute('maxLength', '1500');
  expect(screen.getByLabelText('Observações')).toHaveAttribute('maxLength', '1000');
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
  fireEvent.change(screen.getByLabelText('Número do contrato *'), { target: { value: '123/2026' } });
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
  expect(seletor).toHaveTextContent('Gestor Exemplo');
  expect(seletor).not.toHaveTextContent(/identificador reservado/i);
});
