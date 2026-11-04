/** Posição temporária de retorno; somente navegação, sem dados de contrato ou sessão. */
const prefixo = 'retorno-entregavel-contrato:';
export function guardarRetornoContrato(contratoId: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(prefixo + contratoId, JSON.stringify({
      x: window.scrollX, y: window.scrollY, validade: Date.now() + 5 * 60_000,
    }));
  } catch { /* navegacao continua mesmo se storage estiver indisponivel */ }
}
/** Leitura não destrutiva: a posição só pode ser apagada após rolagem concluída. */
export function lerRetornoContrato(contratoId: string): { x: number; y: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(prefixo + contratoId);
    if (!raw) return null;
    const data = JSON.parse(raw) as { x?: number; y?: number; validade?: number };
    if (!Number.isFinite(data.validade) || data.validade! < Date.now() ||
        !Number.isFinite(data.x) || !Number.isFinite(data.y) ||
        data.x! < 0 || data.y! < 0 || data.y! > 1_000_000) {
      limparRetornoContrato(contratoId);
      return null;
    }
    return { x: data.x!, y: data.y! };
  } catch { return null; }
}
export function limparRetornoContrato(contratoId: string) {
  if (typeof window === 'undefined') return;
  try { window.sessionStorage.removeItem(prefixo + contratoId); } catch { /* retorno continua */ }
}
/** Compatibilidade: o consumidor legado mantém semântica de leitura única. */
export function consumirRetornoContrato(contratoId: string): { x: number; y: number } | null {
  const alvo = lerRetornoContrato(contratoId);
  if (alvo) limparRetornoContrato(contratoId);
  return alvo;
}
