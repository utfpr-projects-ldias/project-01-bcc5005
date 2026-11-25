import type { Ocorrencia } from '@/hooks/use-ocorrencias';
import type { Entregavel } from '@/lib/entregaveis';
export type CampoOrdemAgenda = 'inicio' | 'termino' | 'realizado' | 'avanco' | 'comprovantes';
export function dataOrdemAgenda(o: Ocorrencia, e: Entregavel | undefined, campo: CampoOrdemAgenda): string {
  if(campo==='realizado') return o.dataRealizada?.slice(0,10)??'';
  if(campo==='avanco'||campo==='comprovantes') return '';
  const data = campo === 'inicio' ? o.periodoInicio || o.dataPrevista || e?.inicioPrevisto : o.periodoFim || o.dataPrevista || e?.terminoPrevisto;
  if (data) return data.slice(0, 10);
  if (!e?.criadoEm) return '';
  const criacao = new Date(e.criadoEm);
  return Number.isFinite(criacao.getTime()) ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year:'numeric',month:'2-digit',day:'2-digit' }).format(criacao) : '';
}
export function compararAgenda(a: Ocorrencia,b: Ocorrencia,entregaveis: ReadonlyMap<string,Entregavel>,campo: CampoOrdemAgenda,desc: boolean): number {
  function valor(o:Ocorrencia):string|number|null {
    if(campo==='avanco') return o.progressoPercentual==null?null:Number(o.progressoPercentual);
    if(campo==='comprovantes'){return o.evidenciasFoto==null||o.evidenciasRelatorio==null||o.evidenciasOutras==null?null:o.evidenciasFoto+o.evidenciasRelatorio+o.evidenciasOutras;}
    return dataOrdemAgenda(o,entregaveis.get(o.entregavelId),campo)||null;
  }
  const x=valor(a),y=valor(b);
  if(x===null||y===null) return x===y?a.id.localeCompare(b.id):x===null?1:-1;
  const cmp=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y));
  return (desc?-cmp:cmp)||a.id.localeCompare(b.id);
}
export function contadoresOcorrencia(o: Ocorrencia) {
  const atividades=o.minimoAtividadesVerificadas ?? (o.exigeAtividade ? 1 : 0);
  const verificadas=o.atividadesVerificadas;
  const foto=o.evidenciasFoto, rel=o.evidenciasRelatorio, outras=o.evidenciasOutras;
  const individual=o.minimoFotos!=null || o.minimoRelatorios!=null || o.minimoEvidenciasLivres!=null;
  const exigida=o.evidenciaExigida ?? 'NENHUMA';
  const mf=o.minimoFotos??0, mr=o.minimoRelatorios??0, ml=o.minimoEvidenciasLivres??0;
  const total=individual ? mf+mr+ml : o.minimoEvidenciasVerificadas ?? (exigida==='AMBOS'?2:exigida==='NENHUMA'?0:1);
  let feitas: number | undefined;
  if (!individual && exigida==='FOTO' && foto!==undefined) feitas=Math.min(total,foto);
  else if (!individual && exigida==='RELATORIO' && rel!==undefined) feitas=Math.min(total,rel);
  else if (foto!==undefined && rel!==undefined && outras!==undefined) {
    if (individual) {
      const f=Math.min(foto,mf), r=Math.min(rel,mr);
      feitas=f+r+Math.min(ml,Math.max(0,foto+rel+outras-f-r));
    } else if (exigida==='FOTO') feitas=Math.min(total,foto);
    else if (exigida==='RELATORIO') feitas=Math.min(total,rel);
    else if (exigida==='AMBOS' && total>0) feitas=Math.min(total, foto+rel, foto===0 || rel===0 ? Math.max(0,total-1):total);
    else feitas=Math.min(total,foto+rel);
  }
  return { atividades: {total:atividades, feitas:verificadas===undefined?undefined:Math.min(atividades,verificadas)}, evidencias:{total,feitas} };
}

/** Cobertura documental, independente da execução e das atividades operacionais. */
export function comprovacaoOcorrencia(o: Ocorrencia) {
  const {total,feitas}=contadoresOcorrencia(o).evidencias;
  return {texto:total>0&&feitas!==undefined?`${feitas}/${total}`:'—',cor:total===0||feitas===undefined?'text-foreground/45':o.documentacaoAtendida!==false&&feitas===total?'text-green-400':feitas===0?'text-red-400':'text-amber-400'};
}
