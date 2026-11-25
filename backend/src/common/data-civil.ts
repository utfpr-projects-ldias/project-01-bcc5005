/** Dia civil de referência das obrigações contratuais. Não usar UTC para decidir prazos locais. */
export const FUSO_CONTRATUAL = 'America/Sao_Paulo' as const;
const formatador = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO_CONTRATUAL, year: 'numeric', month: '2-digit', day: '2-digit',
});
export function hojeCivil(data: Date = new Date()): string {
  return formatador.format(data);
}

/** Converte a meia-noite do calendário contratual em instante UTC para filtros
 * timestamptz. Não confundir dia civil com meia-noite UTC. */
export function inicioDiaCivilUtc(dia: string): Date {
  const base = new Date(`${dia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(base.getTime()) ||
      base.toISOString().slice(0,10)!==dia) throw new RangeError('Dia civil inválido');
  // A meia-noite local pode não existir (início do horário de verão).
  // Buscar a primeira fronteira do dia civil, não o offset do meio-dia.
  let inferior = base.getTime()-24*3600_000;
  let superior = base.getTime()+24*3600_000;
  while (inferior < superior) {
    const meio = Math.floor((inferior+superior)/2);
    if (hojeCivil(new Date(meio)) < dia) inferior=meio+1;
    else superior=meio;
  }
  if (hojeCivil(new Date(inferior))!==dia) throw new RangeError('Dia civil inexistente no fuso contratual');
  return new Date(inferior);
}
export function proximoDiaCivil(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(d.getTime()) ||
      d.toISOString().slice(0,10) !== dia) throw new RangeError('Dia civil inválido');
  d.setUTCDate(d.getUTCDate()+1);
  const seguinte = d.toISOString().split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(seguinte)) throw new RangeError('Dia civil seguinte fora do intervalo suportado');
  return seguinte;
}

/** Data efetiva é um fato já ocorrido, não uma previsão. */
export function dataEfetivaValida(dia: string | null | undefined, referencia = hojeCivil()): dia is string {
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || dia > referencia) return false;
  const d = new Date(`${dia}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === dia;
}
