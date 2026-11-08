import {
  ErroDocumento, formatarDataDocumento, formatarTamanhoDocumento, listarDocumentos, enviarDocumento,
  obterDownloadDocumento, validarSelecaoDocumento,
} from './documentos';

const id = '11111111-1111-4111-8111-111111111111';
const exemplo = new File(['%PDF-1.4\n%%EOF\n'], 'principal.pdf', { type: 'application/pdf' });
const buscar = jest.fn();
beforeEach(() => { jest.resetAllMocks(); global.fetch = buscar as typeof fetch; });

test('GET protegido usa credenciais e filtros sem cache público', async () => {
  buscar.mockResolvedValue({ ok: true, json: async () => ({ itens: [], pagina: 2, total: 0, totalPaginas: 1 }) });
  await listarDocumentos(id, 'ADITIVO', 2);
  expect(buscar).toHaveBeenCalledWith(expect.stringContaining(`/contratos/${id}/documentos?pagina=2&categoria=ADITIVO`),
    expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
});

test('POST utiliza FormData, não envia Content-Type JSON e mantém categoria', async () => {
  buscar.mockResolvedValue({ ok: true, json: async () => ({ id: 'doc' }) });
  await enviarDocumento(id, 'CONTRATO_PRINCIPAL', exemplo, 'Documento oficial');
  const parametros = buscar.mock.calls[0][1] as RequestInit;
  expect(parametros.credentials).toBe('include');
  expect(parametros.method).toBe('POST');
  expect(parametros.body).toBeInstanceOf(FormData);
  const dados = parametros.body as FormData;
  expect(dados.get('categoria')).toBe('CONTRATO_PRINCIPAL');
  expect(dados.get('descricao')).toBe('Documento oficial');
  expect(dados.get('arquivo')).toBe(exemplo);
  expect((parametros.headers as Record<string, string>)['Content-Type']).toBeUndefined();
});

test('download busca somente pela API com credenciais, nunca usa storageKey', async () => {
  buscar.mockResolvedValue({ ok: true, blob: async () => new Blob(['conteudo']) });
  const download = await obterDownloadDocumento(id, '22222222-2222-4222-8222-222222222222');
  expect(download).toBeInstanceOf(Blob);
  expect(buscar.mock.calls[0][0]).toMatch(/\/documentos\/22222222-2222-4222-8222-222222222222\/download$/);
  expect(buscar.mock.calls[0][1].credentials).toBe('include');
});

test('rejeita PDF oficial falso e limite antes do envio, mas backend continua autoridade', () => {
  expect(validarSelecaoDocumento(new File(['oi'], 'principal.txt', { type: 'text/plain' }), 'CONTRATO_PRINCIPAL'))?.toMatch(/PDF/);
  expect(validarSelecaoDocumento(new File([], 'vazio.pdf', { type: 'application/pdf' }), 'ANEXO'))?.toMatch(/vazio/);
  expect(validarSelecaoDocumento(new File(['a'], '.segredo.pdf', { type: 'application/pdf' }), 'ANEXO')).toBeTruthy();
  expect(validarSelecaoDocumento(exemplo, 'CONTRATO_PRINCIPAL')).toBeNull();
});

test('status de rede, autorização e arquivo indisponível são distintos', async () => {
  buscar.mockRejectedValueOnce(new TypeError('offline'));
  await expect(listarDocumentos(id, '', 1)).rejects.toMatchObject({ status: 0 });
  buscar.mockResolvedValueOnce({ ok: false, status: 403 });
  await expect(obterDownloadDocumento(id, 'doc')).rejects.toMatchObject({ status: 403 });
  buscar.mockResolvedValueOnce({ ok: false, status: 503 });
  await expect(obterDownloadDocumento(id, 'doc')).rejects.toMatchObject({ status: 503 });
  expect(new ErroDocumento(400, 'erro').name).toBe('ErroDocumento');
});

test('formatos de tamanho/data são legíveis e não inventam datas inválidas', () => {
  expect(formatarTamanhoDocumento(33)).toBe('33 B');
  expect(formatarTamanhoDocumento(1024)).toContain('KiB');
  expect(formatarDataDocumento('invalido')).toBe('Data indisponível');
});


test('mensagens de arquivo inválido não exigem conhecimento técnico', () => {
  const incompatível = new File(['texto'], 'principal.pdf', { type: 'text/plain' });
  const mensagem = validarSelecaoDocumento(incompatível, 'CONTRATO_PRINCIPAL');
  expect(mensagem).toMatch(/formato.*não foi reconhecido/i);
  expect(mensagem).not.toMatch(/MIME|política provisória|PQ-11|API/i);
  const grande = new File(['arquivo'], 'grande.pdf', { type: 'application/pdf' });
  Object.defineProperty(grande, 'size', { value: 16 * 1024 * 1024 + 1 });
  expect(validarSelecaoDocumento(grande, 'CONTRATO_PRINCIPAL')).toMatch(/limite atual.*16 MB/i);
});
