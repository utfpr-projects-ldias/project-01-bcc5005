import { render, screen } from '@testing-library/react';
import { AnelProgresso } from './anel-progresso';

test('anel violeta indica percentual real sem barra horizontal', () => {
  render(<AnelProgresso atual={10} total={10} rotulo="Computadores"/>);
  expect(screen.getByRole('progressbar', {name:/Computadores: 10 de 10/})).toHaveAttribute('aria-valuenow','100');
  expect(screen.getByText('100%')).toBeInTheDocument();
});

test('0 de 0 significa não exigido, sem divisão por zero ou 100% fictício', () => {
  render(<AnelProgresso atual={0} total={0} rotulo="Evidências"/>);
  expect(screen.getByRole('img',{name:'Evidências: não exigido'})).toBeInTheDocument();
  expect(screen.queryByText('100%')).not.toBeInTheDocument();
});
