/** Bloqueio global compartilhado entre modais: evita restaurar `overflow: hidden`
 * quando uma camada filha fecha depois da camada pai. */
let ativos = 0;
let estadoOriginal: { overflow: string; paddingRight: string } | null = null;

export function bloquearRolagemDocumento(): () => void {
  if (typeof document === 'undefined') return () => {};
  if (ativos === 0) {
    estadoOriginal = { overflow: document.body.style.overflow, paddingRight: document.body.style.paddingRight };
    const disponivel = document.documentElement.clientWidth;
    const largura = disponivel > 0 ? Math.max(0, window.innerWidth - disponivel) : 0;
    // scrollbar-gutter: stable já reserva o espaço no documento; compensar
    // novamente com padding criaria a mudança lateral vista ao abrir modais.
    const gutterEstavel = window.getComputedStyle(document.documentElement).scrollbarGutter.includes('stable');
    if (largura > 0 && !gutterEstavel) {
      const atual = Number.parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.paddingRight = `${atual + largura}px`;
    }
    document.body.style.overflow = 'hidden';
  }
  ativos += 1;
  let liberado = false;
  return () => {
    if (liberado) return;
    liberado = true;
    ativos = Math.max(0, ativos - 1);
    if (ativos === 0 && estadoOriginal) {
      document.body.style.overflow = estadoOriginal.overflow;
      document.body.style.paddingRight = estadoOriginal.paddingRight;
      estadoOriginal = null;
    }
  };
}
