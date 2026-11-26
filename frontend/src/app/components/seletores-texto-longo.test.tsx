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


test.each(['Etapa','Entregável'])('%s do novo registro abrevia apenas a apresentação', rotulo => {
  const completo = 'Primeira parte do nome muito longo — sufixo pesquisável';
  function Exemplo() {
    const [valor, setValor] = useState('');
    return <SeletorEntregavel rotulo={rotulo} itens={[{id:'1', nome:completo}]} valor={valor} onChange={setValor} limiteRotulo={28}/>;
  }
  render(<Exemplo/>);
  const campo = screen.getByRole('combobox', {name:rotulo});
  fireEvent.focus(campo);
  fireEvent.change(campo, {target:{value:'sufixo pesquisável'}});
  const opcao = screen.getByRole('option', {name:completo});
  expect(opcao).toHaveAttribute('title', completo);
  expect(opcao.textContent?.length).toBeLessThanOrEqual(28);
  expect(opcao.textContent).toMatch(/…$/);
  fireEvent.click(opcao);
  expect(campo).toHaveValue(opcao.textContent);
  expect(campo).toHaveAttribute('title', completo);
});

// O destaque do mouse/teclado não é uma seleção confirmada.
test.each(['Etapa', 'Entregável', 'Ocorrência'])('%s distingue seleção e realce temporário', rotulo => {
  const mudar = jest.fn();
  render(<SeletorEntregavel rotulo={rotulo} itens={[{id:'a',nome:'Primeiro'},{id:'b',nome:'Segundo'}]} valor="a" onChange={mudar}/>);
  const campo = screen.getByRole('combobox', {name:rotulo});
  fireEvent.focus(campo);
  const primeiro = screen.getByRole('option', {name:'Primeiro'});
  const segundo = screen.getByRole('option', {name:'Segundo'});
  fireEvent.mouseEnter(segundo);
  expect(primeiro).toHaveAttribute('aria-selected','true');
  expect(segundo).toHaveAttribute('aria-selected','false');
  expect(segundo).toHaveAttribute('data-pi-realce','true');
  expect(mudar).not.toHaveBeenCalled();
  fireEvent.mouseLeave(segundo);
  expect(segundo).toHaveAttribute('data-pi-realce','false');
  fireEvent.keyDown(campo,{key:'ArrowDown'});
  fireEvent.keyDown(campo,{key:'ArrowDown'});
  expect(campo).toHaveAttribute('aria-activedescendant',segundo.id);
  fireEvent.keyDown(campo,{key:'Enter'});
  expect(mudar).toHaveBeenCalledWith('b');
});

test('contrato mantém seleção ao navegar por outra opção', () => {
  const mudar = jest.fn();
  render(<SeletorContrato contratos={[{id:'a',codigoPublico:'1',objeto:'Primeiro'},{id:'b',codigoPublico:'2',objeto:'Segundo'}]} valor="a" onChange={mudar}/>);
  fireEvent.focus(screen.getByRole('combobox'));
  const primeiro = screen.getByRole('option',{name:/Primeiro/});
  const segundo = screen.getByRole('option',{name:/Segundo/});
  fireEvent.mouseEnter(segundo);
  expect(primeiro).toHaveAttribute('aria-selected','true');
  expect(segundo).toHaveAttribute('aria-selected','false');
  expect(segundo).toHaveAttribute('data-pi-realce','true');
  expect(mudar).not.toHaveBeenCalled();
  fireEvent.click(segundo);
  expect(mudar).toHaveBeenCalledWith('b');
});

test('responsável distingue responsável atual de candidato sob o mouse', () => {
  const mudar = jest.fn();
  const itens = [{id:'a',email:'ana@teste.local'},{id:'b',email:'bruno@teste.local'}];
  render(<SeletorResponsavel itens={itens} valor="a" onChange={mudar} semprePesquisar/>);
  fireEvent.focus(screen.getByRole('combobox'));
  const ana = screen.getByRole('option',{name:/ana@/});
  const bruno = screen.getByRole('option',{name:/bruno@/});
  fireEvent.mouseEnter(bruno);
  expect(ana).toHaveAttribute('aria-selected','true');
  expect(bruno).toHaveAttribute('aria-selected','false');
  expect(bruno).toHaveAttribute('data-pi-realce','true');
  expect(mudar).not.toHaveBeenCalled();
  fireEvent.click(bruno);
  expect(mudar).toHaveBeenCalledWith('b',itens[1]);
});

test('sugestões separam texto atual de realce por mouse', () => {
  const mudar = jest.fn();
  render(<CampoBuscaSugestoes valor="Relatório" onChange={mudar} opcoes={['Relatório','Relatório mensal']} rotulo="Pesquisar"/>);
  fireEvent.focus(screen.getByRole('combobox'));
  const atual = screen.getByRole('option',{name:'Relatório'});
  const candidato = screen.getByRole('option',{name:'Relatório mensal'});
  fireEvent.mouseEnter(candidato);
  expect(atual).toHaveAttribute('aria-selected','true');
  expect(candidato).toHaveAttribute('aria-selected','false');
  expect(candidato).toHaveAttribute('data-pi-realce','true');
  expect(mudar).not.toHaveBeenCalled();
});
