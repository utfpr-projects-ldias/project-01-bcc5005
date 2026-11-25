/** Uma navegação de consulta não deve descartar formulários em andamento. */
export const EVENTO_NAVEGACAO_INTERNA = 'pi:navegacao-interna';
export function solicitarNavegacaoInterna(continuar?: () => void): boolean {
  if (typeof window === 'undefined') return true;
  // Um diálogo operacional possui a sua própria operação de fechar/cancelar.
  if (document.querySelector('[data-tec08-modal], [role="dialog"][aria-modal="true"]')) return false;
  return window.dispatchEvent(new CustomEvent(EVENTO_NAVEGACAO_INTERNA, { cancelable: true, detail: { continuar } }));
}
