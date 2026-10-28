import { fireEvent, render, screen, within } from '@testing-library/react';
import { ConfirmacaoSimples } from './confirmacao-simples';

test('confirmação simples abre com foco em cancelar, fecha por Escape e confirma apenas ao clicar', () => {
  const confirmar = jest.fn();
  const cancelar = jest.fn();
  render(<ConfirmacaoSimples titulo="Arquivar?" descricao="Preserva histórico" confirmar="Arquivar" onCancelar={cancelar} onConfirmar={confirmar} perigoso />);
  const dialogo = screen.getByRole('dialog', { name: 'Arquivar?' });
  expect(within(dialogo).getByRole('button', { name: 'Cancelar' })).toHaveFocus();
  expect(confirmar).not.toHaveBeenCalled();
  fireEvent.keyDown(dialogo.parentElement!, { key: 'Escape' });
  expect(cancelar).toHaveBeenCalledTimes(1);
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Arquivar' }));
  expect(confirmar).toHaveBeenCalledTimes(1);
});
