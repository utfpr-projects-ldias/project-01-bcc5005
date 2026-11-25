import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NavegadorEntregaveis } from './navegador-entregaveis';
import { solicitarNavegacaoInterna } from './navegacao-interna';

const lista = <input aria-label="Pesquisar entregável" defaultValue="Infraestrutura"/>;
test('preserva a lista e o filtro ao abrir e voltar do entregável, sem cabeçalho duplicado',()=>{
 const view=render(<NavegadorEntregaveis selecionado={null} painelDireitoAberto={false} lista={lista}><p>Detalhes</p></NavegadorEntregaveis>);
 const pesquisa=screen.getByRole('textbox',{name:'Pesquisar entregável'});
 fireEvent.change(pesquisa,{target:{value:'Manutenção'}});
 expect(screen.queryByText('Detalhes')).not.toBeInTheDocument();
 view.rerender(<NavegadorEntregaveis selecionado="e1" painelDireitoAberto lista={lista}><p>Detalhes</p></NavegadorEntregaveis>);
 expect(screen.queryByRole('complementary',{name:'Lista de entregáveis'})).not.toBeInTheDocument();
 expect(screen.queryByRole('button',{name:'Abrir lista de entregáveis'})).not.toBeInTheDocument();
 expect(screen.getByText('Detalhes')).toBeInTheDocument();
 view.rerender(<NavegadorEntregaveis selecionado={null} painelDireitoAberto lista={lista}><p>Detalhes</p></NavegadorEntregaveis>);
 expect(screen.getByRole('textbox',{name:'Pesquisar entregável'})).toBe(pesquisa);
 expect(pesquisa).toHaveValue('Manutenção');
});
test('cancelar o descarte preserva o formulário na navegação, sem confirmação nativa',()=>{
 const confirmar=jest.spyOn(window,'confirm');
 try {
  render(<NavegadorEntregaveis selecionado="e1" painelDireitoAberto={false} lista={lista}><form><input aria-label="Quantidade"/></form></NavegadorEntregaveis>);
  fireEvent.change(screen.getByRole('textbox',{name:'Quantidade'}),{target:{value:'25'}});
  const navegar=jest.fn();
  act(()=>{expect(solicitarNavegacaoInterna(navegar)).toBe(false);});
  expect(screen.getByRole('dialog',{name:'Descartar alterações?'})).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Continuar editando'}));
  expect(screen.getByRole('textbox',{name:'Quantidade'})).toHaveValue('25');
  expect(navegar).not.toHaveBeenCalled();
  expect(confirmar).not.toHaveBeenCalled();
 } finally {confirmar.mockRestore();}
});
test('confirmar o descarte retoma a navegação originalmente solicitada',async()=>{
 render(<NavegadorEntregaveis selecionado="e1" painelDireitoAberto={false} lista={lista}><form><input aria-label="Quantidade"/></form></NavegadorEntregaveis>);
 fireEvent.change(screen.getByRole('textbox',{name:'Quantidade'}),{target:{value:'25'}});
 const navegar=jest.fn();
 act(()=>{expect(solicitarNavegacaoInterna(navegar)).toBe(false);});
 expect(navegar).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Descartar alterações'}));
 await waitFor(()=>expect(navegar).toHaveBeenCalledTimes(1));
 expect(screen.queryByRole('dialog',{name:'Descartar alterações?'})).not.toBeInTheDocument();
});
