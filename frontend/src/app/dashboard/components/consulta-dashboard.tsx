'use client';
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PreviaContrato } from '@/app/atividades/components/cartao-atividade';
import { ConsultaOperacionalAvulsa } from '@/app/contratos/components/consulta-operacional-avulsa';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { PainelOcorrencias } from '@/app/ocorrencias/components/painel-ocorrencias';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { useContrato, useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import type { DestinoDashboard } from './painel-contrato-dashboard';
type Props={contratoId:string;destino:DestinoDashboard;foco:HTMLElement;fechar:()=>void};
function ConsultaAviso({fechar,erro,foco}:{fechar:()=>void;erro:boolean;foco:HTMLElement}){
 return createPortal(<ModalEtapa titulo={erro?'Registro indisponível':'Consultar registro'} contexto="Dashboard" ocupado={false} focoRetorno={foco} onFechar={fechar} larguraFormulario="registro">{erro?<p role="alert">Não foi possível consultar o registro autorizado.</p>:<p role="status">Consultando registro…</p>}</ModalEtapa>,document.body);
}
function ConsultaEntregavel({contratoId,destino,foco,fechar}:Props){
 const q=useDetalheEntregavel(contratoId,destino.id);
 const item=q.dados;
 if(q.erro||item&&(item.contratoId!==contratoId||item.id!==destino.id))return <ConsultaAviso erro foco={foco} fechar={fechar}/>;
 if(!item)return <ConsultaAviso erro={false} foco={foco} fechar={fechar}/>;
 return <ConsultaOperacionalAvulsa contratoId={contratoId} destino={{etapaId:item.etapaId,entregavelId:item.id}} foco={foco} fechar={fechar}/>;
}
function ConsultaOcorrencia({contratoId,destino,foco,fechar}:Props){
 const contrato=useContrato(contratoId),acesso=useAcessoContrato(contratoId),perfil=useMeuPerfil();
 useEffect(()=>()=>{if(foco.isConnected)foco.focus({preventScroll:true});},[foco]);
 const c=contrato.dados;
 const erro=Boolean(contrato.erro||acesso.erro||perfil.erro||(perfil.dados&&!perfil.dados.ativo));
 if(erro||!c||!acesso.dados||!perfil.dados?.ativo)return <ConsultaAviso erro={erro} foco={foco} fechar={fechar}/>;
 const bloqueado=Boolean(c.arquivadoEm||c.conclusaoSolicitadaEm||['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','ENCERRADO','CANCELADO','SUSPENSO'].includes(c.status));
 return createPortal(<PainelOcorrencias contratoId={contratoId} somenteLeitura={bloqueado} somenteDetalhe embutido abrirOcorrenciaId={destino.id} aoFecharOcorrenciaSelecionada={fechar}/>,document.body);
}
export function ConsultaDashboard(props:Props){
 const {contratoId,destino,foco,fechar}=props;
 if(destino.tipo==='CONTRATO')return <PreviaContrato contratoId={contratoId} foco={foco} fechar={fechar}/>;
 if(destino.tipo==='ETAPA')return <ConsultaOperacionalAvulsa contratoId={contratoId} destino={{etapaId:destino.id}} foco={foco} fechar={fechar}/>;
 if(destino.tipo==='OCORRENCIA')return <ConsultaOcorrencia {...props}/>;
 return <ConsultaEntregavel {...props}/>;
}
