/**
 * Contrato compartilhado HU07 -> HU09 para periodicidades FIXAS.
 * A V1 não admite intervalo arbitrário nem calendários personalizados (PQ-10).
 * Retornar esta configuração em DTOs em HU07-02; não gerar ocorrências aqui.
 */
export interface ConfiguracaoPeriodicidadeV1 {
  versao: 1;
}

export function configuracaoPeriodicidadeV1Valida(
  valor: unknown,
): valor is ConfiguracaoPeriodicidadeV1 {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const campos = Object.keys(valor);
  return campos.length === 1 && campos[0] === 'versao' &&
    (valor as Record<string, unknown>).versao === 1;
}
