/** NUMERIC(...,3) como inteiros escalados; não converter a Number antes de somar/comparar. */
export function milesimos(valor: string | number | null | undefined): bigint {
  const texto = String(valor ?? '0');
  const partes = /^(\d+)(?:\.(\d{1,3}))?$/.exec(texto);
  if (!partes) throw new RangeError('Quantidade decimal inválida para precisão de três casas.');
  return BigInt(partes[1]) * 1000n + BigInt((partes[2] ?? '').padEnd(3, '0'));
}

export function quantidadeDecimal(valor: bigint): string {
  if (valor < 0n) throw new RangeError('Quantidade negativa.');
  return `${valor / 1000n}.${String(valor % 1000n).padStart(3, '0')}`;
}

/** Percentual arredondado a três casas somente na projeção, não no gate da meta. */
export function percentualQuantidade(executada: bigint, meta: bigint, arredondar = true): number | null {
  if (meta <= 0n) return null;
  if (executada >= meta) return 100;
  if (!arredondar) return Math.min(99.99999999999999, Number(executada) / Number(meta) * 100);
  return Math.min(99.999, Number((executada * 100000n + meta / 2n) / meta) / 1000);
}
