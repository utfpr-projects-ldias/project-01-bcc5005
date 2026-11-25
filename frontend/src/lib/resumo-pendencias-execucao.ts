/** Quantidades pendentes não integram o avanço oficial. Referências a uma execução
 * já reconhecida não reservam uma segunda contribuição. */
export function quantidadePendente(itens: readonly {id:string; origem:string; ocorrenciaId:string; quantidade:string|null; situacao:string; referenciaExecucao:string|null}[], ocorrencias: ReadonlySet<string>): number {
  const vistos = new Set<string>();
  return itens.reduce((soma,item) => {
    if (item.situacao !== 'PENDENTE' || item.referenciaExecucao || !ocorrencias.has(item.ocorrenciaId)) return soma;
    const chave = `${item.origem}:${item.id}:${item.ocorrenciaId}`;
    const quantidade = Number(item.quantidade);
    if (vistos.has(chave) || !Number.isFinite(quantidade) || quantidade <= 0) return soma;
    vistos.add(chave);
    return soma + quantidade;
  },0);
}
