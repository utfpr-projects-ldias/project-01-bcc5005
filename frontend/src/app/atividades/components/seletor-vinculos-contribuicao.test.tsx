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
