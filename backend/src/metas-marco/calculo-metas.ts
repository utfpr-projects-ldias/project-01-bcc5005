import { milesimos, percentualQuantidade } from '../common/quantidade-exata.js';
export function calcularAvancoMeta(tipo: string, quantidade: string | null, prevista: string | null, reconhecida: boolean): number {
  return tipo === 'QUANTITATIVA' ? (percentualQuantidade(milesimos(quantidade),milesimos(prevista)) ?? 0) : reconhecida ? 100 : 0;
}
export function resumirPreparacao(itens: { pesoCentesimos:number; percentualPreparacao:number; pronto:boolean }[]) {
  const pesoDistribuido = itens.reduce((n,x)=>n+x.pesoCentesimos,0);
  const concluidas = itens.filter(x=>x.pronto).length;
  const apto = itens.length>0 && pesoDistribuido===10000 && concluidas===itens.length;
  const bruto = itens.reduce((n,x)=>n+x.pesoCentesimos*x.percentualPreparacao,0)/10000;
  return { total:itens.length, concluidas, apto, pesoDistribuido, percentualPreparacao: bruto>=100 ? 100 : Math.min(99.99,Math.round(bruto*100)/100) };
}
