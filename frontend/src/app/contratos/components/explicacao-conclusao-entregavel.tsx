"use client";
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { useElegibilidadeEntregavel } from '@/hooks/use-elegibilidade-entregavel';
import type { ElegibilidadeConclusaoEntregavel } from '@/lib/entregaveis';
export function DialogoImpedimentos({dados, percentual, carregando, onFechar}: {dados?: ElegibilidadeConclusaoEntregavel; percentual?: number|null; carregando?:boolean; onFechar:()=>void}) {
  const mensagem = carregando ? 'Consultando os requisitos de conclusão.' : !dados ? 'Não foi possível consultar os requisitos. Tente novamente.' : `Execução física: ${percentual == null ? 'indisponível' : `${percentual}%`}. Comprovação: ${dados.semExigencias ? 'Sem exigências' : dados.documentacaoCompleta ? 'Completa' : dados.situacaoComprovacao === 'SEM_EVIDENCIA' ? 'Nenhuma' : dados.situacaoComprovacao === 'EVIDENCIA_PARCIAL' ? 'Parcial' : 'Incompleta'}.`;
  const pendencias = dados ? [...dados.impedimentos,...dados.pendencias] : [];
  const titulo = dados?.podeSolicitarConclusao ? 'Conclusão disponível' : dados?.podeSolicitarParcial ? 'Conclusão parcial disponível' : dados && !dados.aptidaoFisica ? 'Ainda não é possível solicitar a conclusão' : 'Situação da conclusão';
  return <ConfirmacaoSimples titulo={titulo} descricao={mensagem} confirmar="Fechar" somenteConsulta compactoConclusao pendencias={pendencias} estadoContextual="nao-iniciado" preservarCorOrigem onCancelar={onFechar} onConfirmar={onFechar}/>;
}
export function ExplicacaoConclusaoEntregavel({contratoId,entregavelId,percentual,onFechar}:{contratoId:string;entregavelId:string;percentual?:number|null;onFechar:()=>void}) {
  const consulta=useElegibilidadeEntregavel(contratoId,entregavelId);
  return <DialogoImpedimentos dados={consulta.erro || consulta.atualizando ? undefined : consulta.dados} percentual={percentual} carregando={consulta.carregando || consulta.atualizando} onFechar={onFechar}/>;
}
