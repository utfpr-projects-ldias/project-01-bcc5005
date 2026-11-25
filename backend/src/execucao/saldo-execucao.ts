export function saldoParcelas(base:number, itens:{reconhecido:number;reservado:number}[]) {
  const reconhecido=base+itens.reduce((s,i)=>s+i.reconhecido,0);
  const reservado=itens.reduce((s,i)=>s+i.reservado,0);
  return {reconhecido,reservado,saldo:Math.max(0,10000-reconhecido-reservado)};
}
