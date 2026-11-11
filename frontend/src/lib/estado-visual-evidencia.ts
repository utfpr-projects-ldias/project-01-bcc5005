import type { StatusComprovante } from './comprovantes';

/** O registro filho usa seu PRÓPRIO status; a tela em que é aberto não o altera. */
export type EstadoVisualEvidencia = 'normal' | 'pendente' | 'revisao' | 'concluido' | 'arquivado';
export function estadoVisualEvidencia(
  status?: StatusComprovante | null,
  reabertoEm?: string | null,
  arquivada = false,
): EstadoVisualEvidencia {
  if (arquivada) return 'arquivado';
  if (reabertoEm) return 'revisao';
  if (status === 'VERIFICADA') return 'concluido';
  if (status === 'PENDENTE_VERIFICACAO') return 'pendente';
  return 'normal';
}
