import { fireEvent, render, screen } from '@testing-library/react';
import { FormularioRequisitosOcorrencia, type RequisitosOcorrencia } from './requisitos-ocorrencia';

const inicial: RequisitosOcorrencia = {
  minimoAtividadesVerificadas: 0, minimoEvidenciasVerificadas: 0,
  evidenciaExigida: 'NENHUMA', permiteEncerramentoExcepcional: true,
};

test('os dois contadores começam vazios com placeholder 0 e botões acessíveis', () => {
  const onChange = jest.fn();
  render(<FormularioRequisitosOcorrencia valor={inicial} onChange={onChange} />);
  expect(screen.getByRole('spinbutton', { name: 'Atividades verificadas exigidas' })).toHaveAttribute('placeholder', '0');
  expect(screen.getByRole('spinbutton', { name: 'Evidências verificadas exigidas' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Aumentar atividades verificadas exigidas' }));
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ minimoAtividadesVerificadas: 1 }));
});

test('escolher fotografia e relatório estabelece um mínimo coerente de dois arquivos', () => {
  const onChange = jest.fn();
  render(<FormularioRequisitosOcorrencia valor={inicial} onChange={onChange} />);
  fireEvent.change(screen.getByRole('combobox', { name: /Formato de evidência/ }), { target: { value: 'AMBOS' } });
  expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
    evidenciaExigida: 'AMBOS', minimoEvidenciasVerificadas: 2,
  }));
});
