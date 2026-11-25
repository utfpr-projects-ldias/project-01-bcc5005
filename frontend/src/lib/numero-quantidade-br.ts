/** Digitação pt-BR para numeric(18,3). A API recebe strings decimais exatas. */
export function quantidadeBRParaApi(valor: string): string | null {
  const s = valor.trim();
  if (!s || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,3})?$/.test(s)) return null;
  const [inteiro, fracao = ''] = s.replace(/\./g, '').split(',');
  const n = inteiro.replace(/^0+(?=\d)/, '');
  if (n.length > 15) return null;
  const d = fracao.replace(/0+$/, '');
  return d ? `${n}.${d}` : n;
}
export function quantidadeApiParaBR(valor: string | number | null | undefined): string {
  if (valor == null || valor === '') return '';
  if (typeof valor === 'number') return Number.isFinite(valor) ? new Intl.NumberFormat('pt-BR', {maximumFractionDigits:3}).format(valor) : '';
  if (!/^-?\d+(?:\.\d{1,3})?$/.test(valor)) return '';
  const [inteiro, fracao = ''] = valor.split('.');
  const n = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const d = fracao.replace(/0+$/, '');
  return d ? `${n},${d}` : n;
}

/** Quantidades da API são decimais; não passar por ponto flutuante. */
export function milesimosApi(valor: string | number | null | undefined): bigint {
  const texto = typeof valor === 'number' ? (Number.isFinite(valor) && valor >= 0 ? valor.toFixed(3) : '') : (valor ?? '0');
  const partes = /^(\d+)(?:\.(\d{1,3}))?$/.exec(texto);
  return partes ? BigInt(partes[1]) * BigInt(1000) + BigInt((partes[2] ?? '').padEnd(3, '0')) : BigInt(0);
}
export function maxQuantidade(a: bigint, b: bigint): bigint { return a > b ? a : b; }
export function formatarMilesimos(n: bigint): string {
  const valor = maxQuantidade(BigInt(0), n);
  return quantidadeApiParaBR(`${valor / BigInt(1000)}.${String(valor % BigInt(1000)).padStart(3, '0')}`);
}
export function percentualQuantidadeExata(realizado: bigint, meta: bigint): number | null {
  if (meta <= BigInt(0)) return null;
  if (realizado >= meta) return 100;
  return Math.min(99.999, Number((realizado * BigInt(100000) + meta / BigInt(2)) / meta) / 1000);
}
