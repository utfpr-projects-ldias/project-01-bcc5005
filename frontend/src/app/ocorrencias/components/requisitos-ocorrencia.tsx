'use client';
import { AnelProgresso } from './anel-progresso';

export type FormatoComprovacao = 'NENHUMA' | 'FOTO' | 'RELATORIO' | 'AMBOS';
export type RequisitosOcorrencia = {
  minimoAtividadesVerificadas: number;
  minimoEvidenciasVerificadas: number;
  minimoFotos: number;
  minimoRelatorios: number;
  minimoEvidenciasLivres: number;
  evidenciaExigida: FormatoComprovacao;
  permiteEncerramentoExcepcional: boolean;
};

function Contador({ rotulo, descricao, quantidade, onChange, minimo = 0, desabilitado = false, compacto = false }: {
  rotulo: string; descricao: string; quantidade: number; onChange: (valor: number) => void;
  minimo?: number; desabilitado?: boolean; compacto?: boolean;
}) {
  const ajustar = (n: number) => onChange(Math.max(minimo, Math.min(99, n)));
  return <div className={compacto?"min-w-0":"min-w-0 rounded-xl border border-current/15 bg-current/[0.025] p-3"}>
    <label className="block text-xs font-semibold" htmlFor={`req-${rotulo.replace(/\W/g,'-').toLowerCase()}`}>{rotulo}</label>
    {!compacto && <p className="mt-1 min-h-8 text-xs text-foreground/65">{descricao}</p>}
    <div className="pi-contador-requisito"><button type="button" aria-label={`Diminuir ${rotulo}`} disabled={desabilitado||quantidade<=minimo} onClick={()=>ajustar(quantidade-1)}>−</button><input id={`req-${rotulo.replace(/\W/g,'-').toLowerCase()}`} type="text" inputMode="numeric" maxLength={2} placeholder="0"
      disabled={desabilitado} aria-label={rotulo} value={quantidade}
      onChange={e => {const v=e.target.value; if(/^\d{0,2}$/.test(v)) ajustar(v === '' ? 0 : Number(v));}}
      title={descricao} className="h-9 min-w-0 text-center text-sm tabular-nums" /><button type="button" aria-label={`Aumentar ${rotulo}`} disabled={desabilitado||quantidade>=99} onClick={()=>ajustar(quantidade+1)}>+</button></div>
  </div>;
}

export function FormularioRequisitosOcorrencia({ valor, onChange, compacto = false }: {
  valor: RequisitosOcorrencia; onChange: (novo: RequisitosOcorrencia) => void; compacto?: boolean;
}) {
  const atualizar = (campo: 'minimoFotos'|'minimoRelatorios'|'minimoEvidenciasLivres', qtd: number) => {
    const novo = {...valor,[campo]:qtd};
    const total = novo.minimoFotos + novo.minimoRelatorios + novo.minimoEvidenciasLivres;
    if (total > 99) return;
    onChange({...novo, minimoEvidenciasVerificadas:total,
      evidenciaExigida:novo.minimoFotos && novo.minimoRelatorios ? 'AMBOS' : novo.minimoFotos ? 'FOTO' : novo.minimoRelatorios ? 'RELATORIO' : 'NENHUMA'});
  };
  return <fieldset className={compacto?"min-w-0 space-y-2 border-t border-current/15 pt-2":"min-w-0 space-y-3 rounded-xl border border-current/20 bg-current/[0.025] p-3 sm:p-4"}>
    <legend className="px-1 text-sm font-semibold">Requisitos para solicitar conclusão</legend>

    <p className="text-xs text-foreground/65">Total de evidências exigidas: {valor.minimoFotos+valor.minimoRelatorios+valor.minimoEvidenciasLivres} / 99</p>
    <div className={`grid min-w-0 gap-3 sm:grid-cols-2 ${compacto?'md:grid-cols-4':''}`}>
      <Contador compacto={compacto} rotulo="Atividades" descricao="Quantidade mínima de atividades aprovadas." quantidade={valor.minimoAtividadesVerificadas} onChange={n => onChange({...valor,minimoAtividadesVerificadas:n})}/>
      <Contador compacto={compacto} rotulo="Fotografias" descricao="Quantidade específica de fotos." quantidade={valor.minimoFotos} onChange={n => atualizar('minimoFotos',n)}/>
      <Contador compacto={compacto} rotulo="Relatórios" descricao="Quantidade específica de relatórios." quantidade={valor.minimoRelatorios} onChange={n => atualizar('minimoRelatorios',n)}/>
      <Contador compacto={compacto} rotulo="Evidências (qualquer formato)" descricao="Quantidade adicional de comprovantes válidos, incluindo fotos, relatórios, atas e laudos." quantidade={valor.minimoEvidenciasLivres} onChange={n => atualizar('minimoEvidenciasLivres',n)}/>
    </div>
    <label className={compacto?"flex items-start gap-2 text-sm":"flex items-start gap-2 rounded-xl border border-current/15 bg-background/40 p-3 text-sm"}>
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-current" checked={valor.permiteEncerramentoExcepcional}
        onChange={e=>onChange({...valor,permiteEncerramentoExcepcional:e.target.checked})}/>
      <span>Permitir solicitar encerramento administrativo com justificativa</span>
    </label>
  </fieldset>;
}

