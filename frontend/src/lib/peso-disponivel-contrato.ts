/** Saldo para cadastro/edição ponderada: inclui todas as etapas ativas, exclui o próprio item editado. */
export function pesoDisponivelContrato(itens: Array<{ id: string; peso: string | null; arquivadoEm?: string | null; etapaArquivada?: boolean }> | undefined, itemId?: string): number | null {
  if (!itens) return null; // Não apresentar um limite fictício antes da consulta.
  const soma = itens.reduce((total, item) => {
    if (item.arquivadoEm || item.etapaArquivada || item.id === itemId) return total;
    const valor = Number(item.peso ?? 0);
    return total + (Number.isFinite(valor) ? Math.round(valor * 10000) : 0);
  }, 0);
  return Math.max(0, (1000000 - soma) / 10000);
}

/** Saldo projetado, inclusive excedente histórico no modo simples. O rascunho substitui o peso persistido do item. */
export function saldoPesosRascunho(itens: Parameters<typeof pesoDisponivelContrato>[0], itemId: string | undefined, peso: string): number | null {
  if (!itens) return null;
  const outros = itens.filter(i => !i.arquivadoEm && !i.etapaArquivada && i.id !== itemId).reduce((s, i) => s + Math.round(Number(i.peso ?? 0) * 10000), 0);
  const valor = Number(peso.trim().replace(',', '.'));
  if (!Number.isFinite(valor) || !Number.isFinite(outros)) return null;
  return (1000000 - outros - Math.round(valor * 10000)) / 10000;
}
