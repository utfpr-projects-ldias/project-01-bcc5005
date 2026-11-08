import { act, fireEvent, render, screen } from '@testing-library/react';
import { AbasRolaveis } from './abas-rolaveis';

test('mantém semântica acessível, uma faixa rolável e sinaliza páginas no celular', () => {
  render(<AbasRolaveis><div role="tablist" aria-label="Abas de exemplo">
    <button role="tab" aria-selected="true">Todos</button>
    <button role="tab" aria-selected="false">Suspensos</button>
    <button role="tab" aria-selected="false">Arquivados</button>
  </div></AbasRolaveis>);
  const tabs = screen.getByRole('tablist', { name: 'Abas de exemplo' });
  const faixa = tabs.closest('.tec08-abas-rolagem') as HTMLDivElement;
  expect(faixa).toBeInTheDocument();
  Object.defineProperty(faixa, 'clientWidth', { configurable: true, value: 180 });
  Object.defineProperty(faixa, 'scrollWidth', { configurable: true, value: 540 });
  Object.defineProperty(faixa, 'scrollLeft', { configurable: true, writable: true, value: 0 });
  act(() => { fireEvent.scroll(faixa); });
  expect(screen.queryByText('Deslize para ver mais')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Próximo grupo de abas' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Próximo grupo de abas' }));
  expect(screen.getByRole('button', { name: 'Grupo de abas anterior' })).toBeEnabled();
  expect(screen.getAllByRole('tab')).toHaveLength(3);
  faixa.scrollLeft = 360;
  act(() => { fireEvent.scroll(faixa); });
  expect(screen.getAllByRole('tab')).toHaveLength(3);
});
