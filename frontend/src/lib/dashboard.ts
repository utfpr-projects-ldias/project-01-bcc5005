import type { Contrato } from './contratos';
import type { ProgressoEntregavel } from '@/hooks/use-progresso';
export type FiltroDashboard = 'todos'|'ativos'|'planejamento'|'encerramento'|'atrasados'|'concluidos'|'pendentes'|'proximas';
export type FracaoDashboard = {feitas:number;total:number};
export type PrazoDashboard = {tipo:'ETAPA'|'ENTREGAVEL'|'OCORRENCIA';id:string;entregavelId:string|null;nome:string;data:string;atrasado:boolean;aberto:boolean};
export type AlertaDashboard = {tipo:string;severidade:'Atenção'|'Prioritário';objeto:'CONTRATO'|PrazoDashboard['tipo'];id:string;entregavelId:string|null;data:string|null;motivo:string};
export type ContratoDashboard = Pick<Contrato,'id'|'codigoPublico'|'numeroContrato'|'orgaoContratante'|'objeto'|'inicioVigencia'|'terminoVigencia'|'status'|'arquivadoEm'|'reabertoEm'|'conclusaoSolicitadaEm'|'conclusaoParcialSolicitada'|'encerramentoSolicitado'>;
export type ResumoDashboard = {responsavel:string|null;contrato:ContratoDashboard;ativo:boolean;diasRestantes:number;avanco:number|null;configuracaoPendente:boolean;etapas:{total:number;concluidas:number};entregaveis:{total:number;pendentes:number;concluidos:number;emAndamento:number;atrasados:number};atividades:{total:number;verificadas:number};evidencias:FracaoDashboard|null;comprovacao:FracaoDashboard|null;proxima:PrazoDashboard|null;proximas:number;atrasos:number;alertas:AlertaDashboard[]};
export type LinhaDashboard = ResumoDashboard & {totalAlertas:number};
export type MatrizDashboard = ProgressoEntregavel & {etapa:string|null;unidadeMedida:string|null;comprovacao:string|null;exigenciasDocumentais:FracaoDashboard|null};
export type DetalheDashboard = ResumoDashboard & {versao:1;prazos:PrazoDashboard[];matriz:MatrizDashboard[]};
export type IndicadoresDashboard = {ativos:number;planejamento:number;encerramento:number;atrasados:number;concluidos:number;pendentes:number;proximas:number;avanco:number|null;baseAvanco:number};
export type CarteiraDashboard = {versao:1;hoje:string;limiteDias:number;indicadores:IndicadoresDashboard;totalCarteira:number;total:number;pagina:number;paginas:number;linhas:LinhaDashboard[]};
const API=(process.env.NEXT_PUBLIC_API_URL??'http://localhost:3001').replace(/\/$/,'');
class ErroDashboard extends Error {constructor(public status:number){super(status===401?'Sessão expirada. Entre novamente.':status===403||status===404?'Consulta não autorizada ou indisponível.':'Não foi possível consultar o dashboard.');}}
async function consultar<T>(rota:string,signal?:AbortSignal):Promise<T>{
  const r=await fetch(`${API}/dashboard/v1${rota}`,{credentials:'include',cache:'no-store',signal});
  if(!r.ok)throw new ErroDashboard(r.status);
  const dados=await r.json();
  if(dados?.versao!==1)throw new Error('Resposta do dashboard incompatível.');
  return dados as T;
}
export function consultarCarteiraDashboard(busca:string,filtro:FiltroDashboard,pagina:number,dias:number,signal?:AbortSignal){
  return consultar<CarteiraDashboard>(`?${new URLSearchParams({busca,filtro,pagina:String(pagina),dias:String(dias)})}`,signal);
}
export const consultarDetalheDashboard=(id:string,dias:number,signal?:AbortSignal)=>consultar<DetalheDashboard>(`/contratos/${encodeURIComponent(id)}?dias=${dias}`,signal);
