import { render, screen } from '@testing-library/react';
import { useProgresso } from '@/hooks/use-progresso';
import { ProgressoCircularContrato } from './progresso-circular-contrato';
jest.mock('@/hooks/use-progresso', () => ({ useProgresso: jest.fn() }));
const progresso = useProgresso as jest.Mock;
it('usa exclusivamente o avanço contratual calculado pelo backend e exibe percentual no círculo', () => {
  progresso.mockReturnValue({ progresso: { avanco: 62.5 } });
  render(<ProgressoCircularContrato contratoId="contrato-qa" nome="Contrato QA" />);
  expect(screen.getByRole('img', { name: /62,5%/ })).toHaveTextContent('62,5%');
  expect(progresso).toHaveBeenCalledWith('contrato-qa');
});
it('não inventa 0% quando o backend ainda não calculou o avanço', () => {
  progresso.mockReturnValue({ progresso: { avanco: null } });
  render(<ProgressoCircularContrato contratoId="contrato-qa" nome="Contrato QA" />);
  expect(screen.getByRole('img', { name: /indisponível/ })).toHaveTextContent('—');
});
