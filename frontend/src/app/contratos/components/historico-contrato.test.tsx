import { fireEvent, render, screen, within } from '@testing-library/react';
import { HistoricoContrato } from './historico-contrato';
import { consultarHistoricoContrato, type EventoHistoricoContrato } from '@/lib/contratos';

jest.mock('@/lib/contratos',()=>({consultarHistoricoContrato:jest.fn()}));
const consultar = consultarHistoricoContrato as jest.MockedFunction<typeof consultarHistoricoContrato>;
const evento = (i:number):EventoHistoricoContrato => ({id:`evento-${i}`,acao:'ATIVIDADE_VERIFICADA',descricao:`Atividade verificada ${i}`,ocorridoEm:'2026-11-24T17:30:00Z',situacaoAnterior:null,situacaoAtual:null,contexto:'Infraestrutura',ator:{nome:'Equipe técnica',email:'teste@example.invalid'}});

beforeEach(()=>consultar.mockReset());

test('mostra quatro eventos recentes e consulta todo o histórico em uma camada própria, por cursor',async()=>{
  consultar.mockResolvedValueOnce(Array.from({length:100},(_,i)=>evento(i))).mockResolvedValueOnce([evento(100)]);
  render(<HistoricoContrato contratoId="contrato" numeroContrato="00001" versao="1"/>);
  const recente=screen.getByRole('region',{name:'Histórico recente'});
  await within(recente).findByText('Atividade verificada 0 — Infraestrutura');
  expect(within(recente).getAllByRole('listitem')).toHaveLength(4);
  const botao=within(recente).getByRole('button',{name:'Consultar histórico completo'});
  fireEvent.click(botao);
  const dialogo=screen.getByRole('dialog',{name:'Histórico do contrato'});
  expect(within(dialogo).getAllByRole('listitem')).toHaveLength(100);
  fireEvent.click(within(dialogo).getByRole('button',{name:'Carregar eventos anteriores'}));
  await within(dialogo).findByText('Atividade verificada 100');
  expect(consultar).toHaveBeenLastCalledWith('contrato',expect.any(AbortSignal),'evento-99');
  expect(within(dialogo).queryByRole('button',{name:'Carregar eventos anteriores'})).not.toBeInTheDocument();
  expect(within(dialogo).getAllByRole('listitem')).toHaveLength(101);
  fireEvent.keyDown(dialogo,{key:'Escape'});
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(botao).toHaveFocus();
  expect(within(recente).getAllByRole('listitem')).toHaveLength(4);
});

test('falha na consulta não revela histórico nem abre diálogo',async()=>{
  consultar.mockRejectedValueOnce(new Error('403'));
  render(<HistoricoContrato contratoId="contrato" versao="1"/>);
  await screen.findByText('Histórico indisponível ou sem permissão de consulta.');
  expect(screen.getByRole('button',{name:'Consultar histórico completo'})).toBeDisabled();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
