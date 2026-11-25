import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PainelMetasMarco } from './painel-metas-marco';
import { candidatosMetaMarco, decidirVinculoMeta, listarMetasMarco } from '@/lib/metas-marco';

jest.mock('@/lib/metas-marco', () => ({
  listarMetasMarco: jest.fn(), candidatosMetaMarco: jest.fn(), decidirVinculoMeta: jest.fn(),
  criarMetaMarco: jest.fn(), editarMetaMarco: jest.fn(), vincularMetaMarco: jest.fn(),
}));
const listar = listarMetasMarco as jest.Mock;
const candidatos = candidatosMetaMarco as jest.Mock;
const decidir = decidirVinculoMeta as jest.Mock;
const resumo = {
  entregavelId: 'marco-qa', total: 1, concluidas: 0, percentualPreparacao: 0, aptoPelasMetas: false,
  metas: [{ id: 'meta-qa', titulo: 'Vistoria', tipo: 'OCORRENCIA', quantidadeExigida: 2,
    dataPrevista: null, inicioPrevisto: null, terminoPrevisto: null, observacoes: null,
    quantidadeAprovada: 0, percentualPreparacao: 0, pronto: false,
    vinculos: [
      { id: 'v-1', status: 'PENDENTE', ocorrenciaId: 'oc-1', atividadeId: null, comprovanteId: null, elegivel: false, solicitadoEm: '2026-11-23T10:00:00Z' },
      { id: 'v-2', status: 'PENDENTE', ocorrenciaId: 'oc-2', atividadeId: null, comprovanteId: null, elegivel: false, solicitadoEm: '2026-11-23T10:00:00Z' },
    ] }],
};

beforeEach(() => {
  jest.clearAllMocks();
  listar.mockResolvedValue(resumo);
  candidatos.mockResolvedValue([]);
  decidir.mockResolvedValue({});
});

test('rejeição envia justificativa do vínculo selecionado, sem reutilizar a de outro', async () => {
  render(<PainelMetasMarco contratoId="contrato-qa" entregavelId="marco-qa"
    permissoes={{ aprovarVinculosMetasMarco: true } as never} />);
  const gerenciar = await screen.findByRole('button', { name: 'Gerenciar vínculos' });
  await act(async () => { fireEvent.click(gerenciar); });
  const justificativas = await screen.findAllByRole('textbox', { name: 'Justificativa da rejeição do vínculo' });
  expect(justificativas).toHaveLength(2);
  fireEvent.change(justificativas[0], { target: { value: 'Documento da primeira vistoria incompleto' } });
  fireEvent.change(justificativas[1], { target: { value: 'Ocorrência diferente da meta prevista' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Rejeitar' })[0]);
  await waitFor(() => expect(decidir).toHaveBeenCalledWith(
    'contrato-qa', 'marco-qa', 'meta-qa', 'v-1', false, 'Documento da primeira vistoria incompleto'));
  expect(decidir).not.toHaveBeenCalledWith('contrato-qa', 'marco-qa', 'meta-qa', 'v-2', false, expect.anything());
});

test('somente leitura não apresenta ação nem campo de justificativa', async () => {
  render(<PainelMetasMarco contratoId="contrato-qa" entregavelId="marco-qa" readOnly
    permissoes={{ aprovarVinculosMetasMarco: true } as never} />);
  const gerenciar = await screen.findByRole('button', { name: 'Gerenciar vínculos' });
  await act(async () => { fireEvent.click(gerenciar); });
  expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Justificativa da rejeição do vínculo' })).not.toBeInTheDocument();
});


test('vínculo rejeitado é distinguido de solicitação pendente e não oferece nova decisão', async () => {
  listar.mockResolvedValue({ ...resumo, metas: [{ ...resumo.metas[0],
    vinculos: [{ ...resumo.metas[0].vinculos[0], status: 'REJEITADO' }] }] });
  render(<PainelMetasMarco contratoId="contrato-qa" entregavelId="marco-qa"
    permissoes={{ aprovarVinculosMetasMarco: true } as never} />);
  const gerenciar = await screen.findByRole('button', { name: 'Gerenciar vínculos' });
  await act(async () => { fireEvent.click(gerenciar); });
  expect(screen.getByText('Rejeitado')).toBeInTheDocument();
  expect(screen.queryByText('Pendente de aprovação')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Rejeitar' })).not.toBeInTheDocument();
});
