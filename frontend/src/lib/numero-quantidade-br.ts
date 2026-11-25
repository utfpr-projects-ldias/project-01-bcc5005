/** Formato de digitação pt-BR para quantidades com até três casas decimais.
 * `20.000` significa vinte mil no campo brasileiro.
 * Valores canônicos da API (ex.: `20.000`) nunca devem ser reprocessados aqui. */
export function quantidadeBRParaApi(valor: string): string | null {
  const s = valor.trim();
  if (!s || !/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,3})?$/.test(s)) return null;
  const numero = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(numero) || numero < 0 || numero > 999999999999999) return null;
  return String(numero);
}
export function quantidadeApiParaBR(valor: string | number | null | undefined): string {
  if (valor == null || valor === '') return '';
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '';
  return new Intl.NumberFormat('pt-BR', {maximumFractionDigits: 3}).format(numero);
}
