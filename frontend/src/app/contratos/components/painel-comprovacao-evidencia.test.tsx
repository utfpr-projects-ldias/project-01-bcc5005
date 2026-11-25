import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PainelComprovacaoEvidencia } from './painel-comprovacao-evidencia';
import { consultarEvidencia, editarEvidencia, enviarComprovante, verificarComprovante, alterarArquivoEvidencia, editarContribuicaoEvidencia } from '@/lib/comprovantes';
jest.mock('@/lib/comprovantes', () => ({
  ...jest.requireActual('@/lib/comprovantes'),
  consultarEvidencia: jest.fn(), editarEvidencia: jest.fn(), editarContribuicaoEvidencia: jest.fn(), enviarComprovante: jest.fn(),
  verificarComprovante: jest.fn(), baixarComprovante: jest.fn(), alterarArquivoEvidencia: jest.fn(),
}));
const consultar = consultarEvidencia as jest.Mock;
const editar = editarEvidencia as jest.Mock;
const enviar = enviarComprovante as jest.Mock;
const verificar = verificarComprovante as jest.Mock;
const alterarArquivo = alterarArquivoEvidencia as jest.Mock;
const dados = { id: 'evidencia-1', contratoId: 'contrato-1', entregavelId: 'entregavel-1',
  tipoEvidencia: 'Relatório', descricao: 'Comprovante esperado', obrigatoria: true,
  status: 'PENDENTE_VERIFICACAO', podeVerificar: true,
  versoes: [{ id: 'comprovante-1', nomeOriginal: 'arquivo.txt', tipoMime: 'text/plain', tamanho: 5,
    autorId: 'autor-qa', descricao: null, status: 'PENDENTE_VERIFICACAO',
    verificadoPor: null, verificadoEm: null, criadoEm: '2026-11-03T21:00:00Z' }] };
const props = { contratoId: 'contrato-1', entregavelId: 'entregavel-1', esperadaId: 'evidencia-1', podeEditar: true };
beforeEach(() => {
  jest.clearAllMocks(); consultar.mockResolvedValue({ ...dados });
  editar.mockResolvedValue({ id: dados.id });
  verificar.mockResolvedValue({ ...dados.versoes[0], status: 'VERIFICADA' });
  enviar.mockResolvedValue({ ...dados.versoes[0] });
  alterarArquivo.mockResolvedValue({ id: 'evidencia-1', arquivadoEm: '2026-11-04T00:00:00Z' });
});

test('exibe a pendência em laranja, sem confundir evidência com execução concluída', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  expect(await screen.findByTestId('status-verificacao')).toHaveTextContent('Pendente de verificação');
  expect(screen.getByTestId('status-verificacao')).toHaveClass('text-yellow-300');
  expect(screen.getByText('Comprovante esperado')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verificar comprovante' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Substituir comprovante' }));
  expect(screen.getByText(/Escolha o novo arquivo para criar outra versão/i)).toBeInTheDocument();
});

test('edição é individual e não envia o array inteiro do checklist', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar orientações' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Orientações da evidência' }), { target: { value: 'Nova orientação' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar orientações' }));
  await waitFor(() => expect(editar).toHaveBeenCalledWith('contrato-1','entregavel-1','evidencia-1', { descricao: 'Nova orientação' }));
});

