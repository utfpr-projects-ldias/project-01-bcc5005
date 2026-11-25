import { render, screen } from '@testing-library/react';
import { EtiquetaAtraso } from './etiqueta-atraso';
import { estadoDoObjeto, rotuloEstadoEntregavel } from '@/lib/identidade-operacional';

test('prazo adicional não altera o rótulo ou cor do status principal', () => {
  expect(rotuloEstadoEntregavel('NAO_INICIADO')).toBe('Não iniciado');
  expect(rotuloEstadoEntregavel(null)).toBe('Não iniciado');
  expect(estadoDoObjeto({objeto:'entregavel',status:'NAO_INICIADO'})).toBe('nao-iniciado');
  expect(estadoDoObjeto({objeto:'etapa',status:'PLANEJADA'})).toBe('nao-iniciado');
  expect(estadoDoObjeto({objeto:'etapa',status:'EM_ANDAMENTO'})).toBe('andamento');
  const {rerender} = render(<><span>{rotuloEstadoEntregavel('EM_ANDAMENTO')}</span><EtiquetaAtraso atrasado/></>);
  expect(screen.getByText('Em andamento')).toBeInTheDocument();
  expect(screen.getByText('Atrasado')).toHaveClass('text-red-700');
  rerender(<EtiquetaAtraso finalizadoComAtraso/>);
  expect(screen.queryByText('Atrasado')).not.toBeInTheDocument();
  expect(screen.getByText('Finalizado após o prazo')).toBeInTheDocument();
  rerender(<EtiquetaAtraso/>);
  expect(screen.queryByText('Finalizado após o prazo')).not.toBeInTheDocument();
});