export function ResumoRequisitosOcorrencia({ minimoAtividades, minimoEvidencias, formato, verificadas = 0, fotos = 0, relatorios = 0, outras = 0, minimoFotos, minimoRelatorios, minimoEvidenciasLivres, integrado = false }:{
  minimoAtividades: number; minimoEvidencias: number; formato: FormatoComprovacao;
  verificadas?: number; fotos?: number; relatorios?: number; outras?: number;
  minimoFotos?:number|null; minimoRelatorios?:number|null; minimoEvidenciasLivres?:number|null; integrado?:boolean;
}) {
  const individuais=[minimoFotos,minimoRelatorios,minimoEvidenciasLivres].some(n=>n!=null);
  const exigidas={fotos:minimoFotos??0,relatorios:minimoRelatorios??0,livres:minimoEvidenciasLivres??0};
  const livresAtendidos=Math.max(0,fotos-exigidas.fotos)+Math.max(0,relatorios-exigidas.relatorios)+outras;
  const totalEvidencias = individuais ? exigidas.fotos+exigidas.relatorios+exigidas.livres : minimoEvidencias;
  const evidenciasAtendidas = individuais
    ? Math.min(fotos,exigidas.fotos)+Math.min(relatorios,exigidas.relatorios)+Math.min(livresAtendidos,exigidas.livres)
    : formato==='FOTO'?fotos:formato==='RELATORIO'?relatorios:fotos+relatorios;
  const atividadesAtendidas=Math.min(verificadas,minimoAtividades);
  const comprovacaoAtendida=Math.min(evidenciasAtendidas,totalEvidencias);
  if (minimoAtividades === 0 && totalEvidencias === 0) return null;
  return <section aria-label="Requisitos para conclusão" className={integrado ? "min-w-0" : "min-w-0 rounded-xl border border-current/20 bg-current/[0.025] p-3"}>
    <h4 className="mb-3 text-sm font-semibold">Requisitos para conclusão</h4>
    <div className="grid gap-3 sm:grid-cols-2">
      {minimoAtividades > 0 && <div className="flex min-w-0 items-center gap-3">
        <AnelProgresso atual={atividadesAtendidas} total={minimoAtividades} rotulo="Atividades" tamanho={68}/>
        <span className="text-xs font-semibold">Atividades</span>
      </div>}
      {totalEvidencias > 0 && <div className="flex min-w-0 items-center gap-3">
        <AnelProgresso atual={comprovacaoAtendida} total={totalEvidencias} rotulo="Evidências" tamanho={68}/>
        <span className="text-xs font-semibold">Evidências</span>
      </div>}
    </div>

  </section>;
}
