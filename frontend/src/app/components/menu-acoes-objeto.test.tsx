import { fireEvent, render, screen } from '@testing-library/react';
import { MenuAcoesObjeto } from './menu-acoes-objeto';

it('não cria menu vazio quando todas as transições forem negadas', () => {
  render(<MenuAcoesObjeto><>{false}{null}</></MenuAcoesObjeto>);
  expect(screen.queryByRole('button', { name: /Fechar: escolher ação/ })).not.toBeInTheDocument();
});

it('abre opções e Escape fecha apenas o menu, com foco restaurado', () => {
  const suspender = jest.fn();
  render(<MenuAcoesObjeto><button type="button" onClick={suspender}>Suspender</button><button type="button">Arquivar</button></MenuAcoesObjeto>);
  const gatilho = screen.getByRole('button', { name: 'Fechar: escolher ação' });
  fireEvent.click(gatilho);
  const menu = screen.getByRole('menu');
  expect(menu).toBeInTheDocument();
  fireEvent.keyDown(menu, { key: 'Escape' });
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  expect(gatilho).toHaveFocus();
  fireEvent.click(gatilho);
  fireEvent.click(screen.getByRole('button', { name: 'Suspender' }));
  expect(suspender).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});
