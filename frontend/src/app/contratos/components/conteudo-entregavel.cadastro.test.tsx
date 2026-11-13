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
  // Modal aninhado mantém visível o contexto anterior, conforme modal-etapa.test.tsx.
  expect(modal.parentElement).toHaveClass('bg-black/[0.055]', 'items-center');
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
  expect(within(modal).getByRole('textbox', { name: /Orientações/ })).toHaveAttribute('maxLength', '65');
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
  const barra = await screen.findByRole('img', { name: '1 de 4 evidências obrigatórias verificadas' });
  await waitFor(() => expect(screen.getByText('1/4 evidências obrigatórias')).toBeInTheDocument());
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
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências finalizadas' }));
  expect(await screen.findByText('laudo-final.pdf')).toBeInTheDocument();
  expect(screen.getByText('Relatório')).toBeInTheDocument();
  const itemVerificado = screen.getByText('laudo-final.pdf').closest('li');
  expect(itemVerificado).toHaveClass('border-violet-500/60');
  expect(itemVerificado).toHaveClass('hover:border-violet-400', 'hover:opacity-100');
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
  const dialogo = screen.getByRole('dialog', { name: 'Desarquivar evidência?' });
  fireEvent.change(within(dialogo).getByRole('textbox', { name: /Justificativa obrigatória/ }), { target: { value: 'Retomar esta evidência para complementar o checklist.' } });
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Confirmar desarquivamento' }));
  await waitFor(() => expect(reativar).toHaveBeenCalledWith('contrato-qa', 'entregavel-qa', 'evidencia-arch', 'reativar', 'Retomar esta evidência para complementar o checklist.'));
  expect(screen.getByRole('tab', { name: 'Evidências arquivadas' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByText('Nenhuma evidência arquivada.')).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: /Evidência esperada/i })).not.toBeInTheDocument();
});


test('pai arquivado mantém aba de histórico de evidências mesmo sem permissão de edição', async () => {
  const listar = listarEvidenciasArquivadas as jest.Mock;
  listar.mockResolvedValue([{ id: 'evidencia-historica', tipoEvidencia: 'Relatório', obrigatoria: true, arquivadoEm: null }]);
  render(<ConteudoEntregavel item={item} paiArquivado bloqueadoPorPai />);
  const aba = screen.getByRole('tab', { name: 'Evidências arquivadas' });
  fireEvent.click(aba);
  expect(await screen.findByText(/somente leitura por arquivamento do pai/)).toBeInTheDocument();
  expect(listar).toHaveBeenCalledWith('contrato-qa', 'entregavel-qa');
  expect(screen.queryByRole('button', { name: 'Reativar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Nova evidência/ })).not.toBeInTheDocument();
});


test('criação em entregável em revisão recebe o contexto, mas não muda o estado do registro', () => {
  render(<ConteudoEntregavel item={item} paiEmRevisao podeCriarEvidencia />);
  const secao = screen.getByRole('heading', { name: 'Identificação e planejamento' }).closest('[data-tec08-secao-contextual]');
  expect(secao).toBeInTheDocument();
  const botao = screen.getByRole('button', { name: 'Nova evidência' });
  expect(botao).toHaveAttribute('data-tec08-acao-criar');
  fireEvent.click(botao);
  const modal = screen.getByRole('dialog', { name: 'Nova evidência esperada' });
  expect(modal).toHaveAttribute('data-tec08-estado', 'normal'); // Nova evidência começa neutra/verde; o registro existente mantém seu próprio estado.
  expect(within(modal).getByRole('form', { name: 'Cadastrar evidência esperada' })).toHaveAttribute('data-tec08-formulario-contextual');
});

test('evidência pendente mantém estado próprio no cartão e no ícone', async () => {
  consultar.mockResolvedValue({
    id: 'evidencia-pendente', contratoId: 'contrato-qa', entregavelId: 'entregavel-qa',
    status: 'PENDENTE_VERIFICACAO', versoes: [{ nomeOriginal: 'comprovante.pdf' }],
  });
  render(<ConteudoEntregavel item={{ ...item, evidenciasEsperadas: [
    { id: 'evidencia-pendente', tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true },
  ] }} paiEmRevisao />);
  const situacao = await screen.findByText('Pendente de verificação');
  const cartao = situacao.closest('[data-evidencia-estado]');
  expect(cartao).toHaveAttribute('data-evidencia-estado', 'pendente');
  expect(cartao?.querySelector('[data-tec08-icone-evidencia]')).toBeInTheDocument();
});


test('evidência opcional verificada continua violeta mesmo com etapa arquivada', async () => {
  consultar.mockResolvedValue({
    id: 'evidencia-opcional', contratoId: 'contrato-qa', entregavelId: 'entregavel-qa',
    status: 'VERIFICADA', versoes: [{ nomeOriginal: 'foto-final.jpg' }],
  });
  render(<ConteudoEntregavel item={{ ...item, statusExecucao: 'CONCLUIDO', evidenciasEsperadas: [
    { id: 'evidencia-opcional', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false },
  ] }} paiArquivado bloqueadoPorPai />);
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências finalizadas' }));
  const opcional = await screen.findByRole('list', { name: 'Evidências opcionais' });
  const card = opcional.querySelector('[data-evidencia-estado]');
  expect(card).toHaveAttribute('data-evidencia-estado', 'concluido');
  expect(card).toHaveAttribute('data-tec08-item-clicavel');
  expect(card).toHaveClass('border-violet-500/60');
  expect(card).not.toHaveClass('border-amber-500/60');
  const contexto = screen.getByRole('heading', { name: 'Identificação e planejamento' }).closest('[data-tec08-contexto-operacional]');
  expect(contexto).toHaveAttribute('data-tec08-estado', 'concluido');
  expect(screen.queryByRole('button', { name: 'Nova evidência' })).not.toBeInTheDocument();
});


test('navegação do entregável separa evidências e atividades sem duplicar as seções', () => {
  render(<ConteudoEntregavel item={item} />);
  const evidencia = screen.getByRole('tab', { name: 'Evidências' });
  const atividade = screen.getByRole('tab', { name: 'Atividades' });
  expect(evidencia).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Evidências' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Ativas' })).toBeInTheDocument();
  fireEvent.click(atividade);
  expect(atividade).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByRole('tabpanel', { name: 'Atividades' })).toBeInTheDocument();
  expect(screen.queryByRole('tabpanel', { name: 'Evidências' })).not.toBeInTheDocument();
  fireEvent.click(evidencia);
  expect(screen.getByRole('tab', { name: 'Ativas' })).toBeInTheDocument();
});

