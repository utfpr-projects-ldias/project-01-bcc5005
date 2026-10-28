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
  render(<FormularioContrato responsaveis={[]} onSalvar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Cadastrar contrato' })).toBeEnabled();
  expect(screen.getByLabelText('Número do contrato *')).toBeInTheDocument();
  expect(screen.getByLabelText('Responsável interno (usuário ativo)')).toBeInTheDocument();
  expect(screen.getByText(/Nenhum arquivo é enviado/)).toBeInTheDocument();
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
