import type { ReactNode } from 'react';
import { BarraTabela, ComprovacaoTabela, StatusTabela } from '@/app/contratos/components/tabela-operacional';
import { STATUS } from '@/lib/contratos';
import { estadoContextualContrato, situacaoVisivelContrato } from '@/lib/estado-visivel-contrato';
import { rotuloPendenteContrato } from '@/lib/filtros-carteira';
import type { ContratoDashboard, FracaoDashboard } from '@/lib/dashboard';

const caminhos = {
  contratos: 'M4 5h16v15H4zM8 5V3m8 2V3M8 10h8M8 14h5',
  planejamento: 'M4 6h16v14H4zM8 3v6m8-6v6M4 11h16',
  prazo: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16m0 3v5l3 2',
  alerta: 'M12 3 2 21h20L12 3Zm0 6v5m0 3v1',
  concluido: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M8 12l3 3 5-6',
  pendente: 'M5 4h14v16H5zM8 8h8M8 12h8M8 16h4',
  proximas: 'M4 5h16v15H4zM8 3v4m8-4v4M4 10h16m-10 5h4m-2-2v4',
  progresso: 'M4 19h16M6 15l4-4 4 2 5-8m-5 0h5v5',
  atualizar: 'M20 7v5h-5M4 17v-5h5M5 9a8 8 0 0 1 13-4l2 3M19 15a8 8 0 0 1-13 4l-2-3',
  buscar: 'M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13Zm5 11 5 5',
  direita: 'm9 6 6 6-6 6', esquerda: 'm15 6-6 6 6 6',
  abrir: 'M13 5h6v6m0-6L9 15m9-2v6H5V6h6',
  fechar: 'm6 6 12 12M18 6 6 18',
  matriz: 'M3 4h18v16H3zM3 10h18M9 4v16',
} as const;
export type IconeDashboard = keyof typeof caminhos;
export function Icone({nome,classe}:{nome:IconeDashboard;classe?:string}) {
  return <svg aria-hidden="true" className={classe} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d={caminhos[nome]}/></svg>;
}
export function SituacaoContrato({contrato:c}:{contrato:ContratoDashboard}) {
  const estado=estadoContextualContrato(c);
  const situacao=situacaoVisivelContrato(c,false);
  return <StatusTabela estado={estado==='normal'?(c.status==='PLANEJAMENTO'?'nao-iniciado':'andamento'):estado} rotulo={situacao==='pendentes'?rotuloPendenteContrato(c):situacao==='revisao'?'Em revisão':STATUS[c.status]}/>;
}
export function FracaoDocumental({fracao}:{fracao:FracaoDashboard|null}){
  return fracao===null?<span className="db-muted">—</span>:fracao.total===0?<span className="db-muted">Sem exigências</span>:<ComprovacaoTabela fracao={fracao}/>;
}
export function Avanco({valor}:{valor:number|null}){return <BarraTabela valor={valor}/>;}
export function Metrica({titulo,children}:{titulo:string;children:ReactNode}){
  return <div className="db-mini-metrica"><span>{titulo}</span><strong>{children}</strong></div>;
}
export function EstadoConsulta({ocupado,erro,repetir}:{ocupado:boolean;erro:unknown;repetir:()=>void}){
  return <div className="db-estado-consulta">
    <span className="sr-only" role="status">{ocupado?'Atualizando…':null}</span>
    {erro!=null&&<div className="db-erro" role="alert"><span>{erro instanceof Error?erro.message:'Não foi possível consultar.'}</span><button type="button" className="db-botao" onClick={repetir}>Tentar novamente</button></div>}
  </div>;
}
