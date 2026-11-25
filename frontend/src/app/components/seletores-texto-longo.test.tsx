import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeletorEntregavel } from '../ocorrencias/components/seletor-entregavel';
import { SeletorContrato } from '../atividades/components/seletor-contrato';
import { SeletorResponsavel } from '../contratos/components/seletor-responsavel';
import { CampoBuscaSugestoes } from './campo-busca-sugestoes';

const nome = 'X'.repeat(45);

test.each(['Etapa', 'Entregável'])('%s conserva o valor integral e reserva espaço para a seta', rotulo => {
  function Exemplo() {
    const [valor, setValor] = useState('');
    return <SeletorEntregavel rotulo={rotulo} itens={[{id:'1', nome}]} valor={valor} onChange={setValor}/>;
  }
  render(<Exemplo/>);
  const campo = screen.getByRole('combobox', {name:rotulo});
  expect(campo).toHaveAttribute('data-pi-campo-com-icone', 'fim');
  expect(campo).toHaveAttribute('type', 'text');
  fireEvent.focus(campo);
  const opcao = screen.getByRole('option', {name:nome});
  expect(opcao).toHaveAttribute('title', nome);
  expect(opcao).not.toHaveClass('truncate');
  fireEvent.click(opcao);
  expect(campo).toHaveValue(nome);
  expect(campo).toHaveAttribute('title', nome);
});

test('contrato longo preserva a descrição completa', () => {
  const objeto = 'Objeto'.repeat(50);
  render(<SeletorContrato contratos={[{id:'1', codigoPublico:'00001', objeto}]} valor="1" onChange={jest.fn()}/>);
  const campo = screen.getByRole('combobox');
  expect(campo).toHaveAttribute('data-pi-campo-com-icone', 'fim');
  expect(campo).toHaveValue(`00001 — ${objeto}`);
  expect(campo).toHaveAttribute('title', `00001 — ${objeto}`);
});

test('responsável reserva uma coluna independente para o botão', () => {
  const usuario = {id:'1', email:'usuario.com.nome.longo@exemplo.com'};
  render(<SeletorResponsavel valor="1" selecionado={usuario} onChange={jest.fn()} semprePesquisar/>);
  const campo = screen.getByRole('combobox');
  expect(campo).toHaveAttribute('data-pi-campo-com-icone', 'separado');
  expect(campo).toHaveValue(usuario.email);
  expect(campo).toHaveAttribute('title', usuario.email);
});

test('sugestões de pesquisa longas continuam completas e selecionáveis', () => {
  const mudar = jest.fn();
  render(<CampoBuscaSugestoes valor="" onChange={mudar} opcoes={[nome]} rotulo="Pesquisar"/>);
  const campo = screen.getByRole('combobox');
  expect(campo).toHaveAttribute('data-pi-campo-com-icone', 'fim');
  fireEvent.focus(campo);
  const opcao = screen.getByRole('option', {name:nome});
  expect(opcao).toHaveAttribute('title', nome);
  fireEvent.click(opcao);
  expect(mudar).toHaveBeenCalledWith(nome);
});
