/** Edição decimal pt-BR: armazena vírgula na UI e ponto no contrato JSON. */
export function decimalDigitado(texto: string, maximo = 100, casas = 2): string {
  const bruto = texto.replace(/\./g, ',').replace(/[^\d,]/g, '');
  const primeiro = bruto.indexOf(',');
  let inteiro = (primeiro < 0 ? bruto : bruto.slice(0, primeiro)).slice(0, 15).replace(/^0+(?=\d)/, '');
  const parte = primeiro < 0 ? '' : bruto.slice(primeiro + 1).replace(/,/g, '').slice(0, casas);
  // Não descartar a digitação da parte decimal quando o inteiro é zero.
  if (inteiro && Number(inteiro) > maximo) inteiro = String(maximo);
  if (inteiro && Number(inteiro) === maximo) return inteiro + (primeiro >= 0 ? ',' + '0'.repeat(parte.length) : '');
  return inteiro + (primeiro >= 0 ? ',' + parte : '');
}
export function decimalParaApi(valor: string): string {
  return valor.trim().replace(',', '.');
}
export function decimalExibicao(valor: string | number | null | undefined, casas = 2): string {
  if (valor === null || valor === undefined || valor === '') return '';
  const numero = Number(String(valor).replace(',', '.'));
  return Number.isFinite(numero) ? numero.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas, useGrouping: false }) : String(valor);
}
export function decimalValido(valor: string, maximo = 100, permitirZero = false): boolean {
  if (!/^(?:\d{1,3})(?:[,.]\d{1,2})?$/.test(valor.trim())) return false;
  const numero = Number(decimalParaApi(valor));
  return Number.isFinite(numero) && numero <= maximo && (permitirZero ? numero >= 0 : numero > 0);
}
