import { validarDetalheEvidencia } from './comprovantes';

const completo = {
  id: 'evid-1', contratoId: 'contrato-1', entregavelId: 'entregavel-1',
  tipoEvidencia: 'Relatório de execução', descricao: null, obrigatoria: true,
  status: 'SEM_ENVIO', versoes: [], podeVerificar: false,
};

test('aceita uma evidência válida com título legado não padronizado', () => {
  expect(() => validarDetalheEvidencia(completo)).not.toThrow();
});

test.each([
  ['nulo', null],
  ['valor não objeto', 'comprovante'],
  ['identificador ausente', { ...completo, id: undefined }],
  ['contrato ausente', { ...completo, contratoId: undefined }],
  ['entregável ausente', { ...completo, entregavelId: null }],
  ['tipo ausente', { ...completo, tipoEvidencia: undefined }],
  ['tipo vazio', { ...completo, tipoEvidencia: '   ' }],
  ['status inválido', { ...completo, status: 'INVENTADO' }],
  ['versões não array', { ...completo, versoes: {} }],
])('rejeita %s sem gerar TypeError', (_caso, valor) => {
  expect(() => validarDetalheEvidencia(valor)).toThrow(/(Dados incompletos|resposta da evidência é inválida)/);
});
