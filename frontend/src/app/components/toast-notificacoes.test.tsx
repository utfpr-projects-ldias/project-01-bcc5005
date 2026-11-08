import { act, fireEvent, render, screen } from '@testing-library/react';
import { ToastNotificacoes, toastSucesso, toastErro, toastAviso } from './toast-notificacoes';

test('mostra toast de sucesso sem inserir banner no layout, permite dispensar', () => {
  render(<ToastNotificacoes />);
  act(() => toastSucesso('Planejamento atualizado.'));
  expect(screen.getByRole('status')).toHaveTextContent('Planejamento atualizado.');
  expect(screen.getByRole('status').parentElement).toHaveClass('fixed');
  fireEvent.click(screen.getByRole('button', { name: 'Fechar notificação' }));
  expect(screen.queryByText('Planejamento atualizado.')).not.toBeInTheDocument();
});

test('falhas recebem role alert e aviso pode coexistir com sucesso', () => {
  render(<ToastNotificacoes />);
  act(() => { toastErro('Sem permissão'); toastAviso('Confira os dados'); });
  expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão');
  expect(screen.getByRole('status')).toHaveTextContent('Confira os dados');
});


test('notificações repetidas se consolidam e o painel é compacto sem ocupar o fluxo da tela', () => {
  render(<ToastNotificacoes />);
  act(() => { toastSucesso('Arquivo arquivado.'); toastSucesso('Arquivo arquivado.'); });
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.getByRole('status')).toHaveClass('backdrop-blur-lg');
  expect(screen.getByLabelText('Notificações')).toHaveClass('pointer-events-none');
});
