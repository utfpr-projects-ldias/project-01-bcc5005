import { fireEvent, render, screen } from '@testing-library/react';
import { BotaoAcaoModal, BotaoEditarModal } from './botoes-modal';

it('usa uma engrenagem sem borda decorativa e não executa edição desabilitada', () => {
  const editar = jest.fn();
  const tela = render(<BotaoEditarModal rotulo="Editar etapa" disabled onClick={editar}/>);
  const botao = screen.getByRole('button', { name: 'Editar etapa' });
  expect(botao).toBeDisabled();
  expect(botao).toHaveAttribute('data-pi-controle-modal', 'editar');
  fireEvent.click(botao);
  expect(editar).not.toHaveBeenCalled();
  tela.rerender(<BotaoEditarModal rotulo="Editar etapa" onClick={editar}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa' }));
  expect(editar).toHaveBeenCalledTimes(1);
});

it('preserva a intenção da transição sem usar a cor do objeto-pai', () => {
  render(<div data-tec08-estado="cancelado">
    <BotaoAcaoModal intencao="concluir">Solicitar conclusão</BotaoAcaoModal>
    <BotaoAcaoModal intencao="arquivar" disabled>Arquivar</BotaoAcaoModal>
  </div>);
  expect(screen.getByRole('button', { name: 'Solicitar conclusão' })).toHaveAttribute('data-pi-intencao', 'concluir');
  expect(screen.getByRole('button', { name: 'Arquivar' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Arquivar' })).toHaveAttribute('data-pi-intencao', 'arquivar');
});
