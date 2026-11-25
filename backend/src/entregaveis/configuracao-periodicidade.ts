/**
 * Contrato compartilhado HU07 -> HU09 para periodicidades FIXAS.
 * A V1 não admite intervalo arbitrário nem calendários personalizados (PQ-10).
 * Retornar esta configuração em DTOs em HU07-02; não gerar ocorrências aqui.
 */
export interface ConfiguracaoPeriodicidadeV1 {
  versao: 1;
  modoRegistro?: 'DESCRITIVO' | 'QUANTITATIVO';
}

export function configuracaoPeriodicidadeV1Valida(
  valor: unknown,
): valor is ConfiguracaoPeriodicidadeV1 {
  if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) return false;
  const dados = valor as Record<string, unknown>;
  return dados.versao === 1 && Object.keys(dados).every(c => c === 'versao' || c === 'modoRegistro') &&
    (dados.modoRegistro === undefined || dados.modoRegistro === 'DESCRITIVO' || dados.modoRegistro === 'QUANTITATIVO');
}
