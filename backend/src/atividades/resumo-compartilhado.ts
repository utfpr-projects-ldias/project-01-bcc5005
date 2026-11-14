/** Contagem derivada exclusivamente do estado persistido das atividades locais. */
export function contarAprovacoes(statuses: readonly string[]) {
  return {
    total: statuses.length,
    aprovadas: statuses.filter(status => status === 'VERIFICADA').length,
    pendentes: statuses.filter(status => status === 'PENDENTE_CONCLUSAO').length,
  };
}
