/** A finalização tem critérios mais estritos e preserva o fluxo autorizado existente. */
export function modalidadeEncerramento(podeSolicitar: boolean, podeFinalizar: boolean): 'encerrar' | 'finalizar' | null {
  return podeFinalizar ? 'finalizar' : podeSolicitar ? 'encerrar' : null;
}
