import type { ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { apresentarFracao } from '@/lib/apresentacao-indicadores';

/** Resumos de registros, não representam o percentual físico nem a aprovação do pai. */
export function ResumoVinculosEntregavel({resumo,participacao}:{resumo?:ResumoDocumentalEntregavel;participacao?:number|null}) {
  const grupos = [
    {nome:'Ocorrências', feitas:resumo?.ocorrenciasFinalizadas, total:resumo?.ocorrenciasTotal, cor:'bg-violet-500'},
    {nome:'Atividades', feitas:resumo?.atividadesVerificadas, total:resumo?.atividadesTotal, cor:'bg-violet-500'},
    {nome:'Evidências', feitas:resumo?.verificadasTotal, total:resumo?.total, cor:'bg-teal-500'},
  ];
  return <div className="mt-2 flex max-w-full flex-wrap items-start gap-x-2 gap-y-2" data-testid="resumo-vinculos-entregavel">
    {grupos.map(({nome,feitas,total,cor}) => {
      const fracao = apresentarFracao(feitas,total);
      return <div key={nome} data-pi-contagem={fracao.estado} className="w-[min(7rem,100%)] min-w-0 space-y-1">
        <div className={`flex flex-wrap items-center justify-between gap-x-1 text-[11px] ${fracao.estado === 'aplicavel' ? 'text-foreground' : 'text-foreground/60'}`}><strong>{nome}</strong><span className="tabular-nums">{fracao.texto}</span></div>
        <div role="img" aria-label={`${nome}: ${fracao.texto}`} className="h-1.5 overflow-hidden rounded-full bg-slate-500/20" data-pi-barra-contagem>{fracao.estado === 'aplicavel' && fracao.percentual > 0 && <span className={`block h-full rounded-full ${cor}`} style={{width:`${fracao.percentual}%`}} />}</div>
      </div>;
    })}
    {participacao!=null && Number.isFinite(participacao) && <strong className="ml-auto self-center whitespace-nowrap text-xs tabular-nums">{participacao.toLocaleString('pt-BR',{maximumFractionDigits:4})}% do contrato</strong>}
  </div>;
}
