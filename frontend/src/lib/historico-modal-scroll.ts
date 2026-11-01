/**
 * Adaptador DOM: isola o ajuste de scrollRestoration da função de renderização React.
 * A entrada do modal é same-document; o painel salva/restaura a posição do usuário.
 * Não cria histórico nem navega — só troca o modo de restauração enquanto aberto.
 */
export function ajustarRestauracaoHistorico(modo: ScrollRestoration): void {
  if (typeof window !== 'undefined') {
    window.history.scrollRestoration = modo;
  }
}
