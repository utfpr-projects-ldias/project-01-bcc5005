/** Uma navegação de consulta não deve descartar formulários em andamento. */
export const EVENTO_NAVEGACAO_INTERNA = 'pi:navegacao-interna';
export function solicitarNavegacaoInterna(continuar?: () => void, dentroDaEtapa = false): boolean {
  if (typeof window === 'undefined') return true;
  // Um diálogo operacional possui a sua própria operação de fechar/cancelar.
  const dialogos = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
  // O modal ancorado é o espaço de trabalho da etapa, não uma confirmação.
  // Permitir somente a navegação solicitada dentro dele; demais diálogos bloqueiam.
  if (dialogos.some(dialogo => !dentroDaEtapa || !dialogo.hasAttribute('data-pi-modal-ancorado'))) return false;
  if (Array.from(document.querySelectorAll<HTMLElement>('[data-tec08-modal]')).some(camada =>
    !dentroDaEtapa || !camada.hasAttribute('data-pi-sobreposicao-etapa'))) return false;
  return window.dispatchEvent(new CustomEvent(EVENTO_NAVEGACAO_INTERNA, { cancelable: true, detail: { continuar } }));
}
