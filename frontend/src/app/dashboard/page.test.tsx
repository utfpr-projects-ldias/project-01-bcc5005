import { render, screen } from '@testing-library/react';
import DashboardPage from './page';

test('dashboard mantém apenas conteúdo e não duplica cabeçalho ou navegação', () => {
  render(<DashboardPage />);
  expect(screen.getByText('Bem-vindo ao Painel')).toBeInTheDocument();
  expect(screen.getByText('Contratos Ativos')).toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Navegação móvel' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Sair' })).not.toBeInTheDocument();
});
