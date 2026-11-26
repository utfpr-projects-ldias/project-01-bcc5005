'use client';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useConsulta, useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { consultarEvidencia, validarDetalheEvidencia } from '@/lib/comprovantes';
import type { PermissoesContrato } from '@/lib/contratos';
import type { OperacaoPermissao } from '@/lib/admin-usuarios';
import { ModalEtapa, type NavegacaoCadastroRegistro } from './modal-etapa';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { ExecucoesEntregavel, useResumoRegistrosExecucao, type OrigemExecucao } from './execucoes-entregavel';

export type AlvoRegistroContrato = {tipo:'EVIDENCIA';entregavelId:string;id:string}|{tipo:'MANUAL';entregavelId:string;chave:string}|{tipo:'CADASTRO';entregavelId:string;origem:OrigemExecucao};
const bloqueados = new Set(['CONCLUIDO','CONCLUIDO_PARCIALMENTE','CONCLUIDA','CONCLUIDA_PARCIALMENTE','FINALIZADO','FINALIZADA','ENCERRADO','ENCERRADA','SUSPENSO','CANCELADO','CANCELADA','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO']);
const semAcao=()=>{};
/** Reutiliza os formulários e as decisões existentes sem navegar pelo contrato.
 * Os portais dos registros são independentes da região de contexto, que fica oculta. */
