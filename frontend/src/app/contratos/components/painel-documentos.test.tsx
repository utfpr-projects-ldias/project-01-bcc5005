import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PainelDocumentos } from './painel-documentos';
import { useDocumentos, useEnviarDocumento } from '@/hooks/use-documentos';
import { obterDownloadDocumento, type PaginaDocumentos } from '@/lib/documentos';

jest.mock('@/hooks/use-documentos', () => ({ useDocumentos: jest.fn(), useEnviarDocumento: jest.fn() }));
jest.mock('@/lib/documentos', () => ({
  ...jest.requireActual('@/lib/documentos'), obterDownloadDocumento: jest.fn(),
}));
const usar = useDocumentos as jest.Mock;
const upload = jest.fn();
const retorno = (dados: PaginaDocumentos | undefined, erro?: Error) => ({
  dados, erro, carregando: false, atualizando: false, atualizar: jest.fn().mockResolvedValue(dados),
});
const doc = {
  id: 'documento-qa', contratoId: 'contrato-qa', categoria: 'ANEXO' as const, descricao: 'Documentação adicional',
  nomeOriginal: 'arquivo.txt', tipoMime: 'text/plain', tamanho: 33, autorId: 'autor-qa', autorNome: 'Pessoa QA', criadoEm: '2026-11-03T06:00:00.000Z',
};
const lista: PaginaDocumentos = { itens: [doc], pagina: 1, total: 1, totalPaginas: 1 };
const vazio: PaginaDocumentos = { itens: [], pagina: 1, total: 0, totalPaginas: 1 };

// jsdom pode não implementar scrollIntoView; instalar o espião sem exigir a API nativa.
function espiarScroll() {
  const anterior = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');
  const spy = jest.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: spy });
  return {
    spy,
    restaurar: () => anterior
      ? Object.defineProperty(Element.prototype, 'scrollIntoView', anterior)
      : Reflect.deleteProperty(Element.prototype, 'scrollIntoView'),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/contratos/contrato-qa');
  (useEnviarDocumento as jest.Mock).mockReturnValue(upload);
  usar.mockImplementation((_id, categoria) => retorno(categoria === 'CONTRATO_PRINCIPAL' ? vazio : lista));
});

test('mostra metadados, estado sem PDF e upload apenas ao perfil editor', async () => {
  const { rerender } = render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  const aviso = await screen.findByTestId('documento-principal-ausente');
  expect(aviso).toHaveAttribute('role', 'status');
  expect(aviso).toHaveTextContent(/documento principal \(PDF\)/i);
  expect(screen.queryByRole('button', { name: 'Anexar documento' })).not.toBeInTheDocument();
  expect(screen.getByText('arquivo.txt')).toBeInTheDocument();
  expect(screen.getByText('Pessoa QA')).toBeInTheDocument();
  expect(screen.getByText('33 B')).toBeInTheDocument();
  rerender(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  expect(screen.getByRole('button', { name: 'Anexar documento' })).toBeInTheDocument();
});

test('upload preserva arquivo/descrição e permite retry quando a API falha', async () => {
  upload.mockRejectedValueOnce(new Error('Falha temporária')).mockResolvedValueOnce({ id: 'novo' });
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
  expect(screen.getByRole('dialog', { name: 'Anexar documento contratual' })).toBeInTheDocument();
  const form = screen.getByRole('form', { name: 'Anexar documento contratual' });
  fireEvent.change(within(form).getByLabelText('Categoria *'), { target: { value: 'ANEXO' } });
  const arquivo = new File(['teste'], 'teste.txt', { type: 'text/plain' });
  fireEvent.change(within(form).getByLabelText('Arquivo *'), { target: { files: [arquivo] } });
  fireEvent.change(within(form).getByLabelText('Descrição (opcional)'), { target: { value: 'QA descrição' } });
  await act(async () => { fireEvent.submit(form); });
  expect(await screen.findByText('Falha temporária')).toBeInTheDocument();
  expect(within(form).getByLabelText('Descrição (opcional)')).toHaveValue('QA descrição');
  expect(screen.getByText(/Selecionado: teste.txt/)).toBeInTheDocument();
  await act(async () => { fireEvent.submit(form); });
  expect(await screen.findByText(/Documento anexado/)).toBeInTheDocument();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload).toHaveBeenCalledWith('ANEXO', arquivo, 'QA descrição');
});

test('filtro por categoria persiste em sessionStorage e distingue busca local', async () => {
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Filtrar por categoria'), { target: { value: 'ANEXO' } });
  expect(JSON.parse(sessionStorage.getItem('tec08-documentos-filtro:contrato-qa')!).categoria).toBe('ANEXO');
  expect(usar).toHaveBeenCalledWith('contrato-qa', 'ANEXO', 1, true);
  fireEvent.change(screen.getByLabelText('Buscar nome nesta página'), { target: { value: 'outro' } });
  expect(screen.getByText(/Nenhum nome correspondente nesta página/)).toBeInTheDocument();
});

