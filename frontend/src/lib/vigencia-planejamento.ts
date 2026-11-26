export type VigenciaPlanejamento = { inicioVigencia: string; terminoVigencia: string; inicioEtapa?: string | null; terminoEtapa?: string | null };
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

export function intervaloEtapa(vigencia?: VigenciaPlanejamento) {
  const br=(d:string)=>d.split('-').reverse().join('/');
  const a=vigencia?.inicioEtapa,b=vigencia?.terminoEtapa;
  return a&&b?`${br(a)} a ${br(b)}`:a?`A partir de ${br(a)}`:b?`Até ${br(b)}`:'Não informada';
}
export function limitesDatasEntregavel(dados:Datas,vigencia?:VigenciaPlanejamento) {
  const inicio=vigencia?.inicioVigencia,fim=vigencia?.terminoVigencia;
  return {minInicio:inicio,maxInicio:dados.terminoPrevisto&&(!fim||dados.terminoPrevisto<fim)?dados.terminoPrevisto:fim,minTermino:dados.inicioPrevisto&&(!inicio||dados.inicioPrevisto>inicio)?dados.inicioPrevisto:inicio,maxTermino:fim};
}
