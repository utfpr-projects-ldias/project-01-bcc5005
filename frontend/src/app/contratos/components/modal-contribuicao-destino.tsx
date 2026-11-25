'use client';
import {createPortal} from 'react-dom';
import type {ReactNode} from 'react';
import {ModalEtapa} from './modal-etapa';
export function ModalContribuicaoDestino({nome,fechar,children}:{nome:string;fechar:()=>void;children:ReactNode}){
 return createPortal(<ModalEtapa ocupado={false} titulo="Contribuição" contexto={nome} camada="edicao" larguraFormulario="contribuicao" estadoContextual="normal" onFechar={fechar}><div className="space-y-4 text-sm" onClick={e=>e.stopPropagation()}>{children}<div className="flex justify-end border-t border-current/15 pt-3"><button type="button" data-pi-acao="primaria" className="pi-vinculo-acao" onClick={fechar}>Concluir</button></div></div></ModalEtapa>,document.body);
}
