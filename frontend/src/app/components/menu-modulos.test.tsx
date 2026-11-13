import { renderComConsultas } from '@/test-utils';
import { screen } from '@testing-library/react';
import { MenuLateral, MenuMobile } from './menu-modulos';

jest.mock('next/navigation', () => ({ usePathname: () => '/admin' }));

test('menu contém apenas os quatro módulos de navegação', () => {
  renderComConsultas(<MenuLateral />);
  const menu = screen.getByRole('navigation');
  expect(Array.from(menu.querySelectorAll('a')).map(link => link.getAttribute('href'))).toEqual(['/dashboard','/contratos','/relatorios','/admin']);
  expect(screen.getByRole('link', { name: 'Administração' })).toHaveAttribute('aria-current','page');
  expect(screen.queryByRole('link', { name: 'Ocorrências' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Atividades' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Evidências' })).not.toBeInTheDocument();
});
test('menu mobile também mantém os quatro links', () => {
  renderComConsultas(<MenuMobile />);
  const menu = screen.getByRole('navigation', { name: 'Navegação móvel' });
  expect(Array.from(menu.querySelectorAll('a')).map(link => link.getAttribute('href'))).toEqual(['/dashboard','/contratos','/relatorios','/admin']);
});
