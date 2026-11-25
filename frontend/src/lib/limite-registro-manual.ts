/** Aceita rascunho vazio ou decimal não negativo dentro do saldo reservado. */
export function valorDentroDoSaldo(valor:string,limite:number,casas:2|3):boolean {
 if(valor==='')return true;
 if(!Number.isFinite(limite)||limite<0||!new RegExp(`^\\d{1,12}(?:[.,]\\d{0,${casas}})?$`).test(valor))return false;
 const n=Number(valor.replace(',','.'));
 return Number.isFinite(n)&&n>=0&&n<=limite+1e-8;
}
