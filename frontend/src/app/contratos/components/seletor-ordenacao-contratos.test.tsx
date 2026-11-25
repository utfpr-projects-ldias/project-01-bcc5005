import { render, screen, fireEvent, within } from '@testing-library/react';
import { SeletorOrdenacaoContratos } from './seletor-ordenacao-contratos';

test('controle de ordenação é estilizado, sem select nativo e começa por início mais recente', () => {
  const escolher = jest.fn();
  render(<SeletorOrdenacaoContratos valor="inicio-desc" onChange={escolher}/>);
  const botao=screen.getByRole('button',{name:'Ordenar contratos'});
  expect(botao).toHaveTextContent('Mais recente');
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  fireEvent.click(botao);
  const opcoes=screen.getByRole('listbox',{name:'Ordem dos contratos'});
  expect(within(opcoes).getAllByRole('option')).toHaveLength(4);
  fireEvent.click(within(opcoes).getByRole('option',{name:'Mais antigo'}));
  expect(escolher).toHaveBeenCalledWith('inicio-asc');
});
