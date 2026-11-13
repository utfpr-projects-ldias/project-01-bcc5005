import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { CampoBuscaSugestoes } from './campo-busca-sugestoes';

const opcoes = ['Ana', 'Bruna', 'Caio', 'Duda', 'Elias', 'Fabio', 'Giulia', 'Helena'];
test('limita a cinco sugestões sem empurrar a página e aceita seleção por mouse', () => {
  const onChange = jest.fn();
  render(<CampoBuscaSugestoes valor="" onChange={onChange} opcoes={opcoes} rotulo="Pesquisar entregável" />);
  fireEvent.focus(screen.getByRole('combobox', { name: 'Pesquisar entregável' }));
  expect(screen.getAllByRole('option')).toHaveLength(5);
  expect(screen.getByRole('listbox')).toHaveStyle({ position: 'fixed' });
  fireEvent.mouseDown(screen.getByRole('option', { name: 'Bruna' }));
  fireEvent.click(screen.getByRole('option', { name: 'Bruna' }));
  expect(onChange).toHaveBeenCalledWith('Bruna');
});
test('pesquisa tem resposta controlada e opções acessíveis ao teclado', () => {
  function Teste() {
    const [texto, mudar] = useState('');
    return <CampoBuscaSugestoes valor={texto} onChange={mudar} opcoes={opcoes} rotulo="Pesquisar ocorrência" />;
  }
  render(<Teste />);
  const campo = screen.getByRole('combobox', { name: 'Pesquisar ocorrência' });
  fireEvent.focus(campo);
  fireEvent.change(campo, { target: { value: 'Giu' } });
  expect(screen.getByRole('option', { name: 'Giulia' })).toBeInTheDocument(); 
});

test('contexto de ocorrência preserva estilos herdados e mantém sugestões em portal fixo', () => {
  render(<CampoBuscaSugestoes valor="" onChange={jest.fn()} opcoes={[]} rotulo="Vincular atividade" contextual />);
  const campo = screen.getByRole('combobox', { name: 'Vincular atividade' });
  expect(campo.className).toContain('border-current/25');
  expect(campo.className).not.toContain('border-brand-green');
  fireEvent.focus(campo);
  const lista = screen.getByRole('listbox');
  expect(lista).toHaveStyle({ position: 'fixed' });
  expect(lista.className).not.toContain('border-brand-green');
  expect(screen.getByText('Nenhuma opção encontrada.')).toBeInTheDocument();
});
