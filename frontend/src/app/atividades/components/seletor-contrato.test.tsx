import { fireEvent, render, screen } from '@testing-library/react';
import { SeletorContrato } from './seletor-contrato';

const itens = [
  { id: 'c1', codigoPublico: '00001', objeto: 'Gestão de manutenção' },
  { id: 'c2', codigoPublico: '00002', objeto: 'Serviços de laboratório' },
];

test('pesquisa por título sem acentos, permite teclado e mantém seleção', () => {
  const escolher = jest.fn();
  const { rerender } = render(<SeletorContrato contratos={itens} valor="" onChange={escolher} />);
  const campo = screen.getByRole('combobox', { name: 'Contrato' });
  expect(campo).toHaveAttribute('placeholder', 'Selecione um contrato...');
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: 'laboratorio' } });
  expect(screen.getByRole('option', { name: /Serviços de laboratório/ })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /Gestão de manutenção/ })).not.toBeInTheDocument();
  fireEvent.keyDown(campo, { key: 'Enter' });
  expect(escolher).toHaveBeenCalledWith('c2');
  rerender(<SeletorContrato contratos={itens} valor="c2" onChange={escolher} />);
  expect(campo).toHaveValue('00002 — Serviços de laboratório');
});

test('não mostra contratos fora da lista fornecida e permite limpar a seleção', () => {
  const escolher = jest.fn();
  render(<SeletorContrato contratos={[itens[0]]} valor="c1" onChange={escolher} />);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Contrato' }));
  expect(screen.queryByText(/Serviços de laboratório/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('option', { name: 'Limpar seleção' }));
  expect(escolher).toHaveBeenCalledWith('');
});
