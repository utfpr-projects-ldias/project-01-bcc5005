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
const formatadorFuso = new Intl.DateTimeFormat('en-US', { timeZone: FUSO_CONTRATUAL, timeZoneName: 'shortOffset' });
export function inicioDiaCivilUtc(dia: string): Date {
  const base = new Date(`${dia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(base.getTime()) ||
      base.toISOString().slice(0, 10) !== dia) throw new RangeError('Dia civil inválido');
  // Ancoragem ao meio-dia para resolver o offset vigente no dia local.
  const ancora = new Date(base.getTime() + 12*3600_000);
  const parte = formatadorFuso.formatToParts(ancora).find(p => p.type === 'timeZoneName')?.value ?? 'GMT';
  const m = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(parte);
  if (!m) throw new RangeError(`Offset contratual não reconhecido: ${parte}`);
  const minutos = m[1] ? (m[1] === '+' ? 1 : -1) * (Number(m[2])*60+Number(m[3]??0)) : 0;
  return new Date(base.getTime() - minutos*60_000);
}
export function proximoDiaCivil(dia: string): string {
  const d = new Date(`${dia}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || Number.isNaN(d.getTime()) ||
      d.toISOString().slice(0,10) !== dia) throw new RangeError('Dia civil inválido');
  d.setUTCDate(d.getUTCDate()+1);
  return d.toISOString().slice(0,10);
}
