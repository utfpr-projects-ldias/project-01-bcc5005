import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
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

test('confirmação não perigosa usa texto contrastante sobre verde', () => {
  const { unmount } = render(<ConfirmacaoSimples titulo="Prosseguir?" descricao="Verificação" confirmar="Continuar" onCancelar={jest.fn()} onConfirmar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Continuar' })).toHaveClass('bg-brand-green', 'text-on-brand-green', 'hover:brightness-110');
  unmount();
});


test('verificação apresenta cancelar vermelho e confirmar verde, com dimensões consistentes', () => {
  render(<ConfirmacaoSimples titulo="Verificar?" descricao="Analisou o arquivo?" confirmar="Confirmar" cancelarVermelho aprovarVerde
    onCancelar={jest.fn()} onConfirmar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Cancelar' })).toHaveClass('bg-red-600', 'whitespace-nowrap', 'shrink-0');
  expect(screen.getByRole('button', { name: 'Confirmar' })).toHaveClass('bg-brand-green', 'shrink-0');
});


test('decisão de reabertura exige justificativa de 15 a 200 caracteres e mantém o cancelamento neutro', () => {
  const confirmar = jest.fn();
  const cancelar = jest.fn();
  function ComMotivo() {
    const [motivo, setMotivo] = useState('');
    return <ConfirmacaoSimples titulo="Reabrir item?" descricao="Decisão auditável" confirmar="Reabrir"
      justificativa={motivo} onJustificativaChange={setMotivo} onConfirmar={confirmar} onCancelar={cancelar} />;
  }
  render(<ComMotivo />);
  const botao = screen.getByRole('button', { name: 'Reabrir' });
  expect(botao).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificativa obrigatória/), { target: { value: 'curto' } });
  expect(botao).toBeDisabled();
  fireEvent.change(screen.getByLabelText(/Justificativa obrigatória/), { target: { value: 'x'.repeat(14) } });
  expect(botao).toBeDisabled();
  const motivo = 'Correção administrativa documentada após conferência dos registros.';
  fireEvent.change(screen.getByLabelText(/Justificativa obrigatória/), { target: { value: motivo } });
  expect(botao).toBeEnabled();
  fireEvent.click(botao);
  expect(confirmar).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Cancelar' })).not.toHaveClass('bg-red-600');
});


test('reabertura usa a cor da revisão mesmo partindo de contrato encerrado', () => {
  render(<ConfirmacaoSimples titulo="Reabrir contrato encerrado?" descricao="Retornar à revisão" confirmar="Reabrir contrato"
    estadoContextual="encerrado" preservarCorOrigem onCancelar={jest.fn()} onConfirmar={jest.fn()} />);
  expect(screen.getByRole('dialog')).toHaveAttribute('data-tec08-estado', 'revisao');
});


test('aprovação explícita mantém o verde mesmo quando o contexto do modal é conclusão', () => {
  render(<ConfirmacaoSimples titulo="Aprovar conclusão?" descricao="Decisão auditada" confirmar="Aprovar"
    estadoContextual="concluido" aprovarVerde onCancelar={jest.fn()} onConfirmar={jest.fn()} />);
  const botao = screen.getByRole('button', { name: 'Aprovar' });
  expect(botao).toHaveClass('bg-green-800');
  expect(botao).toHaveAttribute('data-tec08-acao-aprovar', 'true');
});

test('confirmação perigosa permanece vermelha, sem receber cor do contexto', () => {
  render(<ConfirmacaoSimples titulo="Excluir definitivamente?" descricao="Ação permanente" confirmar="Excluir"
    perigoso estadoContextual="concluido" onCancelar={jest.fn()} onConfirmar={jest.fn()} />);
  expect(screen.getByRole('button', { name: 'Excluir' })).toHaveClass('bg-red-700');
  expect(screen.getByRole('button', { name: 'Excluir' })).toHaveAttribute('data-tec08-acao-perigosa', 'true');
});
