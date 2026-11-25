import { act, fireEvent, render, screen } from '@testing-library/react';
import { CalendarioOcorrencias } from './calendario-ocorrencias';
import type { Ocorrencia } from '@/hooks/use-ocorrencias';
const item=(id:string,inicio:string,fim:string,status:string) => ({id,titulo:`Ocorrência ${id}`,
  periodoInicio:inicio,periodoFim:fim,status,substituidaEm:null}) as Ocorrencia;
test.each([
  ['DIARIA','Calendário diário de ocorrências'],
  ['SEMANAL','Calendário semanal de ocorrências'],
  ['MENSAL','Calendário mensal de ocorrências'],
  ['TRIMESTRAL','Calendário trimestral de ocorrências'],
  ['SEMESTRAL','Calendário semestral de ocorrências'],
  ['ANUAL','Calendário anual de ocorrências'],
])('periodicidade %s determina a vista', async (frequencia,rotulo) => {
  const abrir=jest.fn();
  await act(async () => { render(<CalendarioOcorrencias periodicidade={frequencia} registros={[item('A','2026-12-01','2026-12-01','CONCLUIDO')]} aoAbrir={abrir}/>); });
  expect(screen.getByLabelText(rotulo)).toHaveAttribute('data-periodicidade',frequencia);
  fireEvent.click(await screen.findByRole('button',{name:/Abrir ocorrência Ocorrência A/}));
  expect(abrir).toHaveBeenCalledTimes(1);
});
test('conclusão histórica permanece clicável sem que um filho repinte o calendário', async ()=>{
  const abrir=jest.fn();
  await act(async () => { render(<CalendarioOcorrencias periodicidade="MENSAL" registros={[
    item('A','2026-11-01','2026-11-30','CONCLUIDO'),
    item('B','2026-12-01','2026-12-31','ENCERRADA'),
  ]} aoAbrir={abrir}/>); });
  expect(screen.getByText('Encerramento registrado')).toBeInTheDocument();
  expect(document.querySelector('[data-pi-calendario-ocorrencias] .pi-agenda-superficie')).not.toHaveClass('border-purple-500/55');
  fireEvent.click(screen.getByRole('button',{name:'Próximo período'}));
  fireEvent.click(await screen.findByRole('button',{name:/Abrir ocorrência Ocorrência B/}));
  expect(abrir).toHaveBeenCalledTimes(1);
});

test('troca de situação preserva mês, dia e marcadores da agenda integral', () => {
  const abrir=jest.fn();
  const registros=[item('A','2090-12-01','2090-12-01','CONCLUIDO'), item('B','2091-01-10','2091-01-10','NAO_INICIADO')];
  const {rerender,container}=render(<CalendarioOcorrencias registros={registros} registrosVisiveis={registros} aoAbrir={abrir}/>);
  fireEvent.click(screen.getByRole('button',{name:'Próximo período'}));
  const dia=container.querySelector('time[datetime="2091-01-10"]')?.closest('button') as HTMLButtonElement;
  expect(dia).not.toBeNull(); fireEvent.click(dia);
  expect(dia).toHaveAttribute('aria-pressed','true');
  expect(screen.getByRole('button',{name:/Abrir ocorrência Ocorrência B/})).toBeInTheDocument();
  rerender(<CalendarioOcorrencias registros={registros} registrosVisiveis={[registros[0]]} aoAbrir={abrir}/>);
  expect(container.querySelector('time[datetime="2091-01-10"]')?.closest('button')).toBe(dia);
  expect(dia).toHaveAttribute('aria-pressed','true');
  expect(dia.querySelector('[aria-label="1 ocorrências neste dia"]')).not.toBeNull();
  expect(screen.queryByRole('button',{name:/Abrir ocorrência Ocorrência B/})).not.toBeInTheDocument();
  rerender(<CalendarioOcorrencias registros={registros} registrosVisiveis={[registros[1]]} aoAbrir={abrir}/>);
  fireEvent.click(screen.getByRole('button',{name:/Abrir ocorrência Ocorrência B/}));
  expect(abrir).toHaveBeenCalledWith(registros[1],expect.any(HTMLElement));
});
