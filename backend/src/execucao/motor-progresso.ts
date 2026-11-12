/** TEC09-01: cálculo físico, sem dependências de banco ou comprovação. */
export type EntradaFisica = {
  tipo: 'UNICO' | 'CONTINUO' | 'QUANTITATIVO' | 'RECORRENTE' | 'MARCO';
  percentualManual?: number | null; quantidadePrevista?: number | null;
  quantidadeRealizada?: number | null; ocorrenciasPrevistas?: number | null;
  ocorrenciasConcluidas?: number | null; dataEfetivaMarco?: string | null;
};
const valido = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const proporcao = (real: number | null | undefined, prevista: number | null | undefined) =>
  valido(real) && valido(prevista) && prevista > 0 ? Math.min(100, real / prevista * 100) : null;
export const arredondar = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
export function calcularFisico(e: EntradaFisica): number | null {
  switch (e.tipo) {
    case 'QUANTITATIVO': return proporcao(e.quantidadeRealizada, e.quantidadePrevista);
    case 'RECORRENTE': return proporcao(e.ocorrenciasConcluidas, e.ocorrenciasPrevistas);
    case 'MARCO': return e.dataEfetivaMarco ? 100 : 0;
    case 'UNICO': return e.percentualManual == null ? 0 : valido(e.percentualManual) && e.percentualManual <= 100 ? e.percentualManual : null;
    case 'CONTINUO': return valido(e.percentualManual) && e.percentualManual <= 100 ? e.percentualManual : null;
  }
}
/** Pesos NUMERIC(7,4): soma em unidades inteiras, não tolerância de ponto flutuante. */
export function agregarFisico(itens: { percentual: number | null; peso: string | null }[]) {
  const pesos = itens.map(i => i.peso != null && /^\d{1,3}(?:\.\d{1,4})?$/.test(i.peso) ? Math.round(Number(i.peso) * 10000) : null);
  const soma = pesos.reduce<number>((s, p) => s + (p ?? 0), 0);
  const pesosValidos = itens.length > 0 && pesos.every(p => p !== null && p >= 0 && p <= 1000000) && soma === 1000000;
  const calculavel = itens.length > 0 && itens.every(i => valido(i.percentual) && i.percentual <= 100);
  return { pesosValidos, somaPesos: itens.length ? soma / 10000 : null,
    avancoSimples: calculavel ? arredondar(itens.reduce((s, i) => s + i.percentual!, 0) / itens.length) : null,
    avancoPonderado: calculavel && pesosValidos ? arredondar(itens.reduce((s, i, n) => s + i.percentual! * pesos[n]! / 1000000, 0)) : null };
}
