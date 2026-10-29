import { duracaoMesesSchema, validarContrato } from './validacao-contrato';
import type { DadosContrato } from './contratos';

const base: DadosContrato = {
  numeroContrato: '  QA-001  ', processoAdministrativo: null, orgaoContratante: ' UTFPR ',
  unidadeResponsavel: null, objeto: 'Serviços', descricao: null,
  dataAssinatura: null, inicioVigencia: '2026-10-17', terminoVigencia: '2027-10-16',
  status: 'PLANEJAMENTO', responsavelInternoId: null, fiscalGestor: null,
  modoCalculo: 'SIMPLES', observacoes: null,
};

test('Zod normaliza obrigatórios e aceita opcionais nulos', () => {
  const result = validarContrato(base);
  expect(result.sucesso).toBe(true);
  if (result.sucesso) {
    expect(result.dados.numeroContrato).toBe('QA-001');
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
    expect(result.erros.descricao).toMatch(/3000/);
    expect(result.erros.observacoes).toMatch(/2000/);
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
