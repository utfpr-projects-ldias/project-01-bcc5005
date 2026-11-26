import {fireEvent,render,screen} from '@testing-library/react';
import {SeletorVinculosMultiplos} from './seletor-vinculos-multiplos';

test('configura somente o entregável escolhido sem alterar outros vínculos',()=>{
 const configurar=jest.fn(),alterar=jest.fn();
 render(<SeletorVinculosMultiplos rotulo="Entregáveis" placeholder="Pesquisar" itens={[{id:'a',nome:'Computadores',contribuicao:'20 computadores'},{id:'b',nome:'Relatório',contribuicao:'30%'},{id:'c',nome:'Sem vínculo'}]} valores={['a','b']} onChange={alterar} onConfigurar={configurar}/>);
 expect(screen.getByText('20 computadores')).toBeInTheDocument();
 expect(screen.getByText('30%')).toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Configurar contribuição: Relatório'}));
 expect(configurar).toHaveBeenCalledWith('b');
 expect(alterar).not.toHaveBeenCalled();
 expect(screen.queryByRole('button',{name:'Configurar contribuição: Sem vínculo'})).not.toBeInTheDocument();
});

test('mantém os vínculos selecionados sem oferecer contribuição no cartão inelegível',()=>{
 const configurar=jest.fn(),alterar=jest.fn();
 render(<SeletorVinculosMultiplos rotulo="Destinos" placeholder="Pesquisar" itens={[{id:'e',nome:'Entregável com ocorrência',configuravel:false},{id:'o',nome:'Ocorrência selecionada',configuravel:true,contribuicao:'15%'}]} valores={['e','o']} onChange={alterar} onConfigurar={configurar}/>);
 expect(screen.getByRole('checkbox',{name:'Entregável com ocorrência'})).toBeChecked();
 expect(screen.queryByRole('button',{name:'Configurar contribuição: Entregável com ocorrência'})).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole('button',{name:'Configurar contribuição: Ocorrência selecionada'}));
 expect(configurar).toHaveBeenCalledWith('o');
 expect(alterar).not.toHaveBeenCalled();
});