test('alterar obrigatoriedade exige delegação, aparece abaixo do arquivo e não envia outro comprovante', async () => {
  const view = render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Evidência obrigatória' });
  expect(checkbox).toBeChecked();
  expect(checkbox.closest('label')?.compareDocumentPosition(screen.getByRole('button', { name: 'Substituir comprovante' })))
    .toBeTruthy();
  fireEvent.click(checkbox);
  await waitFor(() => expect(editar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', { obrigatoria: false }));
  expect(enviar).not.toHaveBeenCalled();
  view.unmount();
  render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade={false} />);
  await screen.findByTestId('status-verificacao');
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
});

test('checkbox controlado muda imediatamente e confirma a obrigatoriedade após PATCH/GET', async () => {
  let concluir: (resposta: { id: string }) => void = () => {};
  editar.mockImplementationOnce(() => new Promise(resolve => { concluir = resolve; }));
  consultar.mockResolvedValueOnce({ ...dados }).mockResolvedValue({ ...dados, obrigatoria: false });
  render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Evidência obrigatória' });
  expect(checkbox).toBeChecked();
  fireEvent.click(checkbox);
  // Regressão real: não exigir que o navegador aguarde a resposta HTTP para
  // observar a mudança de estado de um checkbox controlado por React.
  expect(checkbox).not.toBeChecked();
  await waitFor(() => expect(editar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', { obrigatoria: false }));
  await act(async () => { concluir({ id: dados.id }); });
  await waitFor(() => expect(checkbox).toBeEnabled());
  expect(checkbox).not.toBeChecked();
});

test('checkbox reverte a mudança quando o PATCH é rejeitado', async () => {
  let rejeitar: (motivo: Error) => void = () => {};
  editar.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejeitar = reject; }));
  consultar.mockResolvedValue({ ...dados });
  render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade />);
  const checkbox = await screen.findByRole('checkbox', { name: 'Evidência obrigatória' });
  fireEvent.click(checkbox);
  expect(checkbox).not.toBeChecked();
  await act(async () => { rejeitar(new Error('Alteração bloqueada pela API')); });
  await waitFor(() => expect(checkbox).toBeChecked());
  expect(screen.getByRole('alert')).toHaveTextContent('Alteração bloqueada pela API');
  expect(enviar).not.toHaveBeenCalled();
});

test('botão de verificação não é mostrado quando backend não autoriza', async () => {
  consultar.mockResolvedValue({ ...dados, podeVerificar: false });
  render(<PainelComprovacaoEvidencia {...props} podeEditar={false} podeEnviar={false} />);
  expect(await screen.findByTestId('status-verificacao')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verificar comprovante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Substituir comprovante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
});


test('modo de edição apresenta somente a evidência selecionada, não o formulário nem upload do entregável', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Substituir comprovante' }));
  expect(screen.getByRole('region', { name: 'Edição individual da evidência' })).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Substituir comprovante' })).toBeInTheDocument();
  expect(screen.getByRole('form', { name: 'Enviar comprovação' })).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: /Editar entregável/ })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição do arquivo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Substituir comprovante' }));
  expect(screen.getByLabelText('Substituir arquivo (opcional)')).toHaveAttribute('type', 'file');
});

test('envio de comprovante usa apenas a evidência selecionada e não verifica automaticamente', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Substituir comprovante' }));
  const arquivo = new File(['relatorio'], 'relatorio.pdf', { type: 'application/pdf' });
  fireEvent.change(await screen.findByLabelText('Substituir arquivo (opcional)'), { target: { files: [arquivo] } });
  fireEvent.click(screen.getByRole('button', { name: 'Substituir anexo' }));
  await waitFor(() => expect(enviar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', arquivo, ''));
  expect(verificar).not.toHaveBeenCalled();
});

test('seletor de arquivo permanece em português e mostra o nome escolhido', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  await screen.findByTestId('status-verificacao');
  fireEvent.click(screen.getByRole('button', { name: 'Substituir comprovante' }));
  expect(screen.getByLabelText('Substituir arquivo (opcional)')).toHaveAttribute('type', 'file');
  const arquivo = new File(['foto'], 'foto-qa.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Substituir arquivo (opcional)'), { target: { files: [arquivo] } });
  expect((screen.getByLabelText('Substituir arquivo (opcional)') as HTMLInputElement).files?.[0]?.name).toBe('foto-qa.png');
});

