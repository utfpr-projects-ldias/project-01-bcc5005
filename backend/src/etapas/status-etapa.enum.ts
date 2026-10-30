/**
 * Estados operacionais da Etapa (HU06-01; PRD §8.2).
 *
 * O PRD pede um enum, mas NÃO define seus valores. Este catálogo mínimo é
 * uma decisão técnica provisória, sujeita à validação do cliente; não equivale
 * aos seis estados do Contrato e não dispara transições automaticamente.
 * Uma eventual ampliação exige migration aditiva e aprovação de domínio.
 */
export enum StatusEtapa {
  PLANEJADA = 'PLANEJADA',
  EM_ANDAMENTO = 'EM_ANDAMENTO',
  CONCLUIDA = 'CONCLUIDA',
}
