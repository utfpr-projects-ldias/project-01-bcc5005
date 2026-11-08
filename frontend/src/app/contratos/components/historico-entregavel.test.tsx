import { render, screen } from '@testing-library/react';
import { HistoricoEntregavel } from './historico-entregavel';
import { consultarHistoricoEntregavel } from '@/lib/entregaveis';

jest.mock('@/lib/entregaveis', () => ({ consultarHistoricoEntregavel: jest.fn() }));
const consultar = consultarHistoricoEntregavel as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });

test('rastreabilidade apresenta nomes anterior/atual e arquivo da época do evento sem JSON interno', async () => {
  consultar.mockResolvedValue([
    { id: 'evt-1', acao: 'ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA', descricao: 'Evidência planejada atualizada',
      ocorridoEm: '2026-11-06T03:00:00.000Z', ator: { nome: 'Revisor QA', email: 'qa@example.invalid' },
      evidenciaNome: 'Relatório final', nomeAnterior: 'Relatório inicial',
      nomeAtual: 'Relatório final', objetoRenomeado: 'Evidência', nomeArquivo: null },
    { id: 'evt-2', acao: 'ENTREGAVEL_COMPROVANTE_ENVIADO', descricao: 'Comprovante enviado',
      ocorridoEm: '2026-11-06T02:00:00.000Z', ator: null, evidenciaNome: 'Relatório final',
      nomeAnterior: null, nomeAtual: null, nomeArquivo: 'comprovante-revisado.pdf' },
  ]);
  render(<HistoricoEntregavel contratoId="c-1" entregavelId="e-1" versao={1} />);
  expect(await screen.findByText('Evidência: “Relatório inicial” → “Relatório final”')).toBeInTheDocument();
  expect(screen.getByText('Arquivo: comprovante-revisado.pdf')).toBeInTheDocument();
  expect(screen.getByText(/Revisor QA/)).toBeInTheDocument();
  expect(consultar).toHaveBeenCalledWith('c-1','e-1', expect.anything());
});
