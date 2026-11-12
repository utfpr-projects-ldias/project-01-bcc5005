/** Código humano; o UUID continua sendo a chave técnica. */
export function rotuloCodigoPublico(codigo: number | string | null | undefined): string {
  if (codigo === null || codigo === undefined || codigo === '') return '#-----';
  const numero = Number(codigo);
  if (!Number.isSafeInteger(numero) || numero < 0) return '#-----';
  return '#' + String(numero).padStart(5, '0');
}
