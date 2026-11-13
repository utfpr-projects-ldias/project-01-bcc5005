import type { SVGProps } from 'react';

/** Ícone circular de conclusão (traço Ionicons, incorporado como SVG local).
 * Não adiciona dependências a package.json/lockfile nem depende de CDN. */
export function IconeConclusao({ className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" viewBox="0 0 512 512" fill="currentColor" className={className} {...props}>
    <path d="M170.718 216.482L141.6 245.6l93.6 93.6 208-208-29.118-29.118L235.2 279.918l-64.482-63.436zM422.4 256c0 91.518-74.883 166.4-166.4 166.4S89.6 347.518 89.6 256 164.482 89.6 256 89.6c15.6 0 31.2 2.082 45.764 6.241L334 63.6C310.082 53.2 284.082 48 256 48 141.6 48 48 141.6 48 256s93.6 208 208 208 208-93.6 208-208h-41.6z"/>
  </svg>;
}

/** Marca compacta de reabertura: seta giratória com ponto central, em estilo sólido.
 * SVG local; mantém o ícone verde inclusive em botões neutros. */
export function IconeReabertura({ className = 'h-4 w-4', ...props }: SVGProps<SVGSVGElement>) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
    <path d="M12 2.5a9.5 9.5 0 1 0 9.42 10.72h-2.54a7 7 0 1 1-2.38-6.4l-2.92 2.92H22V2l-3.72 3.73A9.45 9.45 0 0 0 12 2.5Zm0 6.2a3.3 3.3 0 1 0 0 6.6 3.3 3.3 0 0 0 0-6.6Z" />
  </svg>;
}
