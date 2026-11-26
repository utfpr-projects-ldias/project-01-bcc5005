import { fireEvent, render, screen } from '@testing-library/react';
import { FormularioEntregavel } from './formulario-entregavel';
it('cadastro foca planejamento do entregável e tipo operacional fica na engrenagem', () => {
  render(<FormularioEntregavel etapaId="qa" onSalvar={jest.fn()} onCancelar={jest.fn()} />);
  expect(screen.queryByLabelText('Tipo *')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Periodicidade fixa *')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Adicionar evidência esperada/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: /Mesma data do início/ }));
  expect(screen.getByLabelText('Data prevista *')).toBeInTheDocument();
  expect(screen.queryByLabelText('Término previsto')).not.toBeInTheDocument();
});

it('seleciona o tipo pelo cartão e apresenta os limites de vigência', () => {
  render(<FormularioEntregavel etapaId="qa" vigencia={{inicioVigencia:'2026-11-01',terminoVigencia:'2026-11-30'}} onSalvar={jest.fn()} onCancelar={jest.fn()} />);
  const radio=screen.getByRole('radio',{name:'Quantitativo'});
  fireEvent.click(radio.closest('label')!);
  expect(radio).toBeChecked();
  expect(screen.getByText('Vigência do contrato: 01/11/2026 a 30/11/2026')).toBeInTheDocument();
  expect(screen.getByLabelText('Início previsto *')).toHaveAttribute('min','2026-11-01');
  expect(screen.getByLabelText('Término previsto')).toHaveAttribute('max','2026-11-30');
});