test('download do item correto usa API protegida e informa falhas', async () => {
  (obterDownloadDocumento as jest.Mock).mockRejectedValueOnce(new Error('Arquivo temporariamente indisponível'));
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Baixar arquivo.txt' }));
  expect(await screen.findByText(/Arquivo temporariamente indisponível/)).toBeInTheDocument();
  expect(obterDownloadDocumento).toHaveBeenCalledWith('contrato-qa', 'documento-qa');
});

test('erro de autorização remove lista protegida do DOM', async () => {
  usar.mockImplementation(() => retorno(lista, Object.assign(new Error('Sem permissão'), { status: 403 })));
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  await act(async () => {});
  expect(screen.queryByText('arquivo.txt')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Sem permissão');
});

test('TEC08-03: restaura filtros por contrato sem atualizá-los em useEffect', async () => {
  sessionStorage.setItem('tec08-documentos-filtro:contrato-qa', JSON.stringify({ categoria: 'ANEXO', pagina: 1, busca: 'arquivo' }));
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  await waitFor(() => expect(screen.getByLabelText('Filtrar por categoria')).toHaveValue('ANEXO'));
  expect(screen.getByLabelText('Buscar nome nesta página')).toHaveValue('arquivo');
  expect(usar).toHaveBeenCalledWith('contrato-qa', 'ANEXO', 1, true);
});

test('TEC08-03: pós-cadastro abre modal de PDF sem rolar a página; fechar e reabrir funciona', async () => {
  window.history.replaceState({}, '', '/contratos/contrato-qa?anexarDocumento=principal');
  const { spy: scrollSpy, restaurar } = espiarScroll();
  try {
    render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
    const dialogo = await screen.findByRole('dialog', { name: 'Anexar documento contratual' });
    expect(dialogo).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Categoria *')).toHaveValue('CONTRATO_PRINCIPAL');
    expect(screen.getByText(/O cadastro do contrato está concluído/)).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Fechar anexo de documento' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
    expect(screen.getByRole('dialog', { name: 'Anexar documento contratual' })).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  } finally { restaurar(); }
});


test('modal fecha por Escape e clique fora sem navegar; formulário mantém foco e o estado da lista', async () => {
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  const abrir = screen.getByRole('button', { name: 'Anexar documento' });
  fireEvent.click(abrir);
  let dialogo = screen.getByRole('dialog', { name: 'Anexar documento contratual' });
  expect(document.body.style.overflow).toBe('hidden');
  fireEvent.keyDown(dialogo, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByText('arquivo.txt')).toBeInTheDocument();
  fireEvent.click(abrir);
  dialogo = screen.getByRole('dialog', { name: 'Anexar documento contratual' });
  fireEvent.mouseDown(dialogo.parentElement!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('selecionar categoria ou arquivo não desmonta o modal e não chama scrollIntoView', async () => {
  const { spy: scrollSpy, restaurar } = espiarScroll();
  try {
    render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
    fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
    const dialogo = screen.getByRole('dialog', { name: 'Anexar documento contratual' });
    const form = screen.getByRole('form', { name: 'Anexar documento contratual' });
    fireEvent.change(within(form).getByLabelText('Categoria *'), { target: { value: 'ANEXO' } });
    expect(screen.getByText(/Arquivos aceitos: PDF, PNG/)).toBeInTheDocument();
    const arquivo = new File(['exemplo'], 'exemplo.txt', { type: 'text/plain' });
    fireEvent.change(within(form).getByLabelText('Arquivo *'), { target: { files: [arquivo] } });
    expect(screen.getByRole('dialog')).toBe(dialogo);
    expect(screen.getByText(/Selecionado: exemplo.txt/)).toBeInTheDocument();
    expect(scrollSpy).not.toHaveBeenCalled();
  } finally { restaurar(); }
});

test('recarregar contrato que já possui PDF não reabre modal por query antiga', async () => {
  window.history.replaceState({}, '', '/contratos/contrato-qa?anexarDocumento=principal');
  usar.mockImplementation((_id, categoria) => retorno(categoria === 'CONTRATO_PRINCIPAL'
    ? { ...lista, itens: [{ ...doc, categoria: 'CONTRATO_PRINCIPAL' }], total: 1 }
    : lista));
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  await waitFor(() => expect(screen.getByText('Documento principal registrado neste contrato.')).toBeInTheDocument());
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Anexar documento' })).toBeInTheDocument();
});

test('orientações do formulário usam termos claros para quem anexa documentos', async () => {
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
  expect(screen.getByRole('dialog', { name: 'Anexar documento contratual' })).toBeInTheDocument();
  const form = screen.getByRole('form', { name: 'Anexar documento contratual' });
  const orientacao = screen.getByText(/Documento principal: selecione um PDF/);
  expect(orientacao).toHaveTextContent('até aproximadamente 16 MB');
  expect(orientacao.textContent).not.toMatch(/MIME|PQ-11|API|MiB/);
  expect(form).toBeInTheDocument();
});

test('PDF válido substitui seleção recusada, sem bloquear o segundo envio', async () => {
  upload.mockRejectedValueOnce(new Error('Arquivo ou dados inválidos'))
    .mockResolvedValueOnce({ id: 'novo-pdf' });
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  await act(async () => {});
  fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
  expect(screen.getByRole('dialog', { name: 'Anexar documento contratual' })).toBeInTheDocument();
  const form = screen.getByRole('form', { name: 'Anexar documento contratual' });
  const campo = within(form).getByLabelText('Arquivo *');
  fireEvent.change(campo, { target: { files: [new File(['falso'], 'qa-falso.pdf', { type: 'application/pdf' })] } });
  await act(async () => { fireEvent.submit(form); });
  expect(await screen.findByText('Arquivo ou dados inválidos')).toBeInTheDocument();
  const valido = new File(['%PDF-1.4\n%%EOF\n'], 'qa-principal.pdf', { type: 'application/pdf' });
  fireEvent.change(campo, { target: { files: [valido] } });
  expect(screen.queryByText('Arquivo ou dados inválidos')).not.toBeInTheDocument();
  await act(async () => { fireEvent.submit(form); });
  expect(await screen.findByText(/Documento anexado/)).toBeInTheDocument();
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload).toHaveBeenLastCalledWith('CONTRATO_PRINCIPAL', valido, '');
});


test('o seletor do documento usa botão em português sem expor Browse, mantendo input de arquivo acessível', async () => {
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar />);
  fireEvent.click(screen.getByRole('button', { name: 'Anexar documento' }));
  const dialogo = screen.getByRole('dialog', { name: 'Anexar documento contratual' });
  expect(within(dialogo).getByRole('button', { name: 'Escolher arquivo' })).toBeInTheDocument();
  expect(within(dialogo).getByText('Nenhum arquivo selecionado')).toBeInTheDocument();
  const input = within(dialogo).getByLabelText('Arquivo *');
  expect(input).toHaveClass('sr-only');
  expect(input).toHaveAttribute('type', 'file');
  const arq = new File(['conteudo'], 'relatorio-teste.txt', { type: 'text/plain' });
  fireEvent.change(input, { target: { files: [arq] } });
  expect(within(dialogo).getByText('relatorio-teste.txt')).toBeInTheDocument();
});

test('filtro em carregamento preserva a altura da região e não mostra itens de outra categoria', async () => {
  const alturaAnterior = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight');
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 330 });
  try {
    usar.mockImplementation((_id, categoria) =>
      categoria === 'ADITIVO' ? { ...retorno(undefined), carregando: true } :
      retorno(categoria === 'CONTRATO_PRINCIPAL' ? vazio : lista));
    render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
    expect(screen.getByText('arquivo.txt')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Filtrar por categoria'), { target: { value: 'ADITIVO' } });
    const resultados = screen.getByTestId('regiao-resultados-documentos');
    expect(resultados).toHaveAttribute('aria-busy', 'true');
    expect(resultados).toHaveStyle({ minHeight: '330px' });
    expect(screen.getByTestId('resultados-estaveis-carregando')).toHaveTextContent('Atualizando documentos desta categoria...');
    expect(screen.queryByText('arquivo.txt')).not.toBeInTheDocument();
  } finally {
    if (alturaAnterior) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', alturaAnterior);
    else Reflect.deleteProperty(HTMLElement.prototype, 'offsetHeight');
  }
});

test('ao mudar categoria mantém a área dos resultados, sem desmontar o painel inteiro', async () => {
  usar.mockImplementation((_id, categoria) => categoria === 'ADITIVO'
    ? { dados: undefined, carregando: true, erro: undefined, atualizar: jest.fn() }
    : retorno(lista));
  render(<PainelDocumentos contratoId="contrato-qa" habilitado podeAnexar={false} />);
  const raiz = document.querySelector('#documentos-contratuais');
  const controle = screen.getByLabelText('Filtrar por categoria');
  fireEvent.change(controle, { target: { value: 'ADITIVO' } });
  expect(document.querySelector('#documentos-contratuais')).toBe(raiz);
  expect(screen.getByTestId('regiao-resultados-documentos')).toHaveAttribute('aria-busy', 'true');
  expect(screen.getByTestId('resultados-estaveis-carregando')).toHaveTextContent('Atualizando documentos');
  expect(screen.getByRole('heading', { name: 'Documentos do contrato' })).toBeInTheDocument();
  expect(screen.queryByText('arquivo.txt')).not.toBeInTheDocument();
});
