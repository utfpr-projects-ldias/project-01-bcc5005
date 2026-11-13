import { duracaoMesesSchema, validarContrato } from './validacao-contrato';
import type { DadosContrato } from './contratos';

const base: DadosContrato = {
  numeroContrato: '  2026001  ', processoAdministrativo: null, orgaoContratante: ' UTFPR ',
  unidadeResponsavel: null, objeto: 'Serviços', descricao: null,
  dataAssinatura: null, inicioVigencia: '2026-10-17', terminoVigencia: '2027-10-16',
  status: 'PLANEJAMENTO', responsavelInternoId: null, fiscalGestor: null,
  modoCalculo: 'SIMPLES', observacoes: null,
};

test('Zod normaliza obrigatórios e aceita opcionais nulos', () => {
  const result = validarContrato(base);
  expect(result.sucesso).toBe(true);
  if (result.sucesso) {
    expect(result.dados.numeroContrato).toBe('2026001');
    expect(result.dados.orgaoContratante).toBe('UTFPR');
    expect(result.dados.observacoes).toBeNull();
  }
});

test('Zod rejeita texto obrigatório vazio, descrições longas e status inventado', () => {
  const result = validarContrato({ ...base, numeroContrato: ' ', descricao: 'a'.repeat(3001),
    observacoes: 'b'.repeat(2001), status: 'INVALIDO' as DadosContrato['status'] });
  expect(result.sucesso).toBe(false);
  if (!result.sucesso) {
    expect(result.erros.numeroContrato).toMatch(/obrigatório/);
    expect(result.erros.descricao).toMatch(/500/);
    expect(result.erros.observacoes).toMatch(/200/);
    expect(result.erros.status).toBeDefined();
  }
});

test('Zod valida calendário, vigência e assinatura sem inventar regra temporal', () => {
  const invalid = validarContrato({ ...base, dataAssinatura: '2026-02-30', terminoVigencia: '2026-10-16' });
  expect(invalid.sucesso).toBe(false);
  if (!invalid.sucesso) {
    expect(invalid.erros.dataAssinatura).toBeDefined();
    expect(invalid.erros.terminoVigencia).toBeDefined();
  }
  expect(validarContrato({ ...base, dataAssinatura: '2028-01-01' }).sucesso).toBe(true);
});

test('duração em meses é validada com Zod', () => {
  expect(duracaoMesesSchema.safeParse('12').success).toBe(true);
  expect(duracaoMesesSchema.safeParse('0').success).toBe(false);
  expect(duracaoMesesSchema.safeParse('1.5').success).toBe(false);
  expect(duracaoMesesSchema.safeParse('1201').success).toBe(false);
});


test('Patch37: texto legado maior preservado ao editar outro campo; novo texto rejeitado', () => {
  const antigo = { ...base, numeroContrato: 'X'.repeat(75), observacoes: 'O'.repeat(700) };
  const alterado = { ...antigo, objeto: 'Objeto ajustado' };
  const ok = validarContrato(alterado, antigo);
  expect(ok.sucesso).toBe(true);
  if (ok.sucesso) {
    expect(ok.dados.numeroContrato).toBe(antigo.numeroContrato);
    expect(ok.dados.observacoes).toBe(antigo.observacoes);
  }
  expect(validarContrato({ ...alterado, numeroContrato: 'Y'.repeat(75) }, antigo).sucesso).toBe(false);
});

test('contrato novo aceita somente número; antigo alfanumérico continua editável sem mudança de identificação', () => {
  expect(validarContrato({ ...base, numeroContrato: '2026/001' }).sucesso).toBe(false);
  const antigo = { ...base, numeroContrato: '2026/001' };
  const editado = validarContrato({ ...antigo, objeto: 'Serviço alterado' }, antigo);
  expect(editado.sucesso).toBe(true);
  if (editado.sucesso) expect(editado.dados.numeroContrato).toBe('2026/001');
});
