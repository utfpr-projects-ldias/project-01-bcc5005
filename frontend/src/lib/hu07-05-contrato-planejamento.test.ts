import { inicialEntregavel, validarEntregavel, type RascunhoEntregavel } from './validacao-entregavel';
import type { TipoEntregavel } from './entregaveis';

function paraTipo(tipo: TipoEntregavel): RascunhoEntregavel {
  const r = inicialEntregavel('c66aabb1-cccc-4ccc-8ccc-cccccccccccc');
  r.tipo = tipo;
  r.nome = 'Obrigação contratual verificável';
  r.peso = '15.2500';
  r.inicioPrevisto = '2026-10-30';
  r.terminoPrevisto = '2026-11-30';
  r.evidenciasEsperadas = [
    { chave: '1', tipoEvidencia: 'ATA', descricao: 'Assinada', obrigatoria: true },
    { chave: '2', tipoEvidencia: 'FOTO', descricao: 'Registro visual', obrigatoria: false },
  ];
  if (tipo === 'QUANTITATIVO') { r.quantidadePrevista = '10.125'; r.unidadeMedida = 'unidades'; }
  if (tipo === 'RECORRENTE') r.periodicidade = 'MENSAL';
  if (tipo === 'CONTINUO' || tipo === 'MARCO') r.criterioConclusao = 'Critério de aceitação documental';
  return r;
}

describe('HU07-05 — regressão contratual frontend → API', () => {
  test.each(['UNICO','QUANTITATIVO','RECORRENTE','CONTINUO','MARCO'] as TipoEntregavel[])(
    '%s produz o planejamento esperado com checklist e sem inventar execução', (tipo) => {
      const r = paraTipo(tipo);
      const resultado = validarEntregavel(r);
      expect(resultado.sucesso).toBe(true);
      if (!resultado.sucesso) return;
      expect(resultado.dados.tipo).toBe(tipo);
      expect(resultado.dados.peso).toBe('15.2500');
      expect(resultado.dados.evidenciasEsperadas).toEqual([
        { tipoEvidencia: 'ATA', descricao: 'Assinada', obrigatoria: true },
        { tipoEvidencia: 'FOTO', descricao: 'Registro visual', obrigatoria: false },
      ]);
      for (const campo of ['quantidadeRealizada','statusExecucao','percentualExecucao','situacaoComprovacao']) {
        expect(resultado.dados).not.toHaveProperty(campo);
      }
      expect(resultado.dados.configuracaoPeriodicidade).toEqual(tipo === 'RECORRENTE' ? { versao: 1 } : null);
    },
  );
  it('recusa valores inválidos sem enviar o planejamento', () => {
    const qtd = paraTipo('QUANTITATIVO'); qtd.quantidadePrevista = '0';
    expect(validarEntregavel(qtd).sucesso).toBe(false);
    qtd.quantidadePrevista = '-2'; expect(validarEntregavel(qtd).sucesso).toBe(false);
    const recorrente = paraTipo('RECORRENTE'); recorrente.periodicidade = 'PERSONALIZADA' as never;
    expect(validarEntregavel(recorrente).sucesso).toBe(false);
    const continuo = paraTipo('CONTINUO'); continuo.criterioConclusao = '';
    expect(validarEntregavel(continuo).sucesso).toBe(false);
    const r = paraTipo('UNICO'); r.terminoPrevisto = '2026-09-30';
    expect(validarEntregavel(r).sucesso).toBe(false);
  });
  it('nunca reaproveita configuração escondida de outro tipo', () => {
    const r = paraTipo('RECORRENTE'); r.tipo = 'QUANTITATIVO';
    r.quantidadePrevista = '3.125'; r.unidadeMedida = 'horas';
    const v = validarEntregavel(r);
    expect(v.sucesso).toBe(true);
    if (v.sucesso) {
      expect(v.dados.periodicidade).toBeNull();
      expect(v.dados.configuracaoPeriodicidade).toBeNull();
      expect(v.dados.quantidadePrevista).toBe('3.125');
    }
  });
});