test('arquivar não remove versões nem mostra ações para leitor', async () => {
  consultar.mockResolvedValue({ ...dados, arquivadoEm: '2026-11-04T01:00:00Z', podeVerificar: false });
  render(<PainelComprovacaoEvidencia {...props} podeEditar={false} />);
  expect(await screen.findByText(/Evidência arquivada/)).toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Enviar comprovação' })).not.toBeInTheDocument();
  expect(screen.getByText('arquivo.txt')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Arquivar evidência' })).not.toBeInTheDocument();
});


test('arquivamento direto tem ícone separado do envio e confirmação cancela sem persistir', async () => {
  render(<PainelComprovacaoEvidencia {...props} podeArquivar />);
  await screen.findByTestId('status-verificacao');
  expect(screen.getByRole('button', { name: 'Arquivar evidência' })).toBeInTheDocument();
  const upload = screen.getByRole('button', { name: 'Substituir comprovante' });
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar evidência' }));
  const alerta = screen.getByRole('alertdialog', { name: 'Confirmar arquivamento da evidência' });
  expect(alerta).toHaveTextContent('serão preservados');
  fireEvent.click(within(alerta).getByRole('button', { name: 'Cancelar' }));
  expect(alterarArquivo).not.toHaveBeenCalled();
  expect(upload).toBeInTheDocument();
});

test('arquivamento do requisito correto ocorre apenas após confirmação e preserva o histórico', async () => {
  const onArquivada = jest.fn();
  render(<PainelComprovacaoEvidencia {...props} podeArquivar onArquivada={onArquivada} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Arquivar evidência' }));
  expect(alterarArquivo).not.toHaveBeenCalled();
  fireEvent.click(within(screen.getByRole('alertdialog', { name: 'Confirmar arquivamento da evidência' }))
    .getByRole('button', { name: 'Confirmar arquivamento' }));
  await waitFor(() => expect(alterarArquivo).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', 'arquivar'));
  await waitFor(() => expect(onArquivada).toHaveBeenCalledTimes(1));
});


test('delegação apenas para arquivar evidência mantém operação disponível sem permitir editar', async () => {
  render(<PainelComprovacaoEvidencia {...props} podeEditar={false} podeEnviar={false} podeArquivar />);
  await screen.findByTestId('status-verificacao');
  expect(screen.queryByRole('button', { name: 'Substituir comprovante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Arquivar evidência' }));
  expect(screen.getByRole('alertdialog', { name: 'Confirmar arquivamento da evidência' })).toBeInTheDocument();
});

test('clipe abre seletor nativo imediatamente, sem exibir formulário vazio; após escolher, permite confirmar envio', async () => {
  consultar.mockResolvedValue({ ...dados, status: 'SEM_ENVIO', versoes: [] });
  render(<PainelComprovacaoEvidencia {...props} />);
  expect(await screen.findByText('Nenhum comprovante registrado.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Baixar comprovante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('form', { name: 'Anexar comprovante' })).not.toBeInTheDocument();
  const seletor = screen.getByLabelText('Selecionar arquivo');
  const abrir = jest.spyOn(seletor, 'click');
  fireEvent.click(screen.getByRole('button', { name: 'Anexar comprovante' }));
  expect(abrir).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole('form', { name: 'Anexar comprovante' })).not.toBeInTheDocument();
  const arquivo = new File(['conteudo'], 'primeiro.pdf', { type: 'application/pdf' });
  fireEvent.change(seletor, { target: { files: [arquivo] } });
  const formulario = screen.getByRole('form', { name: 'Anexar comprovante' });
  const cartaoComprovante = screen.getByRole('region', { name: 'Comprovação da evidência' }).querySelector('.rounded-xl');
  expect(cartaoComprovante).toContainElement(formulario);
  expect(formulario.closest('.rounded-xl')).toBe(cartaoComprovante);
  expect(screen.queryByRole('dialog', { name: 'Anexar comprovante' })).not.toBeInTheDocument();
  expect(within(formulario).getByText('primeiro.pdf')).toBeInTheDocument();
  fireEvent.click(within(formulario).getByRole('button', { name: 'Anexar' }));
  await waitFor(() => expect(enviar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', arquivo, ''));
  expect(verificar).not.toHaveBeenCalled();
});

test('rastreabilidade apresenta nome do arquivo e responsável sem misturar evidências', async () => {
  consultar.mockResolvedValue({ ...dados, historico: [{
    id: 'evento-1', acao: 'ENTREGAVEL_COMPROVANTE_VERIFICADO', descricao: 'Comprovante verificado',
    ocorridoEm: '2026-11-04T13:04:43Z', nomeArquivo: 'laudo-final.pdf',
    ator: { nome: 'Revisor QA', email: 'revisor@example.com' },
  }] });
  render(<PainelComprovacaoEvidencia {...props} />);
  expect(await screen.findByText('Arquivo: laudo-final.pdf')).toBeInTheDocument();
  expect(screen.getByText(/Revisor QA \(revisor@example.com\)/)).toBeInTheDocument();
});


test('rastreabilidade da evidência identifica nome anterior, novo nome e arquivo do evento', async () => {
  consultar.mockResolvedValue({ ...dados, historico: [{
    id: 'evento-renomeado', acao: 'ENTREGAVEL_EVIDENCIA_ESPERADA_CONFIGURADA',
    descricao: 'Evidência atualizada', ocorridoEm: '2026-11-06T01:00:00Z',
    nomeAnterior: 'Relatório antigo', nomeAtual: 'Relatório atualizado',
    nomeArquivo: 'anexo-original.pdf', ator: null,
  }] });
  render(<PainelComprovacaoEvidencia {...props} />);
  expect(await screen.findByText('Nome anterior: Relatório antigo · Novo nome: Relatório atualizado')).toBeInTheDocument();
  expect(screen.getByText('Arquivo: anexo-original.pdf')).toBeInTheDocument();
});

test('editar tipo antes de anexar não envia comprovante nem mexe em outros itens', async () => {
  consultar.mockResolvedValue({...dados,status:'SEM_ENVIO',versoes:[]});
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar tipo da evidência' }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Tipo da evidência' }), { target: { value: 'Foto' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar tipo da evidência' }));
  await waitFor(() => expect(editar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', {
    tipoEvidencia: 'Foto',
  }));
  expect(enviar).not.toHaveBeenCalled();
});

test('editor permite trocar versão do arquivo sem fazer PATCH desnecessário', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Substituir comprovante' }));
  const f = new File(['conteudo'], 'novo-relatorio.pdf', { type: 'application/pdf' });
  fireEvent.change(screen.getByLabelText('Substituir arquivo (opcional)'), { target: { files: [f] } });
  fireEvent.click(screen.getByRole('button', { name: 'Substituir anexo' }));
  await waitFor(() => expect(enviar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', f, ''));
  expect(editar).not.toHaveBeenCalled();
  expect(verificar).not.toHaveBeenCalled();
});


test('submodal de arquivo mantém foco nas ações de anexo e download por ícones', async () => {
  render(<PainelComprovacaoEvidencia {...props} cancelamentoNoCabecalho />);
  const anexar = await screen.findByRole('button', { name: 'Substituir comprovante' });
  const baixar = screen.getByRole('button', { name: 'Baixar comprovante' });
  expect(anexar.compareDocumentPosition(baixar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  fireEvent.click(anexar);
  expect(screen.getByRole('region', { name: 'Edição individual da evidência' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox', { name: 'Título da evidência' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Substituir comprovante' })).toBeInTheDocument();
});

test('verificação exige confirmação explícita antes de chamar a API', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Verificar comprovante' }));
  const confirmacao = screen.getByRole('dialog', { name: 'Confirmar verificação da evidência?' });
  expect(confirmacao).toHaveTextContent('baixou e analisou');
  expect(verificar).not.toHaveBeenCalled();
  fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
  expect(verificar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar comprovante' }));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Confirmar verificação da evidência?' }))
    .getByRole('button', { name: 'Confirmar verificação' }));
  await waitFor(() => expect(verificar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', 'comprovante-1'));
});

test('arquivo anexado bloqueia tipo, mas orientações continuam editáveis', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  await screen.findByTestId('status-verificacao');
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  expect(editar).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Editar orientações' }));
  expect(screen.getByRole('textbox', { name: 'Orientações da evidência' })).toHaveValue('Comprovante esperado');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar edição das orientações' }));
  expect(enviar).not.toHaveBeenCalled();
});


test('permissão de envio não implica permissão de editar planejamento nem obrigatoriedade', async () => {
  render(<PainelComprovacaoEvidencia {...props} podeEditar={false} podeEnviar />);
  expect(await screen.findByRole('button', { name: 'Substituir comprovante' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
});


test('orientações têm limite visual de 65 caracteres', async () => {
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar orientações' }));
  expect(screen.getByRole('textbox', { name: 'Orientações da evidência' })).toHaveAttribute('maxLength', '65');
});

test('quando já existe comprovante o ícone é lápis e a verificação exige confirmação', async () => {
  render(<PainelComprovacaoEvidencia {...props} somenteLeitura />);
  await screen.findByTestId('status-verificacao');
  expect(screen.queryByRole('button', { name: 'Substituir comprovante' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Verificar comprovante' }));
  expect(screen.getByRole('dialog', { name: 'Confirmar verificação da evidência?' })).toBeInTheDocument();
  expect(verificar).not.toHaveBeenCalled();
});

test('novo comprovante do tipo Foto rejeita documento, sem enviar à API', async () => {
  consultar.mockResolvedValue({ ...dados, tipoEvidencia: 'Foto' });
  render(<PainelComprovacaoEvidencia {...props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Substituir comprovante' }));
  const seletor = screen.getByLabelText('Substituir arquivo (opcional)');
  expect(seletor).toHaveAttribute('accept', '.png,.jpg,.jpeg,.webp');
  fireEvent.change(seletor, { target: { files: [new File(['texto'], 'invalido.txt', { type: 'text/plain' })] } });
  fireEvent.click(screen.getByRole('button', { name: 'Substituir anexo' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Formato incompatível');
  expect(enviar).not.toHaveBeenCalled();
});


test('consulta do cartão permite verificar apenas se a API autoriza, sem liberar edição ou envio', async () => {
  render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade podeEnviar somenteLeitura />);
  expect(await screen.findByTestId('status-verificacao')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar tipo da evidência' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar orientações' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Substituir comprovante' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Verificar comprovante' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Baixar comprovante' })).toBeInTheDocument();
});

test('cancelar anexo inicial restaura o próprio cartão, sem envio ou estado de arquivo residual', async () => {
  consultar.mockResolvedValue({ ...dados, status: 'SEM_ENVIO', versoes: [] });
  render(<PainelComprovacaoEvidencia {...props} />);
  const seletor = await screen.findByLabelText('Selecionar arquivo');
  fireEvent.change(seletor, { target: { files: [new File(['qa'], 'versao-qa.pdf', { type: 'application/pdf' })] } });
  const form = screen.getByRole('form', { name: 'Anexar comprovante' });
  expect(within(form).getByText('versao-qa.pdf')).toBeInTheDocument();
  fireEvent.click(within(form).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('form', { name: 'Anexar comprovante' })).not.toBeInTheDocument();
  expect(screen.getByText('Nenhum comprovante registrado.')).toBeInTheDocument();
  expect(enviar).not.toHaveBeenCalled();
});

test('verificação confirma a contribuição existente sem permitir editar a quantidade', async () => {
  consultar.mockResolvedValue({ ...dados, unidadeMedida: 'computadores', quantidadeMensuravel: true, podeEditarContribuicao: false,
    versoes: [{ ...dados.versoes[0], quantidadeDeclarada: '25.000', quantidadeAprovada: null }] });
  render(<PainelComprovacaoEvidencia {...props} />);
  expect(await screen.findByText('25 computadores')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar contribuição' })).not.toBeInTheDocument();
  fireEvent.click(await screen.findByRole('button', { name: 'Verificar comprovante' }));
  expect(screen.queryByRole('textbox', { name: 'Quantidade verificada da evidência' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar verificação' }));
  await waitFor(() => expect(verificar).toHaveBeenCalledWith('contrato-1', 'entregavel-1', 'evidencia-1', 'comprovante-1'));
});

test('R42: reabertura externa atualiza o painel montado e permite nova verificação', async () => {
  consultar.mockResolvedValueOnce({...dados,status:'VERIFICADA',podeVerificar:false,versoes:[{...dados.versoes[0],status:'VERIFICADA'}]});
  const view=render(<PainelComprovacaoEvidencia {...props} revisaoConsulta={0} somenteLeitura anexacaoDireta/>);
  expect(await screen.findByTestId('status-verificacao')).toHaveTextContent('Verificado');
  expect(screen.queryByRole('button',{name:'Verificar comprovante'})).not.toBeInTheDocument();
  consultar.mockResolvedValue({...dados,reabertoEm:'2026-11-23T20:45:00Z'});
  view.rerender(<PainelComprovacaoEvidencia {...props} revisaoConsulta={1} somenteLeitura anexacaoDireta/>);
  expect(await screen.findByRole('button',{name:'Verificar comprovante'})).toBeInTheDocument();
  expect(screen.getByTestId('status-verificacao')).toHaveTextContent('Pendente de verificação');
  expect(screen.getByRole('button',{name:'Substituir comprovante'})).toBeInTheDocument();
});
test('R42: anexação direta não exige liberar edição de metadados',async()=>{
  consultar.mockResolvedValue({...dados,status:'SEM_ENVIO',versoes:[],podeVerificar:false});
  render(<PainelComprovacaoEvidencia {...props} podeEditar={false} somenteLeitura anexacaoDireta/>);
  expect(await screen.findByRole('button',{name:'Anexar comprovante'})).toBeInTheDocument();
  expect(screen.queryByRole('button',{name:'Editar orientações'})).not.toBeInTheDocument();
});


test('R42 revisado: resposta de consulta anterior não restaura uma evidência já reaberta', async () => {
  let responder: (valor: unknown) => void = () => {};
  consultar.mockImplementationOnce(() => new Promise(resolve => { responder = resolve; }));
  const view = render(<PainelComprovacaoEvidencia {...props} revisaoConsulta={0} somenteLeitura anexacaoDireta />);
  await waitFor(() => expect(consultar).toHaveBeenCalledTimes(1));
  consultar.mockResolvedValue({ ...dados, reabertoEm: '2026-11-23T20:45:00Z' });
  view.rerender(<PainelComprovacaoEvidencia {...props} revisaoConsulta={1} somenteLeitura anexacaoDireta />);
  expect(await screen.findByRole('button', { name: 'Verificar comprovante' })).toBeInTheDocument();
  await act(async () => { responder({ ...dados, status: 'VERIFICADA', podeVerificar: false, versoes: [{ ...dados.versoes[0], status: 'VERIFICADA' }] }); });
  expect(screen.getByTestId('status-verificacao')).toHaveTextContent('Pendente de verificação');
  expect(screen.getByRole('button', { name: 'Verificar comprovante' })).toBeInTheDocument();
});

test('R42 revisado: contexto bloqueado pela API impede edição e anexação mesmo com permissões nominais', async () => {
  consultar.mockResolvedValue({ ...dados, contextoPermiteAlterar: false, podeVerificar: false });
  render(<PainelComprovacaoEvidencia {...props} podeAlterarObrigatoriedade />);
  await screen.findByTestId('status-verificacao');
  expect(screen.queryByRole('button', { name: 'Substituir comprovante' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar orientações' })).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Evidência obrigatória' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Verificar comprovante' })).not.toBeInTheDocument();
});

test('R51: reabertura mostra revisão e controles autorizados no mesmo painel', async () => {
  consultar.mockResolvedValueOnce({...dados,status:'VERIFICADA',podeVerificar:false,versoes:[{...dados.versoes[0],status:'VERIFICADA'}]});
  const view=render(<PainelComprovacaoEvidencia {...props} revisaoConsulta={0}/>);
  expect(await screen.findByTestId('status-verificacao')).toHaveTextContent('Verificado');
  expect(screen.queryByRole('button',{name:'Editar tipo da evidência'})).not.toBeInTheDocument();
  consultar.mockResolvedValue({...dados,reabertoEm:'2026-11-24T12:00:00Z'});
  view.rerender(<PainelComprovacaoEvidencia {...props} revisaoConsulta={1}/>);
  await waitFor(()=>expect(screen.getByTestId('status-verificacao')).toHaveTextContent('Em revisão'));
  expect(screen.getByRole('button',{name:'Verificar comprovante'})).toBeEnabled();
  expect(screen.queryByRole('button',{name:'Editar tipo da evidência'})).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Editar contribuição'})).toBeEnabled();
  expect(screen.getByRole('button',{name:'Substituir comprovante'})).toBeEnabled();
});

test('R51: resposta confirmada da revisão atual não some durante revalidação do painel', async () => {
  consultar.mockResolvedValueOnce({...dados,status:'VERIFICADA',podeVerificar:false,versoes:[{...dados.versoes[0],status:'VERIFICADA'}]});
  const view = render(<PainelComprovacaoEvidencia {...props} revisaoConsulta={0}/>);
  expect(await screen.findByTestId('status-verificacao')).toHaveTextContent('Verificado');
  let resolver: (valor: unknown) => void = () => {};
  consultar.mockImplementationOnce(() => new Promise(resolve => { resolver = resolve; }));
  const reaberta = {...dados,reabertoEm:'2026-11-24T12:00:00Z'} as import('@/lib/comprovantes').DetalheEvidencia;
  view.rerender(<PainelComprovacaoEvidencia {...props} revisaoConsulta={1} detalheConfirmado={reaberta}/>);
  expect(screen.getByTestId('status-verificacao')).toHaveTextContent('Em revisão');
  expect(screen.getByRole('button',{name:'Verificar comprovante'})).toBeEnabled();
  await act(async()=>resolver(reaberta));
  expect(screen.getByTestId('status-verificacao')).toHaveTextContent('Em revisão');
});

 test('corrige a contribuição de um comprovante pendente sem substituir arquivo', async()=>{
  consultar.mockResolvedValue({...dados,tipoEntregavel:'UNICO'});
  (editarContribuicaoEvidencia as jest.Mock).mockResolvedValue(dados.versoes[0]);
  render(<PainelComprovacaoEvidencia {...props}/>);
  fireEvent.click(await screen.findByRole('button',{name:'Editar contribuição'}));
  const modal=screen.getByRole('dialog',{name:'Editar contribuição'});
  fireEvent.click(within(modal).getByRole('button',{name:'Percentual'}));
  fireEvent.change(within(modal).getByLabelText(/Percentual/),{target:{value:'12,50'}});
  fireEvent.click(within(modal).getByRole('button',{name:'Salvar contribuição'}));
  await waitFor(()=>expect(editarContribuicaoEvidencia).toHaveBeenCalledWith('contrato-1','entregavel-1','evidencia-1','comprovante-1',{modalidade:'PERCENTUAL',valor:'12.50'}));
  expect(enviar).not.toHaveBeenCalled();
 });
