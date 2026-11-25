/** Seleção de duração operacional, mantendo valores históricos sem conversão destrutiva. */
const opcoes=Array.from({length:96},(_,i)=>{
 const minutos=(i+1)*15, h=Math.floor(minutos/60), m=minutos%60;
 return [h?`${h}h`:'',m?`${m}min`:''].filter(Boolean).join(' ');
});
export function CampoDuracao({valor,onValor,className}:{valor:string;onValor:(v:string)=>void;className:string}){
 return <select className={className} value={valor} onChange={e=>onValor(e.target.value)}><option value="">Não informada</option>{valor&&!opcoes.includes(valor)&&<option value={valor}>{valor} (registro anterior)</option>}{opcoes.map(v=><option value={v} key={v}>{v}</option>)}</select>;
}
