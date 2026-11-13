import { fireEvent, render, screen } from '@testing-library/react';
import { FormularioEntregavel } from './formulario-entregavel';
it('cadastro foca planejamento do entregável e tipo operacional fica na engrenagem', () => {
  render(<FormularioEntregavel etapaId="qa" onSalvar={jest.fn()} onCancelar={jest.fn()} />);
  expect(screen.queryByLabelText('Tipo *')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Periodicidade fixa *')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Adicionar evidência esperada/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Mesma data do início/ }));
  expect(screen.getByLabelText('Data prevista')).toBeInTheDocument();
  expect(screen.queryByLabelText('Término previsto')).not.toBeInTheDocument();
});
