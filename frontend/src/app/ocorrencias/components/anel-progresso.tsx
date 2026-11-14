/** Indicador circular compartilhado: nunca apresenta 0/0 como 100%. */
export function AnelProgresso({atual,total,rotulo,cor='violeta',tamanho=96}: {
  atual:number;total:number;rotulo:string;cor?:'violeta'|'verde-azulado';tamanho?:number;
}) {
  const porcentagem = total > 0 ? Math.min(100,Math.max(0,atual/total*100)) : null;
  const raio=38, circunferencia=2*Math.PI*raio;
  const corAnel = cor === 'violeta' ? '#A855F7' : '#14B8A6';
  return <div className="relative shrink-0" style={{width:tamanho,height:tamanho}}>
    <svg viewBox="0 0 100 100" width={tamanho} height={tamanho} role={porcentagem==null?'img':'progressbar'}
      aria-label={porcentagem==null?`${rotulo}: não exigido`:`${rotulo}: ${atual} de ${total} (${Math.round(porcentagem)}%)`}
      aria-valuemin={porcentagem==null?undefined:0} aria-valuemax={porcentagem==null?undefined:100}
      aria-valuenow={porcentagem==null?undefined:Math.round(porcentagem)}>
      <circle cx="50" cy="50" r={raio} stroke="currentColor" strokeOpacity="0.12" strokeWidth="9" fill="none" />
      {porcentagem!=null&&<circle cx="50" cy="50" r={raio} stroke={corAnel} strokeWidth="9" fill="none"
        strokeLinecap="round" strokeDasharray={`${circunferencia*porcentagem/100} ${circunferencia}`}
        transform="rotate(-90 50 50)"/>}
      {rotulo === 'Avanço físico' && <text x="50" y="40" textAnchor="middle" fill="currentColor" fontSize="10">Avanço</text>}
      <text x="50" y={rotulo === 'Avanço físico' ? '60' : '54'} textAnchor="middle" fill="currentColor" fontSize="16" fontWeight="600">{['Atividades','Evidências','Fotografias','Relatórios'].includes(rotulo) ? `${Math.min(atual,total)}/${total}` : porcentagem==null?'—':`${Math.round(porcentagem)}%`}</text>
    </svg>
  </div>;
}
