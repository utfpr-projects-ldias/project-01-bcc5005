'use client';
import { useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useContrato, useAcessoContrato } from '@/hooks/use-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { PainelEtapas } from './painel-etapas';
import { ModalEtapa } from './modal-etapa';

/** Consulta pela carteira sem montar o contrato inteiro ou o iframe. */
export function ConsultaOperacionalAvulsa({contratoId,destino,foco,fechar}:{contratoId:string;destino:{etapaId:string;entregavelId?:string};foco:HTMLElement|null;fechar:()=>void}) {
 const contrato=useContrato(contratoId), acesso=useAcessoContrato(contratoId), perfil=useMeuPerfil();
 const alvo=useMemo(()=>({etapaId:destino.etapaId,id:destino.entregavelId??''}),[destino.etapaId,destino.entregavelId]);
 useEffect(()=>()=>{if(foco?.isConnected)foco.focus({preventScroll:true});},[foco]);
 const c=contrato.dados;
 const falha=Boolean(contrato.erro||acesso.erro||perfil.erro||(perfil.dados&&!perfil.dados.ativo));
 if(falha) return createPortal(<ModalEtapa titulo="Registro indisponível" contexto="Gestão de contratos" ocupado={false} onFechar={fechar} larguraFormulario="registro"><p role="alert">Não foi possível consultar o registro autorizado.</p></ModalEtapa>,document.body);
 if(!c||!acesso.dados||!perfil.dados?.ativo) return createPortal(<ModalEtapa titulo="Consultar registro" contexto="Gestão de contratos" ocupado={false} onFechar={fechar} focoRetorno={foco} larguraFormulario="registro"><p role="status">Consultando registro…</p></ModalEtapa>,document.body);
 const p=acesso.dados.permissoes;
 return createPortal(<div className="pi-consulta-avulsa"><PainelEtapas consultaAvulsa interno destinoInterno={alvo} onFecharConsultaDireta={fechar} contratoId={c.id} numeroContrato={c.numeroContrato} modoCalculo={c.modoCalculo} habilitado podeGerenciar={acesso.dados.podeEditar} permissoes={p} contratoArquivado={Boolean(c.arquivadoEm)} contratoConcluido={['CONCLUIDO','FINALIZADO'].includes(c.status)} contratoParcial={c.status==='CONCLUIDO_PARCIALMENTE'} contratoEncerrado={c.status==='ENCERRADO'} contratoSuspenso={c.status==='SUSPENSO'} contratoCancelado={c.status==='CANCELADO'} contratoEmRevisao={Boolean(c.reabertoEm)} contratoPendenteConclusao={Boolean(c.conclusaoSolicitadaEm)} ordemEtapasBloqueada={Boolean(c.ordemEtapasBloqueada)}/></div>,document.body);
}