test('Ativas e Concluídas separam evidências sem perder a contagem obrigatória', async () => {
  consultar.mockImplementation((_c: string, _e: string, id: string) => Promise.resolve({
    id, contratoId: 'contrato-qa', entregavelId: 'entregavel-qa',
    status: id === 'e1' ? 'VERIFICADA' : 'SEM_ENVIO', versoes: [],
  }));
  render(<ConteudoEntregavel item={{ ...item, evidenciasEsperadas: [
    { id: 'e1', tipoEvidencia: 'Relatório', descricao: null, obrigatoria: true },
    { id: 'e2', tipoEvidencia: 'Foto', descricao: null, obrigatoria: false },
  ] }} />);
  expect(await screen.findByText('1/1 evidências obrigatórias')).toBeInTheDocument();
  expect(screen.getByText('0/1 opcionais verificadas · não bloqueiam a conclusão')).toBeInTheDocument();
  expect(screen.getByRole('list', { name: 'Evidências opcionais' })).toBeInTheDocument();
  expect(screen.queryByRole('list', { name: 'Evidências obrigatórias' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências finalizadas' }));
  expect(screen.getByRole('list', { name: 'Evidências obrigatórias' })).toBeInTheDocument();
});

test('clicar no espaço do cartão de evidência abre o mesmo detalhe do título', async () => {
  // Aguarda a consulta real de status antes do clique: o componente mantém os
  // cartões ocultos enquanto resolve as evidências para não exibir status falso.
  consultar.mockImplementation((_contrato: string, _entregavel: string, id: string) => Promise.resolve({
    id, contratoId: 'contrato-qa', entregavelId: 'entregavel-qa', status: 'SEM_ENVIO', versoes: [],
  }));
  const exemplo = { ...item, evidenciasEsperadas: [{ id: 'evid-card', tipoEvidencia: 'Relatório', descricao: 'Inspecionar', obrigatoria: true }] };
  render(<ConteudoEntregavel item={exemplo} />);
  await waitFor(() => expect(consultar).toHaveBeenCalledWith('contrato-qa', 'entregavel-qa', 'evid-card'));
  expect(await screen.findByText('0/1 evidências obrigatórias', {}, { timeout: 3000 })).toBeInTheDocument();
  const card = await screen.findByLabelText('Abrir detalhes da evidência Relatório');
  // A área clicável do título cobre todo o cartão, inclusive espaços vazios,
  // sem sobrepor os botões de edição/arquivamento no rodapé.
  expect(within(card).getByRole('button', { name: 'Ver detalhes da evidência esperada Relatório' })).toHaveClass('before:inset-0', 'before:absolute');
  fireEvent.click(card);
  expect(await screen.findByRole('dialog', { name: 'Relatório' })).toBeInTheDocument();
});


test('cartão arquivado é clicável por completo sem acionar reativação', async () => {
  (listarEvidenciasArquivadas as jest.Mock).mockResolvedValue([
    { id: 'evid-arquivada', tipoEvidencia: 'Relatório histórico', obrigatoria: true, arquivadoEm: '2026-11-05T00:00:00Z' },
  ]);
  render(<ConteudoEntregavel item={item} podeReativarEvidencia />);
  fireEvent.click(screen.getByRole('tab', { name: 'Evidências arquivadas' }));
  const card = await screen.findByLabelText('Abrir detalhes da evidência arquivada Relatório histórico');
  expect(within(card).getByRole('button', { name: /Relatório histórico/ })).toHaveClass('before:inset-0', 'before:absolute');
  fireEvent.click(card);
  expect(await screen.findByRole('dialog', { name: 'Relatório histórico' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog', { name: 'Desarquivar evidência?' })).not.toBeInTheDocument();
});
