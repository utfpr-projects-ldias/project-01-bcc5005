import type { EstadoContextual } from './estado-visivel-contrato';

/** Estado da TRANSIÇÃO solicitada, não do objeto antes da operação. */
export function contextoDaDecisao(titulo: string, estado: EstadoContextual = 'normal'): EstadoContextual {
  const acao = titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/reabr|reativ|retom|revert|cancelar solicitacao|devolver.*revisao|nao aprovar/.test(acao)) return 'revisao';
  if (/cancelar contrato|cancelamento do contrato/.test(acao)) return 'cancelado';
  if (/suspend/.test(acao)) return 'suspenso';
  if (/arquiv/.test(acao)) return 'arquivado';
  if (/encerrar antecipad|encerrar contrato/.test(acao)) return 'encerrado';
  if (/finaliz|solicitar encerramento|aprovar encerramento/.test(acao)) return 'finalizado';
  if (/conclu|aprovar|verific/.test(acao)) return 'concluido';
  if (/exclu/.test(acao)) return 'cancelado';
  return estado;
}

export function coresDecisao(estado: EstadoContextual) {
  switch (estado) {
    case 'revisao': return { borda:'border-teal-500/65', texto:'text-teal-300', foco:'focus-visible:outline-teal-400', campo:'focus-visible:border-teal-400', botao:'border-teal-500 bg-teal-700 text-white hover:bg-teal-600' };
    case 'cancelado': return { borda:'border-red-500/65', texto:'text-red-300', foco:'focus-visible:outline-red-400', campo:'focus-visible:border-red-400', botao:'border-red-500 bg-red-700 text-white hover:bg-red-600' };
    case 'suspenso': return { borda:'border-amber-500/65', texto:'text-amber-300', foco:'focus-visible:outline-amber-400', campo:'focus-visible:border-amber-400', botao:'border-amber-500 bg-amber-700 text-white hover:bg-amber-600' };
    case 'arquivado': return { borda:'border-orange-500/65', texto:'text-orange-700 dark:text-orange-300', foco:'focus-visible:outline-orange-400', campo:'focus-visible:border-orange-400', botao:'border-orange-600 bg-orange-600 text-white hover:bg-orange-500' };
    case 'encerrado': return { borda:'border-slate-400/70', texto:'text-slate-300', foco:'focus-visible:outline-slate-400', campo:'focus-visible:border-slate-400', botao:'border-slate-400 bg-slate-700 text-white hover:bg-slate-600' };
    case 'finalizado': return { borda:'border-purple-500/65', texto:'text-purple-300', foco:'focus-visible:outline-purple-400', campo:'focus-visible:border-purple-400', botao:'border-purple-500 bg-purple-700 text-white hover:bg-purple-600' };
    case 'concluido': return { borda:'border-violet-500/65', texto:'text-violet-300', foco:'focus-visible:outline-violet-400', campo:'focus-visible:border-violet-400', botao:'border-violet-500 bg-violet-700 text-white hover:bg-violet-600' };
    case 'pendente': return { borda:'border-yellow-500/65', texto:'text-yellow-300', foco:'focus-visible:outline-yellow-400', campo:'focus-visible:border-yellow-400', botao:'border-yellow-500 bg-yellow-700 text-white hover:bg-yellow-600' };
    default: return { borda:'border-slate-500/55', texto:'text-foreground', foco:'focus-visible:outline-slate-400', campo:'focus-visible:border-slate-400', botao:'border-slate-500 bg-slate-700 text-white hover:bg-slate-600' };
  }
}
