import { render, screen } from '@testing-library/react';
import { diasPlanejamento, ProgressoSerieRecorrente } from './progresso-serie-recorrente';
import type { ProgressoEntregavel } from '@/hooks/use-progresso';
jest.mock('@/lib/estado-temporal',()=>({diaLocalBrasil:()=> '2026-11-23'}));

test.each([['2026-11-18',0],['2026-11-19',1],['2026-11-23',5],['2026-12-01',12]])('vigência civil inclusiva em %s', (hoje,decorridos)=>{
  expect(diasPlanejamento('2026-11-19','2026-11-30',hoje)).toEqual({total:12,decorridos});
});
test('dias aparecem em fração e execução vem do motor, inclusive série ponderada',()=>{
  const resumo={percentualExecucao:25,realizado:'2',previsto:'12',fonte:'OCORRENCIAS'} as ProgressoEntregavel;
  render(<ProgressoSerieRecorrente registros={[]} inicio="2026-11-19" fim="2026-11-30" resumoFisico={resumo}/>);
  expect(screen.getByRole('progressbar',{name:'Avanço das ocorrências'})).toHaveAttribute('aria-valuenow','25');
  expect(screen.getByText('2/12 concluídas')).toBeInTheDocument();
  expect(screen.getByText('5/12')).toBeInTheDocument();
  expect(screen.getByRole('progressbar',{name:/Dias do planejamento: 5 de 12/})).toBeInTheDocument();
});
