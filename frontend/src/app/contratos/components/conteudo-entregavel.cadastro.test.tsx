import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { criarEvidenciaEsperada, enviarComprovante, consultarEvidencia, listarEvidenciasArquivadas, alterarArquivoEvidencia } from '@/lib/comprovantes';
import type { Entregavel } from '@/lib/entregaveis';

jest.mock('@/lib/comprovantes', () => ({
  ...jest.requireActual('@/lib/comprovantes'),
  consultarEvidencia: jest.fn(),
  criarEvidenciaEsperada: jest.fn(),
  enviarComprovante: jest.fn(),
  listarEvidenciasArquivadas: jest.fn(),
  alterarArquivoEvidencia: jest.fn(),
}));
const criar = criarEvidenciaEsperada as jest.Mock;
const enviar = enviarComprovante as jest.Mock;
const consultar = consultarEvidencia as jest.Mock;
const item: Entregavel = {
  id: 'entregavel-qa', contratoId: 'contrato-qa', etapaId: 'etapa-qa', nome: 'Entregável QA',
  codigo: 'QA-E1', descricao: null, tipo: 'UNICO', responsavelId: null,
  inicioPrevisto: null, terminoPrevisto: null,
  quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null,
  periodicidade: null, configuracaoPeriodicidade: null, peso: null,
  criterioConclusao: null, statusExecucao: null, percentualExecucao: null,
  situacaoComprovacao: null, observacoes: null, evidenciasEsperadas: [],
};
beforeEach(() => {
  jest.clearAllMocks();
  criar.mockResolvedValue({ id: 'evidencia-nova' });
  enviar.mockResolvedValue({ id: 'comprovante-novo' });
});
function abrirCadastro() {
  render(<ConteudoEntregavel item={item} podeCriarEvidencia podeEnviarComprovantes />);
  fireEvent.click(screen.getByRole('button', { name: 'Nova evidência' }));
  const modal = screen.getByRole('dialog', { name: 'Nova evidência esperada' });
  expect(modal.parentElement).toHaveClass('bg-black/[0.025]', 'items-center');
  return modal;
}
test('cadastro com primeiro anexo fecha somente o modal após sucesso, sem duplicar o requisito', async () => {
  const modal = abrirCadastro();
  fireEvent.change(within(modal).getByLabelText('Tipo de evidência'), { target: { value: 'Foto' } });
  const arquivo = new File(['qa'], 'vistoria.png', { type: 'image/png' });
  fireEvent.change(within(modal).getByLabelText(/Comprovante inicial/), { target: { files: [arquivo] } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Cadastrar e anexar' }));
  await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(enviar).toHaveBeenCalledWith('contrato-qa', 'entregavel-qa', 'evidencia-nova', arquivo, ''));
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova evidência esperada' })).not.toBeInTheDocument());
  expect(screen.getByRole('tab', { name: 'Evidências' })).toBeInTheDocument();
});
test('erro no upload mantém o identificador, permitindo reenviar sem criar outra evidência', async () => {
  enviar.mockRejectedValueOnce(new Error('Falha provisória')).mockResolvedValueOnce({ id: 'comprovante-novo' });
  const modal = abrirCadastro();
  fireEvent.change(within(modal).getByLabelText('Tipo de evidência'), { target: { value: 'Relatório' } });
  const arquivo = new File(['qa'], 'relatorio.pdf', { type: 'application/pdf' });
  fireEvent.change(within(modal).getByLabelText(/Comprovante inicial/), { target: { files: [arquivo] } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Cadastrar e anexar' }));
  expect(await within(modal).findByRole('alert')).toHaveTextContent('Falha provisória');
  expect(criar).toHaveBeenCalledTimes(1);
  fireEvent.click(within(modal).getByRole('button', { name: 'Reenviar comprovante' }));
  await waitFor(() => expect(enviar).toHaveBeenCalledTimes(2));
  expect(criar).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova evidência esperada' })).not.toBeInTheDocument());
});

test('cadastro exige seleção de Foto ou Relatório e restringe extensões aceitas', () => {
  const modal = abrirCadastro();
  const tipo = within(modal).getByRole('combobox', { name: 'Tipo de evidência' });
  expect(tipo).toBeRequired();
  expect(within(tipo).getAllByRole('option').map(opcao => opcao.getAttribute('value'))).toEqual(['', 'Foto', 'Relatório']);
  const arquivo = within(modal).getByLabelText(/Comprovante inicial/);
  fireEvent.change(tipo, { target: { value: 'Foto' } });
  expect(arquivo).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp');
  fireEvent.change(tipo, { target: { value: 'Relatório' } });
  expect(arquivo).toHaveAttribute('accept', '.pdf,.doc,.docx,.txt');
  expect(within(modal).getByRole('textbox', { name: /Orientações/ })).toHaveAttribute('maxLength', '130');
});

test('cadastro não cria evidência com formato incompatível', async () => {
  const modal = abrirCadastro();
  fireEvent.change(within(modal).getByRole('combobox', { name: 'Tipo de evidência' }), { target: { value: 'Foto' } });
  fireEvent.change(within(modal).getByLabelText(/Comprovante inicial/), { target: {
    files: [new File(['texto'], 'arquivo.txt', { type: 'text/plain' })],
  } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Cadastrar e anexar' }));
  expect(await within(modal).findByRole('alert')).toHaveTextContent('não corresponde ao tipo');
  expect(criar).not.toHaveBeenCalled();
});


test('barra da comprovação preenche da esquerda para a direita por contagem, não pela posição do requisito', async () => {
  const evidencias = Array.from({ length: 4 }, (_, index) => ({
    id: `evidencia-${index}`, tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true,
  }));
  consultar.mockImplementation((_contrato: string, _entregavel: string, id: string) => Promise.resolve({
    id, contratoId: 'contrato-qa', entregavelId: 'entregavel-qa',
    status: id === 'evidencia-1' ? 'VERIFICADA' : 'SEM_ENVIO', versoes: [],
  }));
  render(<ConteudoEntregavel item={{ ...item, evidenciasEsperadas: evidencias }} podeCriarEvidencia />);
  const barra = await screen.findByRole('img', { name: '1 de 4 evidências previstas verificadas' });
  await waitFor(() => expect(screen.getByText('1/4 evidências esperadas')).toBeInTheDocument());
  const segmentos = Array.from(barra.children);
  expect(segmentos).toHaveLength(4);
  expect(segmentos[0]).toHaveClass('bg-violet-500');
  for (const segmento of segmentos.slice(1)) expect(segmento).not.toHaveClass('bg-violet-500');
});

test('card exibe nome do comprovante e categoria Foto ou Relatório, sem legenda redundante de obrigatoriedade', async () => {
  consultar.mockResolvedValue({
    id: 'evidencia-1', contratoId: 'contrato-qa', entregavelId: 'entregavel-qa',
    status: 'VERIFICADA', versoes: [{ nomeOriginal: 'laudo-final.pdf' }],
  });
  render(<ConteudoEntregavel item={{ ...item, evidenciasEsperadas: [{ id: 'evidencia-1', tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true }] }} />);
  // Um comprovante verificado fica em Concluídas: o teste deve consultar a aba correta.
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências concluídas' }));
  expect(await screen.findByText('laudo-final.pdf')).toBeInTheDocument();
  expect(screen.getByText('Relatório')).toBeInTheDocument();
  const itemVerificado = screen.getByText('laudo-final.pdf').closest('li');
  expect(itemVerificado).toHaveClass('border-violet-500/60');
  expect(itemVerificado).toHaveClass('hover:bg-violet-500/[0.12]');
  expect(itemVerificado).not.toHaveClass('hover:bg-brand-green/5');
  expect(within(itemVerificado!).getByLabelText('Evidência com comprovação documental verificada')).toHaveClass('rounded-full');
  expect(within(itemVerificado!).getByLabelText('Status da evidência Relatório')).toHaveClass('text-violet-100');
  expect(screen.queryByText('Evidência obrigatória')).not.toBeInTheDocument();
});


test('desarquivar pede confirmação, audita via API e mantém aba Arquivados sem abrir evidência', async () => {
  const listar = listarEvidenciasArquivadas as jest.Mock;
  const reativar = alterarArquivoEvidencia as jest.Mock;
  listar.mockResolvedValueOnce([{ id: 'evidencia-arch', tipoEvidencia: 'Relatório', obrigatoria: true, arquivadoEm: '2026-11-05T00:00:00Z' }]);
  reativar.mockResolvedValue(undefined);
  render(<ConteudoEntregavel item={item} podeArquivarEvidencia podeReativarEvidencia />);
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências arquivadas' }));
  expect(await screen.findByText(/Relatório/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
  const confirmar = screen.getByRole('dialog', { name: 'Desarquivar evidência?' });
  expect(reativar).not.toHaveBeenCalled();
  fireEvent.click(within(confirmar).getByRole('button', { name: 'Cancelar' }));
  expect(reativar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Reativar' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Desarquivar evidência?' }))
    .getByRole('button', { name: 'Confirmar desarquivamento' }));
  await waitFor(() => expect(reativar).toHaveBeenCalledWith('contrato-qa', 'entregavel-qa', 'evidencia-arch', 'reativar'));
  expect(screen.getByRole('tab', { name: 'Evidências arquivadas' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Nenhuma evidência arquivada.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /Evidência esperada/i })).not.toBeInTheDocument();
});
