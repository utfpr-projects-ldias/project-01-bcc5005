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


it('Reabrir executa a transição diretamente, sem um menu de seleção redundante', () => {
  const reabrir = jest.fn();
  render(<MenuAcoesObjeto rotulo="Reabrir" acaoDireta={reabrir}><button type="button">Reabrir</button></MenuAcoesObjeto>);
  fireEvent.click(screen.getByRole('button', { name: 'Reabrir' }));
  expect(reabrir).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('menu')).not.toBeInTheDocument();
});

it('estado pendente de conclusão usa checklist violeta sem aprovar automaticamente', () => {
  const aprovar = jest.fn();
  render(<MenuAcoesObjeto rotulo="Fechar" pendenteConclusao><button type="button" onClick={aprovar}>Aprovar</button></MenuAcoesObjeto>);
  const botao = screen.getByRole('button', { name: 'Fechar: escolher ação' });
  expect(botao).toHaveAttribute('data-pi-controle-fechamento', 'pendente-conclusao');
  fireEvent.click(botao);
  expect(aprovar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }));
  expect(aprovar).toHaveBeenCalledTimes(1);
});