export function RegistroContratoAvulso({contratoId,alvo,gatilho,bloqueado,paiArquivado,contratoParcial,permissoes,administrador,onFechar,aoCriarEvidencia,cadastroSomenteDocumental,acaoDesvincularMeta,navegacaoExterna}:{contratoId:string;alvo:AlvoRegistroContrato;gatilho:HTMLElement|null;bloqueado:boolean;paiArquivado:boolean;contratoParcial:boolean;permissoes?:PermissoesContrato;administrador:boolean;onFechar:()=>void;aoCriarEvidencia?:(id:string)=>void;cadastroSomenteDocumental?:boolean;acaoDesvincularMeta?:()=>void;navegacaoExterna?:NavegacaoCadastroRegistro}){
 const consulta=useDetalheEntregavel(contratoId,alvo.entregavelId);
 const etapas=useEtapas(contratoId);
 const evId=alvo.tipo==='EVIDENCIA'?alvo.id:'';
 const evidencia=useConsulta(['entregaveis','contrato',contratoId,'registro-avulso',alvo.entregavelId,evId],async signal=>{const d=await consultarEvidencia(contratoId,alvo.entregavelId,evId,signal);validarDetalheEvidencia(d);if(d.id!==evId||d.contratoId!==contratoId||d.entregavelId!==alvo.entregavelId)throw new Error('Evidência indisponível.');return d;},{habilitada:alvo.tipo==='EVIDENCIA'});
 const registrosManuais=useResumoRegistrosExecucao(contratoId,alvo.entregavelId,alvo.tipo==='MANUAL');
 const cache=useRepositorioConsultasOpcional();
 const item=consulta.dados,etapa=etapas.dados?.find(e=>e.id===item?.etapaId);
 const atualizar=()=>{for(const chave of [['execucao',contratoId],['atividades',contratoId],['entregaveis','contrato',contratoId],['ocorrencias',contratoId],['etapas','contrato',contratoId],['contratos','detalhe',contratoId],['contratos','pendentes'],['contratos','lista']])cache?.invalidar(chave);window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada',{detail:{contratoId}}));};
 const erro=consulta.erro||etapas.erro||(alvo.tipo==='EVIDENCIA'&&evidencia.erro)||(alvo.tipo==='MANUAL'&&registrosManuais.erro);
 const aguardando=consulta.carregando||etapas.carregando||(alvo.tipo==='EVIDENCIA'&&evidencia.carregando)||(alvo.tipo==='MANUAL'&&registrosManuais.carregando);
 const pronto=Boolean(item&&etapa&&(alvo.tipo!=='EVIDENCIA'||evidencia.dados)&&(alvo.tipo!=='MANUAL'||registrosManuais.dados));
 const fechar=()=>{onFechar();requestAnimationFrame(()=>{if(gatilho?.isConnected)gatilho.focus({preventScroll:true});});};
 if(!pronto&&!erro&&aguardando)return alvo.tipo==='CADASTRO'?createPortal(<ModalEtapa titulo="Novo registro" contexto="" ocupado={false} onFechar={fechar} focoRetorno={gatilho} camada="edicao" navegacaoCadastro={navegacaoExterna??{ativa:alvo.origem,opcoes:{MANUAL:false,ATIVIDADE:false,EVIDENCIA:false,OCORRENCIA:false},selecionar:semAcao}}><p role="status" className="text-sm text-foreground/70">Consultando entregável e permissões…</p></ModalEtapa>,document.body):<span role="status" className="sr-only">Consultando registro.</span>;
 if(erro||!pronto||!item||!etapa)return createPortal(<ModalEtapa titulo="Registro indisponível" ocupado={false} onFechar={fechar} focoRetorno={gatilho} camada="aninhada" larguraFormulario="registro-manual"><p role="alert">{erro?'Não foi possível consultar o registro.':'Registro indisponível.'}</p></ModalEtapa>,document.body);
 const arquivado=paiArquivado||Boolean(etapa.arquivadoEm||item.arquivadoEm);
 const etapaPendente=Boolean(etapa.conclusaoSolicitadaEm||etapa.encerramentoSolicitadoEm);
 const paiFechado=bloqueado||arquivado||etapaPendente||(bloqueados.has(etapa.status)&&!etapa.reabertoEm);
 const regularizacao=item.statusExecucao==='CONCLUIDO_PARCIALMENTE'&&!arquivado&&!etapaPendente&&(!paiFechado||((!bloqueado||contratoParcial)&&etapa.status==='CONCLUIDO_PARCIALMENTE'));
 const bloqueioDocumental=paiFechado&&!regularizacao;
 const fechado=bloqueados.has(item.statusExecucao??'')&&!item.reabertoEm||Boolean(item.regularizacaoDocumentalSolicitada);
 const somenteLeitura=paiFechado||fechado;
 const pode=(k:OperacaoPermissao)=>Boolean(administrador||permissoes?.[k]);
 if(alvo.tipo==='MANUAL')return createPortal(<ModalEtapa titulo="Registro de execução manual" contexto={item.nome} ocupado={false} onFechar={fechar} focoRetorno={gatilho} camada="aninhada" larguraFormulario="registro-manual"><ExecucoesEntregavel item={item} aba="execucoes" registroManualChave={alvo.chave} somenteLeitura={somenteLeitura} podeEvidencia={false} podeEnviar={false} onCadastro={semAcao} onAbrir={semAcao} onAtualizar={atualizar} onGeral={semAcao} onOcorrencias={semAcao}/></ModalEtapa>,document.body);
 if(alvo.tipo==='CADASTRO'&&somenteLeitura&&!(regularizacao&&cadastroSomenteDocumental&&alvo.origem==='EVIDENCIA'&&!item.regularizacaoDocumentalSolicitada))return createPortal(<ModalEtapa titulo="Novo registro" ocupado={false} onFechar={fechar} focoRetorno={gatilho}><p role="alert">O contexto não permite cadastrar novos registros.</p></ModalEtapa>,document.body);
 return <div hidden><ConteudoEntregavel navegacaoExterna={navegacaoExterna} acaoDesvincularMeta={acaoDesvincularMeta} cadastroSomenteDocumental={cadastroSomenteDocumental} aoCriarEvidencia={aoCriarEvidencia} item={item} contextoModal interno evidenciaAvulsa={alvo.tipo==='EVIDENCIA'?evidencia.dados??undefined:undefined} origemRegistro={alvo.tipo==='CADASTRO'?alvo.origem:undefined} focoAvulso={gatilho} aoFecharAvulso={fechar} permissoesExecucao={permissoes} somenteLeituraExecucao={somenteLeitura} bloqueadoPorPai={paiFechado} paiArquivado={arquivado} paiConcluido={item.statusExecucao==='CONCLUIDO'&&!item.reabertoEm} regularizacaoDocumental={regularizacao} podeEditarEsperada={!cadastroSomenteDocumental&&(!somenteLeitura||regularizacao)&&pode('editarEvidencias')} podeCriarEvidencia={(!somenteLeitura||regularizacao)&&pode('criarEvidencias')} podeArquivarEvidencia={!cadastroSomenteDocumental&&!somenteLeitura&&pode('arquivarEvidencias')} podeReativarEvidencia={!somenteLeitura&&pode('reativarEvidencias')} podeReabrirEvidencia={!cadastroSomenteDocumental&&!bloqueioDocumental&&!item.regularizacaoDocumentalSolicitada&&pode('reabrirEvidencias')} podeExcluirEvidenciaArquivada={!somenteLeitura&&pode('excluirEvidenciasArquivadas')} podeAlterarObrigatoriedade={!cadastroSomenteDocumental&&(!somenteLeitura||regularizacao)&&pode('alterarObrigatoriedade')} podeEnviarComprovantes={!bloqueioDocumental&&pode('enviarComprovantes')} aoAtualizarEsperada={cacheAtualizado=>{if(!cacheAtualizado)atualizar();}}/></div>;
}
