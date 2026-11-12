/** Active stages always occupy positions 1..N. Archived stages follow them.
 * An archived stage leaves the active order; a restored stage appends to it.
 * Public codes are independent and never renumbered here. */
export function ordemAposArquivamento<T extends { id: string; arquivadoEm: Date | null }>(
  registrosOrdenados: T[], movida: T, arquivar: boolean,
): T[] {
  const outras = registrosOrdenados.filter(registro => registro.id !== movida.id);
  const ativas = outras.filter(registro => !registro.arquivadoEm);
  const arquivadas = outras.filter(registro => Boolean(registro.arquivadoEm));
  if (arquivar) arquivadas.push(movida);
  else ativas.push(movida);
  return [...ativas, ...arquivadas];
}
