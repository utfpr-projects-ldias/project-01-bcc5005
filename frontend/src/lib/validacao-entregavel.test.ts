import { inicialEntregavel, mudouEstrutura, validarEntregavel } from './validacao-entregavel';
import type { Entregavel, TipoEntregavel } from './entregaveis';
const modelo = (tipo: TipoEntregavel) => ({ ...inicialEntregavel('etapa-a'), tipo, nome: 'Planejamento contratual' });
test('todos os cinco tipos são aceitos com seus parâmetros específicos; sem progressos fictícios', () => {
  for (const tipo of ['UNICO', 'QUANTITATIVO', 'RECORRENTE', 'CONTINUO', 'MARCO'] as const) {
    const r = modelo(tipo);
    if (tipo === 'QUANTITATIVO') { r.quantidadePrevista = '10.250'; r.unidadeMedida = 'unidades'; }
    if (tipo === 'RECORRENTE') r.periodicidade = 'MENSAL';
    if (tipo === 'CONTINUO' || tipo === 'MARCO') r.criterioConclusao = 'Condição objetiva documentada';
    const resultado = validarEntregavel(r);
    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.dados.tipo).toBe(tipo);
      expect(resultado.dados).not.toHaveProperty('percentualExecucao');
      expect(resultado.dados).not.toHaveProperty('situacaoComprovacao');
      expect(resultado.dados.configuracaoPeriodicidade).toEqual(tipo === 'RECORRENTE' ? { versao: 1 } : null);
    }
  }
});
test('quantitativo exige quantidade positiva e unidade; decimais preservados como string', () => {
  const r = modelo('QUANTITATIVO');
  expect(validarEntregavel(r).sucesso).toBe(false);
  r.quantidadePrevista = '0'; r.unidadeMedida = 'horas';
  expect(validarEntregavel(r).sucesso).toBe(false);
  r.quantidadePrevista = '12.250';
  const result = validarEntregavel(r);
  expect(result.sucesso).toBe(true);
  if (result.sucesso) expect(result.dados.quantidadePrevista).toBe('12.250');
  r.quantidadePrevista = '10.1234'; expect(validarEntregavel(r).sucesso).toBe(false);
});
test('recorrente aceita somente periodicidade fixa, demais tipos limpam parâmetros ocultos', () => {
  const r = modelo('RECORRENTE');
  expect(validarEntregavel(r).sucesso).toBe(false);
  r.periodicidade = 'MENSAL'; expect(validarEntregavel(r).sucesso).toBe(true);
  r.tipo = 'UNICO';
  const validado = validarEntregavel(r);
  expect(validado.sucesso).toBe(true);
  if (validado.sucesso) { expect(validado.dados.periodicidade).toBeNull(); expect(validado.dados.configuracaoPeriodicidade).toBeNull(); }
});
test('Marco e Contínuo exigem critério, mantendo demais campos opcionais', () => {
  for (const tipo of ['MARCO', 'CONTINUO'] as const) {
    const r = modelo(tipo); expect(validarEntregavel(r).sucesso).toBe(false);
    r.criterioConclusao = 'Um registro verificável'; expect(validarEntregavel(r).sucesso).toBe(true);
  }
});
test('datas civis válidas; término não pode anteceder início; UUID e peso operacional', () => {
  const r = modelo('UNICO');
  r.inicioPrevisto = '2026-02-29'; expect(validarEntregavel(r).sucesso).toBe(false);
  r.inicioPrevisto = '2028-02-29'; r.terminoPrevisto = '2028-02-28'; expect(validarEntregavel(r).sucesso).toBe(false);
  r.terminoPrevisto = '2028-03-01'; r.peso = '100.0001'; expect(validarEntregavel(r).sucesso).toBe(false);
  r.peso = '12.5000'; r.responsavelId = 'invalido'; expect(validarEntregavel(r).sucesso).toBe(false);
  r.responsavelId = '12345678-1234-4123-8123-123456789abc'; expect(validarEntregavel(r).sucesso).toBe(true);
});
test('checklist preserva IDs ao editar e valida obrigatoriedade', () => {
  const r = modelo('UNICO');
  r.evidenciasEsperadas = [
    { id: '1234', chave: 'antigo', tipoEvidencia: 'Relatório', descricao: 'PDF', obrigatoria: true },
    { chave: 'novo', tipoEvidencia: 'Foto', descricao: '', obrigatoria: false },
  ];
  const v = validarEntregavel(r);
  expect(v.sucesso).toBe(true);
  if (v.sucesso) expect(v.dados.evidenciasEsperadas).toEqual([
    { id: '1234', tipoEvidencia: 'Relatório', descricao: 'PDF', obrigatoria: true },
    { tipoEvidencia: 'Foto', descricao: null, obrigatoria: false },
  ]);
  r.evidenciasEsperadas[0].tipoEvidencia = '';
  expect(validarEntregavel(r).sucesso).toBe(false);
  r.evidenciasEsperadas = Array.from({ length: 101 }, (_, i) => ({ chave: String(i), tipoEvidencia: 'Arquivo', descricao: '', obrigatoria: true }));
  expect(validarEntregavel(r).sucesso).toBe(false);
});
test('alteração estrutural é detectada e não presume replanejamento autorizado', () => {
  const r = modelo('RECORRENTE'); r.periodicidade = 'MENSAL';
  const inicial = { ...inicialEntregavel('etapa-a'), ...r, id: 'ent-1', contratoId: 'c-1',
    quantidadePrevista: null, quantidadeRealizada: null, unidadeMedida: null, peso: null, periodicidade: 'MENSAL',
    codigo: null, descricao: null, responsavelId: null, inicioPrevisto: null, terminoPrevisto: null,
    criterioConclusao: null, observacoes: null, configuracaoPeriodicidade: { versao: 1 },
    statusExecucao: null, percentualExecucao: null, situacaoComprovacao: null, evidenciasEsperadas: [],
  } as Entregavel;
  expect(mudouEstrutura(r, inicial)).toBe(false);
  r.periodicidade = 'ANUAL'; expect(mudouEstrutura(r, inicial)).toBe(true);
});
