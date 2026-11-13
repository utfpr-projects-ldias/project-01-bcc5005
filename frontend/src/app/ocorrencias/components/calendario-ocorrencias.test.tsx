import { fireEvent, render, screen } from '@testing-library/react';
import { CalendarioOcorrencias } from './calendario-ocorrencias';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
const item=(id:string,inicio:string,fim:string,status:string) => ({id,titulo:`Ocorrência ${id}`,
  periodoInicio:inicio,periodoFim:fim,status,substituidaEm:null}) as Ocorrencia;
test.each([
  ['DIARIA','Calendário diaria de ocorrências'],
  ['SEMANAL','Calendário semanal de ocorrências'],
  ['MENSAL','Calendário mensal de ocorrências'],
  ['TRIMESTRAL','Calendário trimestral de ocorrências'],
  ['SEMESTRAL','Calendário semestral de ocorrências'],
  ['ANUAL','Calendário anual de ocorrências'],
])('periodicidade %s determina a vista', (frequencia,rotulo) => {
  const abrir=jest.fn();
  render(<CalendarioOcorrencias periodicidade={frequencia} registros={[item('A','2026-12-01','2026-12-01','CONCLUIDO')]} aoAbrir={abrir}/>);
  expect(screen.getByLabelText(rotulo)).toHaveAttribute('data-periodicidade',frequencia);
  fireEvent.click(screen.getByRole('button',{name:/Abrir ocorrência Ocorrência A/}));
  expect(abrir).toHaveBeenCalledTimes(1);
});
test('conclusão histórica permanece clicável sem que um filho repinte o calendário',()=>{
  const abrir=jest.fn();
  render(<CalendarioOcorrencias periodicidade="MENSAL" registros={[
    item('A','2026-11-01','2026-11-30','CONCLUIDO'),
    item('B','2026-12-01','2026-12-31','ENCERRADA'),
  ]} aoAbrir={abrir}/>);
  expect(screen.getByText('Encerramento registrado')).toBeInTheDocument();
  expect(document.querySelector('[data-pi-calendario-ocorrencias] .pi-agenda-superficie')).not.toHaveClass('border-purple-500/55');
  fireEvent.click(screen.getByRole('button',{name:'Próximo período'}));
  fireEvent.click(screen.getByRole('button',{name:/Abrir ocorrência Ocorrência B/}));
  expect(abrir).toHaveBeenCalledTimes(1);
});
