'use client';

export type FormatoComprovacao = 'NENHUMA' | 'FOTO' | 'RELATORIO' | 'AMBOS';
export type RequisitosOcorrencia = {
  minimoAtividadesVerificadas: number;
  minimoEvidenciasVerificadas: number;
  evidenciaExigida: FormatoComprovacao;
  permiteEncerramentoExcepcional: boolean;
};
const base = 'w-full min-w-0 rounded-xl border border-current/25 bg-background/75 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/20';

function Contador({ rotulo, descricao, quantidade, onChange, minimo = 0, desabilitado = false }: {
  rotulo: string; descricao: string; quantidade: number; onChange: (valor: number) => void;
  minimo?: number; desabilitado?: boolean;
}) {
  const ajustar = (n: number) => onChange(Math.max(minimo, Math.min(99, n)));
  return <div className="min-w-0 rounded-xl border border-current/15 bg-current/[0.025] p-3">
    <label className="block text-xs font-semibold" htmlFor={`req-${rotulo.replace(/\W/g,'-').toLowerCase()}`}>{rotulo}</label>
    <p className="mt-1 min-h-8 text-xs text-foreground/65">{descricao}</p>
    <div className="mt-2 flex min-w-0 items-stretch overflow-hidden rounded-xl border border-current/25 bg-background focus-within:border-brand-green focus-within:ring-2 focus-within:ring-brand-green/20">
      <input id={`req-${rotulo.replace(/\W/g,'-').toLowerCase()}`} type="number" min={minimo} max="99" step="1" inputMode="numeric" placeholder="0"
        disabled={desabilitado} aria-label={rotulo} value={quantidade === 0 ? '' : quantidade}
        onChange={e => ajustar(e.target.value === '' ? 0 : Number(e.target.value))}
        className="min-w-0 flex-1 [appearance:textfield] bg-transparent px-3 py-2.5 text-sm tabular-nums text-foreground outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none" />
      <div className="flex shrink-0 flex-col border-l border-current/20">
        <button type="button" aria-label={`Aumentar ${rotulo.toLowerCase()}`} disabled={desabilitado || quantidade >= 99} onClick={() => ajustar(quantidade+1)}
          className="flex h-5 w-8 items-center justify-center text-xs text-foreground/70 hover:bg-current/10 disabled:opacity-30">▲</button>
        <button type="button" aria-label={`Diminuir ${rotulo.toLowerCase()}`} disabled={desabilitado || quantidade <= minimo} onClick={() => ajustar(quantidade-1)}
          className="flex h-5 w-8 items-center justify-center border-t border-current/15 text-xs text-foreground/70 hover:bg-current/10 disabled:opacity-30">▼</button>
      </div>
    </div>
  </div>;
}

export function FormularioRequisitosOcorrencia({ valor, onChange, compacto = false }: {
  valor: RequisitosOcorrencia; onChange: (novo: RequisitosOcorrencia) => void; compacto?: boolean;
}) {
  const ambos = valor.evidenciaExigida === 'AMBOS';
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-current/20 bg-current/[0.025] p-3 sm:p-4">
    <legend className="px-1 text-sm font-semibold">Requisitos para solicitar conclusão</legend>
    {!compacto && <p className="text-xs text-foreground/65">Só contam atividades e evidências verificadas. A execução física e a comprovação continuam independentes.</p>}
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      <Contador rotulo="Atividades verificadas exigidas" descricao="Mínimo de atividades aprovadas nesta ocorrência."
        quantidade={valor.minimoAtividadesVerificadas} onChange={n => onChange({...valor,minimoAtividadesVerificadas:n})}/>
      <Contador rotulo="Evidências verificadas exigidas" descricao="Mínimo de arquivos comprovados, conforme o formato escolhido."
        quantidade={valor.minimoEvidenciasVerificadas} minimo={ambos ? 2 : 0} desabilitado={valor.evidenciaExigida==='NENHUMA'}
        onChange={n => onChange({...valor,minimoEvidenciasVerificadas:n, evidenciaExigida:n===0?'NENHUMA':valor.evidenciaExigida})}/>
    </div>
    <label className="block text-xs font-semibold">Formato de evidência
      <select className={`${base} pi-select mt-1 pr-10`} value={valor.evidenciaExigida}
        onChange={e=>{const formato=e.target.value as FormatoComprovacao;
          onChange({...valor,evidenciaExigida:formato,minimoEvidenciasVerificadas:formato==='NENHUMA'?0:Math.max(formato==='AMBOS'?2:1,valor.minimoEvidenciasVerificadas)});
        }}>
        <option value="NENHUMA">Nenhuma obrigatória</option>
        <option value="FOTO">Fotografias</option><option value="RELATORIO">Relatórios</option>
        <option value="AMBOS">Fotografias e relatórios</option>
      </select>
    </label>
    {ambos && <p className="text-xs text-foreground/65">Para ambos, ao menos uma fotografia e um relatório devem estar verificados. O mínimo total também precisa ser atendido.</p>}
    <label className="flex items-start gap-2 rounded-xl border border-current/15 bg-background/40 p-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-brand-green" checked={valor.permiteEncerramentoExcepcional}
        onChange={e=>onChange({...valor,permiteEncerramentoExcepcional:e.target.checked})}/>
      <span>Permitir solicitar encerramento excepcional com justificativa</span>
    </label>
  </fieldset>;
}

export function ResumoRequisitosOcorrencia({ minimoAtividades, minimoEvidencias, formato, verificadas = 0, fotos = 0, relatorios = 0 }:{
  minimoAtividades: number; minimoEvidencias: number; formato: FormatoComprovacao;
  verificadas?: number; fotos?: number; relatorios?: number;
}) {
  const evidenciasAtendidas = formato === 'FOTO' ? fotos : formato === 'RELATORIO' ? relatorios : fotos+relatorios;
  return <dl className="grid min-w-0 gap-2 rounded-xl border border-current/20 bg-current/[0.025] p-3 sm:grid-cols-2" aria-label="Requisitos da ocorrência">
    <div className="min-w-0"><dt className="text-xs text-foreground/65">Atividades verificadas</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{verificadas} / {minimoAtividades} exigidas</dd></div>
    <div className="min-w-0"><dt className="text-xs text-foreground/65">Evidências verificadas</dt>
      <dd className="mt-1 text-sm font-semibold tabular-nums">{evidenciasAtendidas} / {minimoEvidencias} exigidas</dd>
      <p className="mt-1 text-xs text-foreground/65">{formato==='NENHUMA'?'Sem obrigação documental':formato==='FOTO'?'Fotografias':formato==='RELATORIO'?'Relatórios':'Fotografias e relatórios'}</p></div>
  </dl>;
}
