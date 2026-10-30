import { DADOS_ETAPA_INICIAIS, validarEtapa } from './validacao-etapa';

describe('HU06-03 — validação civil das Etapas', () => {
  test('nome é obrigatório e não aceita espaços', () => {
    const resultado = validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome: '   ' });
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) expect(resultado.erros.nome).toBeDefined();
  });
  test('normaliza textos opcionais vazios como null, sem enviar sequência ou contrato', () => {
    const resultado = validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome: '  Preparação  ', codigo: '  ', descricao: '   ' });
    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) expect(resultado.dados).toMatchObject({ nome: 'Preparação', codigo: null, descricao: null });
  });
  test('rejeita calendário inválido, data invertida e aceita ano bissexto', () => {
    const nome = 'Implantação';
    const impossivel = validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome, inicioPrevisto: '2026-02-29' });
    expect(impossivel.sucesso).toBe(false);
    if (!impossivel.sucesso) expect(impossivel.erros.inicioPrevisto).toBeDefined();
    const invertida = validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome, inicioPrevisto: '2026-12-20', terminoPrevisto: '2026-12-19' });
    expect(invertida.sucesso).toBe(false);
    if (!invertida.sucesso) expect(invertida.erros.terminoPrevisto).toBeDefined();
    expect(validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome, inicioPrevisto: '2028-02-29' }).sucesso).toBe(true);
  });
  test('limites de nome/código e status desconhecido são rejeitados', () => {
    expect(validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome: 'X'.repeat(256) }).sucesso).toBe(false);
    expect(validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome: 'A', codigo: 'X'.repeat(51) }).sucesso).toBe(false);
    expect(validarEtapa({ ...DADOS_ETAPA_INICIAIS, nome: 'A', status: 'INVALIDA' as typeof DADOS_ETAPA_INICIAIS.status }).sucesso).toBe(false);
  });
});
