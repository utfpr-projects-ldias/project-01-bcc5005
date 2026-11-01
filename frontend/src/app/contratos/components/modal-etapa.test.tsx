import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ModalEtapa } from './modal-etapa';

function Cenario({ ocupado = false }: { ocupado?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [origem, setOrigem] = useState<HTMLButtonElement | null>(null);
  return <div>
    <button type="button" onClick={(evento) => { setOrigem(evento.currentTarget); setAberto(true); }}>Editar etapa QA</button>
    {aberto && <ModalEtapa titulo="Editar etapa · QA" ocupado={ocupado} focoRetorno={origem} onFechar={() => setAberto(false)}>
      <form aria-label="Editar etapa QA"><label htmlFor="nome-qa">Nome</label><input id="nome-qa" defaultValue="QA" />
        <button type="button" onClick={() => setAberto(false)} disabled={ocupado}>Voltar sem salvar</button>
      </form>
    </ModalEtapa>}
  </div>;
}

test('abrir edição cria dialog, bloqueia scroll, Esc fecha e devolve foco ao botão de origem', () => {
  const scrollAntes = document.body.style.overflow;
  try {
    render(<Cenario />);
    const gatilho = screen.getByRole('button', { name: 'Editar etapa QA' });
    fireEvent.click(gatilho);
    const modal = screen.getByRole('dialog', { name: 'Editar etapa · QA' });
    expect(modal).toHaveAttribute('aria-modal', 'true');
    expect(document.body.style.overflow).toBe('hidden');
    expect(screen.getByRole('button', { name: 'Fechar edição da etapa' })).toHaveFocus();
    fireEvent.keyDown(modal, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(gatilho).toHaveFocus();
    expect(document.body.style.overflow).toBe(scrollAntes);
  } finally { document.body.style.overflow = scrollAntes; }
});

test('Voltar sem salvar fecha apenas o modal; não muda rota nem valores externos', () => {
  const rotaInicial = window.location.href;
  render(<Cenario />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Alterado não salvo' } });
  fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(window.location.href).toBe(rotaInicial);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  expect(screen.getByLabelText('Nome')).toHaveValue('QA');
});

test('durante gravação o botão Fechar e a tecla Esc não podem encerrar o modal', () => {
  render(<Cenario ocupado />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar etapa QA' }));
  const modal = screen.getByRole('dialog');
  expect(screen.getByRole('button', { name: 'Fechar edição da etapa' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Voltar sem salvar' })).toBeDisabled();
  fireEvent.keyDown(modal, { key: 'Escape' });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

test.each(['x', 'fundo', 'voltar'] as const)('fechar modal por %s preserva foco, URL e scroll', (metodo) => {
  const rota = window.location.href;
  const original = document.body.style.overflow;
  render(<Cenario />);
  const abrir = screen.getByRole('button', { name: 'Editar etapa QA' });
  abrir.focus();
  fireEvent.click(abrir);
  const modal = screen.getByRole('dialog');
  expect(modal).toBeInTheDocument();
  if (metodo === 'x') fireEvent.click(screen.getByRole('button', { name: 'Fechar edição da etapa' }));
  else if (metodo === 'voltar') fireEvent.click(screen.getByRole('button', { name: 'Voltar sem salvar' }));
  else fireEvent.mouseDown(modal.parentElement!, { button: 0 });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(abrir).toHaveFocus();
  expect(window.location.href).toBe(rota);
  expect(document.body.style.overflow).toBe(original);
});
