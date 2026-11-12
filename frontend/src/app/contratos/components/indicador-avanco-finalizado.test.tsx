import { render, screen } from '@testing-library/react';
import { IndicadorAvancoFinalizado } from './indicador-avanco-finalizado';
import { useProgresso } from '@/hooks/use-progresso';

jest.mock('@/hooks/use-progresso', () => ({ useProgresso: jest.fn() }));
const hook = useProgresso as jest.Mock;

describe('Cartões de contrato administrativamente Finalizado', () => {
  afterEach(() => jest.clearAllMocks());
  it('mostra o percentual real, nunca converte finalização em 100%', () => {
    hook.mockReturnValue({ loading: false, progresso: { avanco: 83.33 } });
    render(<IndicadorAvancoFinalizado contratoId="contrato-teste" />);
    expect(screen.getByText(/83,33%/)).toBeInTheDocument();
    expect(screen.getByLabelText('Execução física 83,33 por cento')).toBeInTheDocument();
    expect(screen.queryByText('100%')).not.toBeInTheDocument();
  });
  it('não inventa um percentual quando o cálculo ainda não é possível', () => {
    hook.mockReturnValue({ loading: false, progresso: { avanco: null } });
    render(<IndicadorAvancoFinalizado contratoId="contrato-teste" />);
    expect(screen.getByLabelText('Execução física não calculável')).toBeInTheDocument();
  });
});
