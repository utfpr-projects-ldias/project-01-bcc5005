export type VigenciaPlanejamento = { inicioVigencia: string; terminoVigencia: string };
type Datas = { inicioPrevisto?: string | null; terminoPrevisto?: string | null };
export function intervaloVigencia(vigencia: VigenciaPlanejamento) {
  const br = (d: string) => d.split('-').reverse().join('/');
  return `${br(vigencia.inicioVigencia)} a ${br(vigencia.terminoVigencia)}`;
}
export function validarDatasNaVigencia(dados: Datas, vigencia?: VigenciaPlanejamento, anterior?: Datas): Partial<Record<keyof Datas, string>> {
  const erros: Partial<Record<keyof Datas, string>> = {};
  if (!vigencia) return erros;
  for (const campo of ['inicioPrevisto', 'terminoPrevisto'] as const) {
    const data = dados[campo];
    if (data && data !== anterior?.[campo] && (data < vigencia.inicioVigencia || data > vigencia.terminoVigencia)) {
      erros[campo] = `Informe uma data entre ${intervaloVigencia(vigencia)} (vigência do contrato).`;
    }
  }
  return erros;
}
