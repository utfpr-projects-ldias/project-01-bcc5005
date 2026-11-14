import {fireEvent, render, screen} from '@testing-library/react';
import {AnelProgresso} from './anel-progresso';
import {ResumoRequisitosOcorrencia} from './requisitos-ocorrencia';
import {CalendarioOcorrencias} from './calendario-ocorrencias';
import type {Ocorrencia} from '@/hooks/use-ocorrencias';

test('requisito exibe quantidade dentro do anel, sem repetir percentual', () => {
  render(<AnelProgresso atual={1} total={2} rotulo="Atividades" />);
  expect(screen.getByText('1/2')).toBeInTheDocument();
  expect(screen.queryByText('50%')).not.toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow','50');
});

test('somente requisitos configurados entram no resumo', () => {
  render(<ResumoRequisitosOcorrencia minimoAtividades={2} minimoEvidencias={0} formato="NENHUMA" verificadas={1} />);
  expect(screen.getByText('1/2')).toBeInTheDocument();
  expect(screen.queryByText('Evidências')).not.toBeInTheDocument();
});

test('agenda mensal recorrente tem navegação, sem etiqueta Hoje ou frase redundante', () => {
  const abrir=jest.fn();
  const registro={id:'a',titulo:'Registro do período',periodoInicio:'2026-11-13',periodoFim:'2026-11-13',status:'NAO_INICIADO',substituidaEm:null} as Ocorrencia;
  render(<CalendarioOcorrencias registros={[registro]} periodicidade="SEMANAL" aoAbrir={abrir}/>);
  expect(screen.queryByText('Hoje')).not.toBeInTheDocument();
  expect(screen.queryByText('Selecione um dia para ver as ocorrências do período.')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Próximo período'}));
  expect(screen.getByRole('button',{name:'Período anterior'})).toBeEnabled();
});
