import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { NavegacaoContrato, type PaginaContrato } from './navegacao-contrato';
function Workspace(){const [pagina,setPagina]=useState<PaginaContrato>('visao');return <NavegacaoContrato pagina={pagina} onPagina={p=>{setPagina(p);return true;}} painelGlobalAberto={false}><section data-testid="conteudo">{pagina}</section></NavegacaoContrato>;}
function abrir(){fireEvent.click(screen.getByRole('button',{name:'Abrir navegação do contrato'}));return screen.getByRole('navigation',{name:'Páginas do contrato'});}
test('navegação contextual oferece três páginas e preserva a área de conteúdo',()=>{
 render(<Workspace/>);const conteudo=screen.getByTestId('conteudo');
 expect(screen.getByRole('heading',{name:'Acompanhamento'})).toBeInTheDocument();
 expect(screen.queryByRole('navigation',{name:'Páginas do contrato'})).not.toBeInTheDocument();
 const nav=abrir();expect(within(nav).getAllByRole('button')).toHaveLength(3);
 expect(within(nav).getByRole('button',{name:'Acompanhamento'})).toHaveAttribute('aria-current','page');
 fireEvent.click(within(nav).getByRole('button',{name:'Etapas'}));
 expect(screen.getByTestId('conteudo')).toBe(conteudo);expect(conteudo).toHaveTextContent('etapas');
 expect(screen.queryByRole('navigation',{name:'Páginas do contrato'})).not.toBeInTheDocument();
 abrir();const etapas=within(nav).getByRole('button',{name:'Etapas'});expect(etapas).toHaveAttribute('aria-current','page');
 etapas.focus();fireEvent.keyDown(etapas,{key:'ArrowDown'});
 expect(within(nav).getByRole('button',{name:'Documentos'})).toHaveFocus();
 expect(conteudo).toHaveTextContent('etapas');
 expect(within(nav).queryByRole('button',{name:'Execução'})).not.toBeInTheDocument();
 fireEvent.keyDown(nav,{key:'Escape'});expect(screen.queryByRole('navigation',{name:'Páginas do contrato'})).not.toBeInTheDocument();
});
test('navegação recusada preserva a página ativa',()=>{
 render(<NavegacaoContrato pagina="visao" onPagina={()=>false} painelGlobalAberto={false}><p>Visão atual</p></NavegacaoContrato>);
 const nav=abrir();fireEvent.click(within(nav).getByRole('button',{name:'Etapas'}));expect(within(nav).getByRole('button',{name:'Acompanhamento'})).toHaveAttribute('aria-current','page');
 fireEvent.click(screen.getByRole('button',{name:'Recolher navegação'}));expect(screen.queryByRole('navigation',{name:'Páginas do contrato'})).not.toBeInTheDocument();
});
