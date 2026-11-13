'use client';
import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { UsuarioPublico } from '@/lib/admin-usuarios';
import type { DadosContrato } from '@/lib/contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useMutacoesContrato, useResponsaveis } from '@/hooks/use-contratos';
import { ModalEtapa } from './modal-etapa';
import { FormularioContrato } from './formulario-contrato';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { toastSucesso } from '@/app/components/toast-notificacoes';

export function ModalNovoContrato({ onFechar, onCriado, focoRetorno }: {
  onFechar: () => void; onCriado: () => Promise<unknown> | void;
  focoRetorno?: HTMLElement | null;
}) {
  const {dados:perfil,carregando:perfilCarregando,erro:erroPerfil}=useMeuPerfil();
  const autorizado=Boolean(perfil?.ativo && perfil.perfil==='ADMINISTRADOR');
  const consulta=useResponsaveis(autorizado);
  const {criar}=useMutacoesContrato();
  const [pendente,setPendente]=useState<DadosContrato|null>(null);
  const [erro,setErro]=useState('');
  const [salvando,setSalvando]=useState(false);
  const responsaveis=useMemo(()=>{
    const lista=[...(consulta.dados?.usuarios??[])];
    // GET /admin/usuarios exclui administradores; o usuário conectado também
    // pode ser responsável, já que a API valida somente usuário ATIVO.
    if(autorizado && perfil && !lista.some(u=>u.id===perfil.id)) {
      lista.unshift({...perfil, criadoEm:''} as UsuarioPublico);
    }
    return lista;
  },[consulta.dados?.usuarios,perfil,autorizado]);
  async function confirmar(){
    if(!pendente||salvando)return;
    setSalvando(true);setErro('');
    try{await criar(pendente);setPendente(null);await onCriado();toastSucesso('Contrato cadastrado.');onFechar();}
    catch(e){setErro(e instanceof Error?e.message:'Não foi possível cadastrar o contrato.');}
    finally{setSalvando(false);}
  }
  return createPortal(<ModalEtapa titulo="Cadastrar contrato" contexto="Contrato" formularioLongo larguraAmpla
      estadoContextual="normal" ocupado={salvando} focoRetorno={focoRetorno} onFechar={onFechar} rotuloFechar="Voltar à lista de contratos">
    {erroPerfil||(!perfilCarregando&&!autorizado)?<p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-red-300">Acesso restrito ao Administrador.</p>
    :perfilCarregando||consulta.carregando?<p role="status" className="text-sm">Carregando informações para cadastro...</p>
    :consulta.erro?<p role="alert" className="text-sm text-red-300">Não foi possível carregar os responsáveis.</p>
    :<>
      {consulta.dados?.incompleta&&<p className="rounded-lg border border-amber-500/35 p-3 text-xs">A lista de funcionários foi limitada. Você pode selecionar sua própria conta ou outro usuário ativo encontrado.</p>}
      {erro&&<p role="alert" className="mb-3 rounded-lg border border-red-500/40 p-3 text-sm text-red-300">{erro}</p>}
      <FormularioContrato responsaveis={responsaveis} salvando={salvando} onCancelar={onFechar} onSalvar={async dados=>{setErro('');setPendente(dados);}}/>
      {pendente&&<ConfirmacaoSimples titulo="Confirmar cadastro do contrato?" descricao={`Cadastrar o contrato ${pendente.numeroContrato}? O cadastro será salvo e você permanecerá na lista de contratos.`}
        confirmar="Cadastrar contrato" ocupado={salvando} onCancelar={()=>setPendente(null)} onConfirmar={()=>void confirmar()}/>}
    </>}
  </ModalEtapa>,document.body);
}
