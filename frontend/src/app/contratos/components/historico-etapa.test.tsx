import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { HistoricoEtapa } from './historico-etapa';
import { consultarHistoricoEtapa } from '@/lib/etapas';

jest.mock('@/lib/etapas', () => ({ consultarHistoricoEtapa: jest.fn() }));

test('etapa apresenta contexto de entregável/evidência e nome do comprovante sem JSON interno', async () => {
  (consultarHistoricoEtapa as jest.Mock).mockResolvedValueOnce([{
    id: 'evento-1', acao: 'ENTREGAVEL_COMPROVANTE_VERIFICADO',
    ocorridoEm: '2026-11-06T12:00:00.000Z', entidadeTipo: 'ENTREGAVEL', entidadeId: 'entregavel-1',
    descricao: 'Comprovante verificado', contexto: 'Entregável: Relatório · Evidência: Foto',
    nomeArquivo: 'evidencia-final.pdf',
  }]);
  render(<HistoricoEtapa contratoId="contrato-1" etapaId="etapa-1" />);
  expect(screen.queryByText('evidencia-final.pdf')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Rastreabilidade da etapa/i }));
  await waitFor(() => expect(screen.getByText('Arquivo: evidencia-final.pdf')).toBeInTheDocument());
  expect(screen.getByText('Entregável: Relatório · Evidência: Foto')).toBeInTheDocument();
  expect(consultarHistoricoEtapa).toHaveBeenCalledWith('contrato-1', 'etapa-1', expect.any(AbortSignal));
  expect(screen.queryByText(/dadosAnteriores|dadosPosteriores/)).not.toBeInTheDocument();
});
