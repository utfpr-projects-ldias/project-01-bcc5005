import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FormularioContrato } from './formulario-contrato';
import type { Contrato } from '@/lib/contratos';
const inicial: Contrato = {
  id: '11111111-1111-4111-8111-111111111111', numeroContrato: '001/2026', processoAdministrativo: null,
  orgaoContratante: 'UTFPR', unidadeResponsavel: null, objeto: 'Prestação de serviços', descricao: null,
  dataAssinatura: null, inicioVigencia: '2026-10-17', terminoVigencia: '2027-10-16', status: 'PLANEJAMENTO',
  responsavelInternoId: null, fiscalGestor: null, modoCalculo: 'SIMPLES', observacoes: null,
};

test('cadastro usa campos reais, nenhum PDF fictício nem save desabilitado', () => {
  const { container } = render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Cadastrar contrato' })).toBeEnabled();
  expect(screen.getByLabelText('Número do contrato *')).toBeInTheDocument();
  expect(screen.getByLabelText('Responsável interno (usuário ativo)')).toBeInTheDocument();
  // Anexos ainda não têm upload nesta etapa: nenhum controle de arquivo deve existir.
  expect(container.querySelector('input[type="file"]')).toBeNull();
  expect(screen.getByRole('note')).toHaveTextContent(/Anexos ainda não podem ser enviados/i);
});

test('edição envia payload DTO sem id e sem string vazia em data de assinatura', async () => {
  const salvar = jest.fn().mockResolvedValue(undefined);
  render(<FormularioContrato inicial={inicial} responsaveis={[]} onSalvar={salvar} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(salvar).toHaveBeenCalledTimes(1));
  const enviado = salvar.mock.calls[0][0];
  expect(enviado).not.toHaveProperty('id');
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
  expect(screen.getByLabelText('Descrição')).toHaveAttribute('maxLength', '3000');
  expect(screen.getByLabelText('Observações')).toHaveAttribute('maxLength', '2000');
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
