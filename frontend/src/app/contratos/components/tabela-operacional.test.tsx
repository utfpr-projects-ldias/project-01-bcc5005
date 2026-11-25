import { fireEvent, render, screen } from '@testing-library/react';
import { AnelTabela, BarraTabela, CabecalhoColuna, ComprovacaoTabela, ordenarTabela, somarFracoes, useOrdemTabela } from './tabela-operacional';

function TabelaOrdenavel() {
  const { ordem, alternar } = useOrdemTabela();
  const dados = [{ nome: 'Sem medição', valor: null }, { nome: 'B', valor: 10 }, { nome: 'A', valor: 2 }];
  return <table><thead><tr><CabecalhoColuna campo="valor" titulo="Execução" ordem={ordem} alternar={alternar}/></tr></thead><tbody>{ordenarTabela(dados, ordem, d => d.valor).map(d => <tr key={d.nome}><td>{d.nome}</td></tr>)}</tbody></table>;
}

test('ordenação numérica crescente/decrescente preserva indisponíveis no final e restaura a origem', () => {
  render(<TabelaOrdenavel/>);
  const botao = screen.getByRole('button', { name: 'Execução' });
  const cabecalho = screen.getByRole('columnheader');
  const nomes = () => screen.getAllByRole('cell').map(c => c.textContent);
  expect(nomes()).toEqual(['Sem medição', 'B', 'A']);
  fireEvent.click(botao);
  expect(cabecalho).toHaveAttribute('aria-sort', 'ascending');
  expect(nomes()).toEqual(['A', 'B', 'Sem medição']);
  fireEvent.click(botao);
  expect(cabecalho).toHaveAttribute('aria-sort', 'descending');
  expect(nomes()).toEqual(['B', 'A', 'Sem medição']);
  fireEvent.click(botao);
  expect(cabecalho).toHaveAttribute('aria-sort', 'none');
  expect(nomes()).toEqual(['Sem medição', 'B', 'A']);
});

test('indicadores distinguem zero real, ausência de requisitos e dados indisponíveis', () => {
  render(<><AnelTabela nome="Etapas" fracao={{ feitas: 0, total: 2 }}/><AnelTabela nome="Atividades" fracao={{ feitas: 0, total: 0 }}/><AnelTabela nome="Ocorrências"/><BarraTabela valor={55}/><ComprovacaoTabela fracao={{ feitas: 1, total: 2 }}/></>);
  expect(screen.getByRole('img', { name: 'Etapas: 0/2' })).toBeInTheDocument();
  expect(screen.getByTitle('Atividades: sem registros')).toBeInTheDocument();
  expect(screen.getByTitle('Ocorrências: indisponível')).toBeInTheDocument();
  expect(screen.getByLabelText('55% de execução física')).toBeInTheDocument();
  expect(screen.getByTitle('Exigências documentais atendidas')).toHaveTextContent('1/2');
  expect(somarFracoes([{ feitas: 1, total: 2 }, { feitas: 2, total: 3 }])).toEqual({ feitas: 3, total: 5 });
  expect(somarFracoes([{ feitas: 1, total: 2 }, {}])).toEqual({});
});
