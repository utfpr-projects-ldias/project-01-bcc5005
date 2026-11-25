'use client';
import { MetricasCartaoOcorrencia, PesoOcorrencia } from '@/app/contratos/components/agenda-contrato';
import { CampoPercentual } from '@/app/components/campo-percentual';
import { CampoDataCivil } from '@/app/components/campo-data-civil';
import { EtiquetaAtraso } from '@/app/components/etiqueta-atraso';


import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { z } from 'zod';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias, type Ocorrencia, type StatusOcorrencia, type ImpactoAgenda } from '@/hooks/use-ocorrencias';
import { ModalEtapa, type NavegacaoCadastroRegistro } from '@/app/contratos/components/modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IconeOcorrencias } from '@/app/components/icones-operacionais';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { IconeStatus } from '@/app/components/icones-status';
import { ModalDetalheEntregavel } from '@/app/contratos/components/modal-detalhe-entregavel';
import { consultarAtividade, editarAtividadeApi, listarAtividadesVinculaveis, transicionarAtividadeApi, type Atividade } from '@/hooks/use-atividades';
import { estadoTemporal, diaLocalBrasil } from '@/lib/estado-temporal';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { CampoBuscaSugestoes } from '@/app/components/campo-busca-sugestoes';
import { useProgresso } from '@/hooks/use-progresso';
import { SeletorEntregavel } from './seletor-entregavel';
import { CalendarioOcorrencias } from './calendario-ocorrencias';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { IconeConclusao, IconeConclusaoParcial } from '@/app/components/icones-ciclo-vida';
import { IconeEngrenagem } from '@/app/components/icone-engrenagem';
import { ExecucaoOcorrencia, ResumoLateralOcorrencia, EvidenciasOcorrencia, HistoricoOcorrencia } from './execucao-ocorrencia';
import { editarExigenciasOcorrencia, editarMetaOcorrencia, editarPesoOcorrencia } from '@/hooks/use-ocorrencias';
import { FormularioRequisitosOcorrencia, type RequisitosOcorrencia } from './requisitos-ocorrencia';
import { ProgressoSerieRecorrente } from './progresso-serie-recorrente';
import { ParticipacaoOcorrencia } from './participacao-ocorrencia';
import { quantidadeBRParaApi, quantidadeApiParaBR, milesimosApi } from '@/lib/numero-quantidade-br';
import { ROTULOS_PERIODICIDADE } from '@/lib/entregaveis';

const CAMPO = 'mt-1.5 w-full min-w-0 rounded-xl border border-brand-green/25 bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25 disabled:opacity-50';
const CAMPO_SELECT = `${CAMPO} pi-select pr-10`;
const BOTAO = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-40';
const BOTAO_AGENDA = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40';
const CANCELAR = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-400 dark:text-red-300 disabled:opacity-50';
const PRINCIPAL = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50';
const ESTADOS: Record<StatusOcorrencia, { titulo: string; borda: string; fundo: string; texto: string; badge: string; modal: 'nao-iniciado' | 'andamento' | 'concluido' | 'pendente' | 'revisao' | 'finalizado' | 'parcial' }> = {
  NAO_INICIADO: { titulo: 'Não iniciada', borda: 'border-neutral-400/50', fundo: 'bg-neutral-400/[0.045]', texto: 'text-neutral-700 dark:text-neutral-200', badge: 'border-neutral-400/35 bg-neutral-400/10', modal: 'nao-iniciado' },
  EM_ANDAMENTO: { titulo: 'Em andamento', borda: 'border-brand-green/55', fundo: 'bg-brand-green/[0.075]', texto: 'text-brand-neon', badge: 'border-brand-green/40 bg-brand-green/10', modal: 'andamento' },
  PENDENTE_CONCLUSAO: { titulo: 'Pendente de conclusão', borda: 'border-violet-400/55', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-amber-400/60 bg-amber-500/10', modal: 'pendente' },
  PENDENTE_CONCLUSAO_PARCIAL: { titulo: 'Pendente de conclusão parcial', borda: 'border-violet-400/55', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-amber-400/60 bg-amber-500/10', modal: 'pendente' },
  PENDENTE_ENCERRAMENTO: { titulo: 'Pendente de encerramento', borda: 'border-violet-500/55', fundo: 'bg-violet-500/[0.12]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-500/55 bg-violet-500/15', modal: 'pendente' },
  EM_REVISAO: { titulo: 'Em revisão', borda: 'border-teal-500/55', fundo: 'bg-teal-500/[0.045]', texto: 'text-teal-800 dark:text-teal-200', badge: 'border-teal-500/40 bg-teal-500/10', modal: 'revisao' },
  ENCERRADA: { titulo: 'Encerrada', borda: 'border-purple-500/65', fundo: 'bg-purple-500/[0.15]', texto: 'text-purple-700 dark:text-purple-300', badge: 'border-purple-500/65 bg-purple-500/20', modal: 'finalizado' },
  CONCLUIDO: { titulo: 'Concluída', borda: 'border-violet-400/45', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-400/40 bg-violet-500/10', modal: 'concluido' },
  CONCLUIDO_PARCIALMENTE: { titulo: 'Concluída parcialmente', borda: 'border-amber-500/45', fundo: 'bg-amber-500/[0.045]', texto: 'text-amber-800 dark:text-amber-200', badge: 'border-amber-400/40 bg-amber-500/10', modal: 'parcial' },
};
type Requisitos = RequisitosOcorrencia;
const requisitosPadrao = ():Requisitos => ({minimoAtividadesVerificadas:0,minimoEvidenciasVerificadas:0,minimoFotos:0,minimoRelatorios:0,minimoEvidenciasLivres:0,evidenciaExigida:'NENHUMA',permiteEncerramentoExcepcional:true});
const requisitosDe = (o: Ocorrencia):Requisitos => ({minimoAtividadesVerificadas:o.minimoAtividadesVerificadas ?? (o.exigeAtividade === false ? 0 : 1),
  minimoEvidenciasVerificadas:o.minimoEvidenciasVerificadas ?? (o.evidenciaExigida === 'AMBOS' ? 2 : o.evidenciaExigida && o.evidenciaExigida !== 'NENHUMA' ? 1 : 0),
  minimoFotos:o.minimoFotos ?? (o.evidenciaExigida==='FOTO'?o.minimoEvidenciasVerificadas??1:o.evidenciaExigida==='AMBOS'?1:0),
  minimoRelatorios:o.minimoRelatorios ?? (o.evidenciaExigida==='RELATORIO'?o.minimoEvidenciasVerificadas??1:o.evidenciaExigida==='AMBOS'?1:0),
  minimoEvidenciasLivres:o.minimoEvidenciasLivres ?? (o.evidenciaExigida==='NENHUMA'?0:o.evidenciaExigida==='AMBOS'?Math.max(0,(o.minimoEvidenciasVerificadas??2)-2):0),
  evidenciaExigida:o.evidenciaExigida ?? 'NENHUMA',permiteEncerramentoExcepcional:o.permiteEncerramentoExcepcional ?? true});
type Formulario = Requisitos & { modoRegistro: 'DESCRITIVO' | 'QUANTITATIVO'; entregavelId: string; titulo: string; periodoInicio: string; periodoFim: string; dataPrevista: string; metaQuantidade: string; quantidadeRealizada: string; observacoes: string };
const vazio = (): Formulario => ({ ...requisitosPadrao(), modoRegistro: 'DESCRITIVO', entregavelId: '', titulo: '', periodoInicio: '', periodoFim: '', dataPrevista: '', metaQuantidade: '', quantidadeRealizada: '', observacoes: '' });
// Zod valida o conteúdo; o desenho dos inputs é definido pelo CSS, não pelo Zod.
const esquemaCadastro = z.object({
  entregavelId: z.string().min(1, 'Selecione um entregável.'),
  titulo: z.string().trim().min(1, 'Informe o título da ocorrência.').max(50),
  modoRegistro: z.enum(['DESCRITIVO', 'QUANTITATIVO']),
  metaQuantidade: z.string(),
  periodoInicio: z.string(), periodoFim: z.string(), dataPrevista: z.string(),
  observacoes: z.string().max(200), quantidadeRealizada: z.string(),
  minimoAtividadesVerificadas:z.number().int().min(0).max(99),minimoEvidenciasVerificadas:z.number().int().min(0).max(99),minimoFotos:z.number().int().min(0).max(99),minimoRelatorios:z.number().int().min(0).max(99),minimoEvidenciasLivres:z.number().int().min(0).max(99),evidenciaExigida:z.enum(['NENHUMA','FOTO','RELATORIO','AMBOS']),permiteEncerramentoExcepcional:z.boolean(),
}).superRefine((dados, ctx) => {
  const metaApi = quantidadeBRParaApi(dados.metaQuantidade);
  const meta = metaApi === null ? NaN : Number(metaApi);
  if (dados.modoRegistro === 'QUANTITATIVO' && (!Number.isFinite(meta) || meta <= 0)) {
    ctx.addIssue({ code: 'custom', path: ['metaQuantidade'], message: 'Informe uma meta positiva, com até três casas decimais.' });
  }
  if (dados.periodoInicio && dados.periodoFim && dados.periodoFim < dados.periodoInicio) {
    ctx.addIssue({ code: 'custom', path: ['periodoFim'], message: 'O fim do período não pode anteceder o início.' });
  }
});
const dataBR = (data: string | null | undefined) => data && /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : 'Não informada';

/** Ordem exibida em agenda: início previsto, prazo da ocorrência, execução efetiva. */
function descricaoPeriodo(o: Ocorrencia, periodicidade?: string | null) {
  if (!o.periodoInicio && !o.periodoFim) return null;
  if (o.origem === 'RECORRENTE' && periodicidade === 'DIARIA' && o.periodoInicio && o.periodoInicio === o.periodoFim) {
    return `Diário: ${dataBR(o.periodoInicio)}`;
  }
  return o.periodoInicio === o.periodoFim && o.periodoInicio
    ? `Período: ${dataBR(o.periodoInicio)}`
    : `Período previsto: ${dataBR(o.periodoInicio)} — ${dataBR(o.periodoFim)}`;
}
function tituloApresentacao(o: Ocorrencia, periodicidade?: string | null) {
  if (o.origem === 'RECORRENTE' && periodicidade === 'DIARIA' && o.periodoInicio === o.periodoFim) {
    // Não duplicar a faixa "de... a..." embutida no título automático diário.
    return o.titulo.replace(/\s*\(\d{4}-\d{2}-\d{2} a \d{4}-\d{2}-\d{2}\)$/, '');
  }
  return o.titulo;
}
/** Painel compartilhado: mesma agenda por contrato na rota global e na aba do contrato. */
export function PainelOcorrencias({ contratoId, somenteLeitura = false, regularizacaoDocumental = false, embutido = false, somenteDetalhe = false, estadoContextual = 'normal', entregavelIdInicial = '', abrirOcorrenciaId = null, aoFecharOcorrenciaSelecionada, ocultarCadastro = false, calendarioExterno = false, calendarioInicial, cadastroInicial, aoFecharCadastro, navegacaoCadastro }: { contratoId: string; somenteLeitura?: boolean; regularizacaoDocumental?: boolean; embutido?: boolean; somenteDetalhe?: boolean; estadoContextual?: EstadoContextual; entregavelIdInicial?: string; abrirOcorrenciaId?:string|null; aoFecharOcorrenciaSelecionada?:()=>void; ocultarCadastro?:boolean; calendarioExterno?:boolean; calendarioInicial?:ReactNode; cadastroInicial?:{gatilho:HTMLElement;metaQuantidade?:string}; aoFecharCadastro?:()=>void; navegacaoCadastro?:NavegacaoCadastroRegistro }) {
  const contextoEntregavel = Boolean(entregavelIdInicial);
  const [entregavelFiltro, setEntregavelFiltro] = useState(entregavelIdInicial);
  const [etapaFiltro, setEtapaFiltro] = useState('');
  const [dataInicial, setDataInicial] = useState('');
  const [dataFinal, setDataFinal] = useState('');
  const [motivoReabertura, setMotivoReabertura] = useState('');
  const [focoReabertura, setFocoReabertura] = useState<HTMLElement | null>(null);
  const [mostrarReabertura, setMostrarReabertura] = useState(false);
  const [alertaElegibilidade, setAlertaElegibilidade] = useState(false);
  const [mostrarEncerramento, setMostrarEncerramento] = useState(false);
  const [motivoEncerramento, setMotivoEncerramento] = useState('');
  const [situacaoFiltro, setSituacaoFiltro] = useState<'TODAS' | StatusOcorrencia>('TODAS');
  const [abaOcorrencias, setAbaOcorrencias] = useState<'ATIVAS' | 'REVISAO' | 'PENDENTE' | 'CONCLUIDAS' | 'ARQUIVADAS'>('ATIVAS');
  const historico = abaOcorrencias === 'ARQUIVADAS';
  // No recorrente, a periodicidade determina o calendário. Não existe preferência de tela.
  const [replanejar, setReplanejar] = useState(false);
  const [impacto, setImpacto] = useState<ImpactoAgenda | null>(null);
  const [plano, setPlano] = useState({inicioFuturo:'',terminoPrevisto:'',periodicidade:'SEMANAL'});
  const [prazoOriginal, setPrazoOriginal] = useState('');
  const [informarMetaNova, setInformarMetaNova] = useState(false);
  const [recuperarAgenda, setRecuperarAgenda] = useState(false);
  const [modoNovoPeriodo, setModoNovoPeriodo] = useState<'DESCRITIVO'|'QUANTITATIVO'>('DESCRITIVO');
  const [metaNovoPeriodo, setMetaNovoPeriodo] = useState('');
  const [unidadeReplanejamento, setUnidadeReplanejamento] = useState('');
  const [busca, setBusca] = useState('');
  const [modalFiltros, setModalFiltros] = useState(false);
  const [focoFiltros, setFocoFiltros] = useState<HTMLElement | null>(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [dataUnica, setDataUnica] = useState(false);
  const [verificandoAtividade, setVerificandoAtividade] = useState(false);
  const [confirmarGeracao, setConfirmarGeracao] = useState(false);
  const [requisitosGeracao, setRequisitosGeracao] = useState<Requisitos>(requisitosPadrao);

  const [metaRecorrente, setMetaRecorrente] = useState('');
  const [entregavelRecorrente, setEntregavelRecorrente] = useState(entregavelIdInicial);
  const [form, setForm] = useState<Formulario>(vazio);
  const [detalhe, setDetalhe] = useState<Ocorrencia | null>(null);
  const [falhaAbertura, setFalhaAbertura] = useState<string | null>(null);
  const versaoDetalhe = useRef(0);
  const [abaDetalhe, setAbaDetalhe] = useState<'DETALHES'|'ATIVIDADES'|'EVIDENCIAS'|'HISTORICO'>('DETALHES');
  const [editando, setEditando] = useState(false);
  const [pesoPeriodoEdicao,setPesoPeriodoEdicao]=useState('');
  const [justificativaMeta, setJustificativaMeta] = useState('');
  const [formEdicao, setFormEdicao] = useState({ ...requisitosPadrao(), status: 'NAO_INICIADO' as StatusOcorrencia, titulo:'', dataPrevista:'', dataRealizada: '', quantidadeRealizada: '', metaQuantidade: '', observacoes: '' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [focoRetorno, setFocoRetorno] = useState<HTMLElement | null>(null);
  const [planejamento, setPlanejamento] = useState<{ id: string; editar: boolean; foco: HTMLElement } | null>(null);
  const [atividadeSelecionada, setAtividadeSelecionada] = useState<{ id: string; foco: HTMLElement } | null>(null);
  const [atividadeDetalhe, setAtividadeDetalhe] = useState<Atividade | null>(null);
  const [atividadeErro, setAtividadeErro] = useState('');
  const leituraAtividade=useRef<AbortController|null>(null);
  useEffect(()=>()=>leituraAtividade.current?.abort(),[]);
  const [acaoAtividadePendente, setAcaoAtividadePendente] = useState<'reabrir' | 'cancelar-solicitacao' | 'desvincular' | null>(null);
  const [motivoAcaoAtividade, setMotivoAcaoAtividade] = useState('');
  const [mostrarVincular, setMostrarVincular] = useState(false);
  const [buscaVinculo, setBuscaVinculo] = useState('');
  const [atividadesDisponiveis, setAtividadesDisponiveis] = useState<Atividade[]>([]);
  const [atividadeParaVincular, setAtividadeParaVincular] = useState<string>('');
  const [consultandoVinculos, setConsultandoVinculos] = useState(false);
  const [erroVinculo, setErroVinculo] = useState('');

  const cache = useRepositorioConsultasOpcional();
  function avisarAtualizacaoContratual() {
    cache?.invalidar(['contratos', 'elegibilidade-conclusao', contratoId]);
    cache?.invalidar(['execucao', contratoId]);
    cache?.invalidar(['contratos', 'pendentes']);
    window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada', { detail: { contratoId } }));
    if (window.parent !== window) window.parent.postMessage({ tipo: 'pi:estrutura-operacional-atualizada', contratoId }, window.location.origin);
  }
  const perfilConsulta = useMeuPerfil();
  const perfil = perfilConsulta.dados;
  const acesso = useAcessoContrato(contratoId);
  const podeConsultarHistorico = !acesso.erro && Boolean(perfil?.ativo) && (perfil?.perfil === 'ADMINISTRADOR' || Boolean(acesso.dados?.permissoes?.editarOcorrencias));
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = useMemo(() => (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm), [entregaveisConsulta.dados]);
  const etapasConsulta = useEtapas(contratoId);
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm && !e.conclusaoSolicitadaEm && !e.encerramentoSolicitadoEm && !['CONCLUIDA','CONCLUIDO_PARCIALMENTE','ENCERRADA','FINALIZADA'].includes(e.status)).map(e => e.id));
  const contextoDoEntregavel = entregaveis.find(e => e.id === entregavelIdInicial);
  // Também abre calendário quando o recorrente foi escolhido na consulta global.
  const entregavelDaConsulta = entregaveis.find(e => e.id === (contextoEntregavel ? entregavelIdInicial : entregavelFiltro));
  // Somente recorrentes precisam da grade de agenda; demais tipos seguem lista por data de início.
  const modoVisualizacao = !calendarioExterno && entregavelDaConsulta?.tipo === 'RECORRENTE' ? 'CALENDARIO' : 'LISTA';
  const estadoAcaoEntregavel: EstadoContextual = !contextoEntregavel ? estadoContextual
    : contextoDoEntregavel?.arquivadoEm ? 'arquivado' : contextoDoEntregavel?.reabertoEm ? 'revisao'
    : contextoDoEntregavel?.statusExecucao === 'CONCLUIDO' ? 'concluido'
    : contextoDoEntregavel?.statusExecucao === 'EM_ANDAMENTO' ? 'andamento' : 'nao-iniciado';
  const planejamentoCarregado = !entregaveisConsulta.erro && !etapasConsulta.erro && !entregaveisConsulta.carregando && !etapasConsulta.carregando;
  const planejamentoDisponivel = planejamentoCarregado && !entregaveisConsulta.atualizando && !etapasConsulta.atualizando;
  const abertos = planejamentoCarregado ? entregaveis.filter(e => !e.arquivadoEm && !e.regularizacaoDocumentalSolicitada && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '') && etapasAbertas.has(e.etapaId)) : [];
  const agenda = useOcorrencias(contratoId);
  const entregaveisManuais = abertos.filter(e => e.tipo !== 'RECORRENTE' && !e.quantidadeDiretaIntegrada && (!(e.tipo==='CONTINUO'||e.tipo==='MARCO')||!agenda.ocorrencias.some(o=>o.entregavelId===e.id&&!o.substituidaEm)));
  const tipoCadastroSelecionado = entregaveis.find(e => e.id === form.entregavelId)?.tipo;
  const entregaveisDoFormulario = entregaveisManuais;
  const entregaveisRecorrentes = abertos.filter(e => e.tipo === 'RECORRENTE');
  const recorrenteSelecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
  const metaTotal=(id:string)=>Number(entregaveis.find(e=>e.id===id)?.quantidadePrevista??0);
  const metasOutras=(id:string,excluir?:string)=>agenda.ocorrencias.filter(o=>o.entregavelId===id&&o.id!==excluir&&!o.substituidaEm).reduce((a,o)=>a+Number(o.metaQuantidade??0),0);
  const agendaConfiavel = !agenda.loading && !agenda.erro;
  const agendaJaCriada = Boolean(entregavelRecorrente && agenda.ocorrencias.some(o => o.entregavelId === entregavelRecorrente && o.origem === 'RECORRENTE' && !o.substituidaEm));
  const modoRecorrente = recorrenteSelecionado?.configuracaoPeriodicidade?.modoRegistro;
  const planejamentoCompleto = Boolean(recorrenteSelecionado?.inicioPrevisto && recorrenteSelecionado?.terminoPrevisto && recorrenteSelecionado?.periodicidade && modoRecorrente);
  const nomes = Object.fromEntries(entregaveis.map(e => [e.id, e.nome]));
  const unidades = Object.fromEntries(entregaveis.map(e => [e.id, e.unidadeMedida?.trim() || '']));
  const periodos = Object.fromEntries(entregaveis.map(e => [e.id, e.periodicidade]));
  const progresso = useProgresso(contratoId);
  const [confirmarConcilicacao, setConfirmarConciliacao] = useState(false);
  const selecionadoQuantitativo = progresso.progresso?.entregaveis.find(e => e.entregavelId === form.entregavelId);
  const quantidadeDireta = selecionadoQuantitativo?.tipo === 'QUANTITATIVO' && selecionadoQuantitativo.fonte === 'DECLARADO' && Number(selecionadoQuantitativo.realizado ?? 0) !== 0
    ? selecionadoQuantitativo.realizado : null;
  // Permissões granulares de entregável; leitura não concede escrita.
  const autorizado = !somenteLeitura && !acesso.erro && Boolean(perfil?.ativo);
  const administrador = perfil?.perfil === 'ADMINISTRADOR';
  const permitir = (chave: 'criarOcorrencias' | 'editarOcorrencias' | 'editarMetaOcorrencia' | 'vincularAtividadesOcorrencia' | 'vincularEvidenciasOcorrencia' | 'editarExigenciasOcorrencia' | 'editarPesoOcorrencia' | 'registrarExecucaoOcorrencia' | 'aprovarExecucaoManual' | 'corrigirExecucaoOcorrencia' | 'bloquearExecucaoOcorrencia' | 'excluirExecucaoOcorrencia' | 'concluirOcorrencias' | 'reabrirOcorrencias' | 'configurarAgendaOcorrencias' | 'editarExecucaoFisica' | 'enviarComprovantes') => autorizado && (administrador || Boolean(acesso.dados?.permissoes?.[chave]));
  const podeCriarBase = permitir('criarOcorrencias');
  const podeEditar = permitir('editarOcorrencias');
  const podeEditarMeta = permitir('editarMetaOcorrencia');
  const podeEditarExigencias=permitir('editarExigenciasOcorrencia');
  const podeEditarPeso=permitir('editarPesoOcorrencia');
  const podeRegistrarMedicao = permitir('registrarExecucaoOcorrencia');
  const podeCorrigirMedicao = permitir('corrigirExecucaoOcorrencia');
  const podeBloquearMedicao = permitir('bloquearExecucaoOcorrencia');
  const podeExcluirMedicao = permitir('excluirExecucaoOcorrencia');
  const emRegularizacao = Boolean((!somenteLeitura || regularizacaoDocumental) && detalhe?.status === 'CONCLUIDO_PARCIALMENTE' && !detalhe.substituidaEm && !acesso.erro && perfil?.ativo);
  const podeSolicitarRegularizacao = emRegularizacao && (administrador || Boolean(acesso.dados?.permissoes?.editarOcorrencias));
  const podeDecidirRegularizacao = emRegularizacao && (administrador || Boolean(acesso.dados?.permissoes?.concluirOcorrencias));
  const podeCancelarRegularizacao = emRegularizacao && (administrador || Boolean(acesso.dados?.permissoes?.reabrirOcorrencias));
  const podeVincularEvidencia = !detalhe?.regularizacaoDocumentalSolicitada && (permitir('vincularEvidenciasOcorrencia') || (emRegularizacao && (administrador || Boolean(acesso.dados?.permissoes?.vincularEvidenciasOcorrencia))));
  const podeEditarPlanejamento = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.editarEntregaveis));
  const podeConcluir = permitir('concluirOcorrencias');
  const podeReabrir = permitir('reabrirOcorrencias');
  const podeVerificarAtividade = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.verificarAtividades));
  const podeSolicitarAtividade = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.editarAtividades));
  const podeVincularAtividade = permitir('vincularAtividadesOcorrencia') && Boolean(detalhe && !detalhe.substituidaEm &&
    ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) &&
    abertos.some(e => e.id === detalhe.entregavelId));
  useEffect(() => {
    if (!mostrarVincular || !detalhe?.entregavelId) return;
    const controlador = new AbortController();
    queueMicrotask(() => { if (!controlador.signal.aborted) { setConsultandoVinculos(true); setErroVinculo(''); } });
    void listarAtividadesVinculaveis(contratoId, detalhe.entregavelId, controlador.signal)
      .then(pagina => {if(!controlador.signal.aborted)setAtividadesDisponiveis(pagina.data.filter(a => a.status === 'REGISTRADA'));})
      .catch(erro => { if (!controlador.signal.aborted) setErroVinculo(erro instanceof Error && /(?:operation|request) aborted|aborterror/i.test(erro.message) ? 'A consulta foi interrompida. Tente novamente.' : erro instanceof Error ? erro.message : 'Não foi possível consultar as atividades.'); })
      .finally(() => { if (!controlador.signal.aborted) setConsultandoVinculos(false); });
    return () => controlador.abort();
  }, [mostrarVincular, detalhe?.entregavelId, contratoId]);

  const podeAgendar = permitir('configurarAgendaOcorrencias');
  const podeConfigurarSelecionado = entregavelDaConsulta?.tipo === 'RECORRENTE' ? podeAgendar : podeEditarPlanejamento;
  const podeEditarDetalhe = (podeEditar || podeEditarMeta || podeEditarExigencias || podeEditarPeso) && Boolean(detalhe && !detalhe.substituidaEm && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && abertos.some(e => e.id === detalhe.entregavelId));
  // A solicitação congela os registros vinculados. Todas as atividades ativas
  // precisam estar verificadas para evitar um bloqueio sem saída.
  const atividadesValidas = detalhe?.atividades?.filter(a => a.status !== 'ARQUIVADA') ?? [];
  const haAtividadesPendentes = atividadesValidas.some(a => a.status !== 'VERIFICADA');
  const haExecucaoPendente = Boolean(detalhe?.registrosExecucaoPendentes || haAtividadesPendentes);
  const semAtividadeVerificada = atividadesValidas.filter(a=>a.status==='VERIFICADA').length < (detalhe ? requisitosDe(detalhe).minimoAtividadesVerificadas : 0) || haAtividadesPendentes;
  const metaCumprida = detalhe?.metaAtingida ?? (detalhe?.metaQuantidade != null && Number(detalhe.metaQuantidade)>0 && milesimosApi(detalhe.quantidadeExecutadaExata??detalhe.quantidadeExecutada) >= milesimosApi(detalhe.metaQuantidade));
  const entregavelContinuo = entregaveis.find(e => e.id === detalhe?.entregavelId);
  const periodoCumprido = entregavelContinuo?.tipo !== 'CONTINUO' ||
    !entregavelContinuo.terminoPrevisto || diaLocalBrasil() >= entregavelContinuo.terminoPrevisto;
  const podeSolicitarConclusao = Boolean(detalhe && (detalhe.requisitosAtendidos ?? !semAtividadeVerificada) && metaCumprida && periodoCumprido);
  const podeSolicitarParcial = Boolean(detalhe && detalhe.criteriosOperacionaisAtendidos && detalhe.documentacaoAtendida === false && metaCumprida && periodoCumprido);
  const podeCriar = podeCriarBase && entregaveisManuais.length > 0;
  const podeCadastrarNesteContexto = !contextoEntregavel || entregaveisManuais.some(e => e.id === entregavelIdInicial);
  const podeGerar = podeAgendar && entregaveisRecorrentes.length > 0;
  const registros = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(estadoTemporal(o.status, o.periodoInicio || o.dataPrevista))) || abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!entregavelFiltro || o.entregavelId === entregavelFiltro) &&
    (!etapaFiltro || entregaveis.some(e => e.id === o.entregavelId && e.etapaId === etapaFiltro)) &&
    (abaOcorrencias !== 'ATIVAS' || !dataInicial || (o.periodoFim || o.dataPrevista || o.periodoInicio || '') >= dataInicial) &&
    (abaOcorrencias !== 'ATIVAS' || !dataFinal || Boolean(o.periodoInicio || o.dataPrevista || o.periodoFim) && (o.periodoInicio || o.dataPrevista || o.periodoFim || '') <= dataFinal) &&
    (situacaoFiltro === 'TODAS' || (abaOcorrencias === 'ATIVAS' ? estadoTemporal(o.status, o.periodoInicio || o.dataPrevista) === situacaoFiltro : abaOcorrencias === 'PENDENTE' ? o.status === situacaoFiltro : true)) &&
    (!busca.trim() || o.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(busca.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')))
  ).slice().sort((a,b) => (a.periodoInicio ?? a.dataPrevista ?? '9999').localeCompare(b.periodoInicio ?? b.dataPrevista ?? '9999')),
  [agenda.ocorrencias, entregavelFiltro, etapaFiltro, dataInicial, dataFinal, entregaveis, situacaoFiltro, busca, historico, abaOcorrencias]);
  // A série e o calendário são independentes da aba, pesquisa e filtros de situação.
  const serieCompleta = useMemo(() => agenda.ocorrencias.filter(o =>
    o.entregavelId === entregavelDaConsulta?.id && !o.substituidaEm
  ), [agenda.ocorrencias, entregavelDaConsulta?.id]);
  const calendarioCompleto = useMemo(() => agenda.ocorrencias.filter(o =>
    o.entregavelId === entregavelDaConsulta?.id
  ), [agenda.ocorrencias, entregavelDaConsulta?.id]);
  const resumoFisicoSerie = progresso.progresso?.entregaveis.find(e=>e.entregavelId===entregavelDaConsulta?.id);
  const sugestoesBusca = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (['NAO_INICIADO', 'EM_ANDAMENTO', 'EM_REVISAO'].includes(estadoTemporal(o.status, o.periodoInicio || o.dataPrevista))) ||
      abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!contextoEntregavel || o.entregavelId === entregavelIdInicial)).map(o => o.titulo), [agenda.ocorrencias, historico, abaOcorrencias, contextoEntregavel, entregavelIdInicial]);
  const concluidas = registros.filter(o => ['CONCLUIDO','CONCLUIDO_PARCIALMENTE'].includes(o.status)).length;
  const encerradas = registros.filter(o => o.status === 'ENCERRADA').length;
  const andamento = registros.filter(o => estadoTemporal(o.status, o.periodoInicio || o.dataPrevista) === 'EM_ANDAMENTO').length;

  function abrirVinculo() {
    if (!podeVincularAtividade || !detalhe) return;
    setErroVinculo(''); setBuscaVinculo(''); setAtividadeParaVincular('');
    setAtividadesDisponiveis([]); setMostrarVincular(true);
  }
  async function confirmarVinculo() {
    if (!podeVincularAtividade || !detalhe || !atividadeParaVincular || ocupado) return;
    setOcupado(true); setErroVinculo('');
    try {
      // Leia o estado atual antes da mutação para não sobrescrever outros vínculos.
      const atividade = await consultarAtividade(contratoId, atividadeParaVincular);
      if (atividade.status !== 'REGISTRADA' || !atividade.entregaveis.some(e => e.id === detalhe.entregavelId))
        throw new Error('A atividade precisa estar registrada e associada ao entregável desta ocorrência.');
      const anteriores = atividade.ocorrenciaIds ?? atividade.ocorrencias?.map(o=>o.id) ?? [];
      if (anteriores.includes(detalhe.id)) throw new Error('Esta atividade já está vinculada à ocorrência.');
      await editarAtividadeApi(contratoId, atividade.id, { ocorrenciaIds: [...new Set([...anteriores, detalhe.id])] });
      cache?.invalidar(['atividades', contratoId]);
      await agenda.atualizar();
      const atualizado = await agenda.consultarDetalhe(detalhe.id);
      setDetalhe(atualizado); setMostrarVincular(false); setAtividadeParaVincular(''); setBuscaVinculo('');
      setSucesso('Atividade vinculada à ocorrência.');
    } catch (falha) { setErroVinculo(falha instanceof Error ? falha.message : 'Não foi possível vincular a atividade.'); }
    finally { setOcupado(false); }
  }

  function abrirAtividade(id: string, foco: HTMLElement) {
    leituraAtividade.current?.abort();
    const controlador=new AbortController();leituraAtividade.current=controlador;
    setAtividadeSelecionada({ id, foco }); setAtividadeDetalhe(null); setAtividadeErro('');
    void consultarAtividade(contratoId,id,controlador.signal).then(atividade=>{
      if (atividade.contratoId !== contratoId || atividade.id !== id) throw new Error('Atividade vinculada incompatível com o contrato.');
      if(!controlador.signal.aborted)setAtividadeDetalhe(atividade);
    }).catch((falha:unknown)=>{if(!controlador.signal.aborted)setAtividadeErro(falha instanceof Error?falha.message:'Não foi possível consultar a atividade.');});
  }
  async function verificarAtividadeVinculada() {
    if (!atividadeSelecionada || !atividadeDetalhe || !(atividadeDetalhe.status === 'REGISTRADA' ? podeSolicitarAtividade : podeVerificarAtividade) || !['REGISTRADA', 'PENDENTE_CONCLUSAO'].includes(atividadeDetalhe.status) ||
        !detalhe || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL', 'PENDENTE_ENCERRAMENTO', 'CONCLUIDO','CONCLUIDO_PARCIALMENTE', 'ENCERRADA'].includes(detalhe.status) || verificandoAtividade) return;
    setVerificandoAtividade(true); setAtividadeErro('');
    try {
      await transicionarAtividadeApi(contratoId, atividadeDetalhe.id, atividadeDetalhe.status === 'REGISTRADA' ? 'solicitar-conclusao' : 'aprovar-conclusao');
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      const [atividadeAtualizada, ocorrenciaAtualizada] = await Promise.all([
        consultarAtividade(contratoId, atividadeDetalhe.id),
        agenda.consultarDetalhe(detalhe.id),
      ]);
      setAtividadeDetalhe(atividadeAtualizada);
      setDetalhe(atual => atual?.id === ocorrenciaAtualizada.id ? ocorrenciaAtualizada : atual);
      await agenda.atualizar();
    } catch (falha) { setAtividadeErro(falha instanceof Error ? falha.message : 'Não foi possível alterar a solicitação da atividade.'); }
    finally { setVerificandoAtividade(false); }
  }
  async function executarAcaoAtividadePendente() {
    const atividade = atividadeDetalhe;
    const acao = acaoAtividadePendente;
    const ocorrencia = detalhe;
    if (!atividade || !acao || !ocorrencia || verificandoAtividade || (acao !== 'desvincular' && motivoAcaoAtividade.trim().length < 15)) return;
    const aberta = ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(ocorrencia.status);
    if (!aberta) { setAtividadeErro('Reabra a ocorrência antes de modificar atividades vinculadas.'); return; }
    if (acao === 'reabrir' && !acesso.dados?.permissoes?.reabrirAtividades && !administrador) {
      setAtividadeErro('Sem permissão para reabrir a atividade.'); return;
    }
    if (acao !== 'reabrir' && !podeSolicitarAtividade) {
      setAtividadeErro('Sem permissão para alterar os vínculos ou cancelar a solicitação.'); return;
    }
    setVerificandoAtividade(true); setAtividadeErro('');
    try {
      if (acao === 'desvincular') {
        if (atividade.status !== 'REGISTRADA') throw new Error('Reabra a atividade antes de desvinculá-la.');
        const atuais = atividade.ocorrenciaIds ?? atividade.ocorrencias?.map(o => o.id) ?? [];
        const outros = atuais.filter(id => id !== ocorrencia.id);
        if (outros.length === atuais.length) throw new Error('Esta atividade já não está vinculada à ocorrência.');
        const principal = atividade.ocorrenciaId === ocorrencia.id;
        await editarAtividadeApi(contratoId, atividade.id, {
          ocorrenciaIds: outros,
          medicoes: (atividade.medicoes ?? []).filter(m => m.ocorrenciaId !== ocorrencia.id),
          ...(principal ? { ocorrenciaId: null, quantidadeExecucao: null } : {}),
        });
      } else {
        await transicionarAtividadeApi(contratoId, atividade.id, acao, motivoAcaoAtividade.trim());
      }
      cache?.invalidar(['atividades', contratoId]); cache?.invalidar(['ocorrencias', contratoId]);
      const novaOcorrencia = await agenda.consultarDetalhe(ocorrencia.id);
      setDetalhe(atual => atual?.id === novaOcorrencia.id ? novaOcorrencia : atual);
      if (acao === 'desvincular') {
        setAtividadeSelecionada(null); setAtividadeDetalhe(null);
      } else {
        setAtividadeDetalhe(await consultarAtividade(contratoId, atividade.id));
      }
      await agenda.atualizar(); await progresso.atualizar(); avisarAtualizacaoContratual();
      setAcaoAtividadePendente(null); setMotivoAcaoAtividade('');
      setSucesso(acao === 'desvincular' ? 'Atividade desvinculada.' : 'Estado da atividade atualizado.');
    } catch (falha) { setAtividadeErro(falha instanceof Error ? falha.message : 'Não foi possível alterar a atividade.'); }
    finally { setVerificandoAtividade(false); }
  }
  const cadastroInicialAberto = useRef(false);
  useEffect(() => {
    if (!cadastroInicial || cadastroInicialAberto.current || !planejamentoDisponivel || perfilConsulta.carregando || acesso.carregando || perfilConsulta.atualizando || acesso.atualizando) return;
    let ativo=true;
    queueMicrotask(()=>{
    if(!ativo||cadastroInicialAberto.current)return;
    cadastroInicialAberto.current=true;
    if (!podeCriar || !podeCadastrarNesteContexto) {setAlertaElegibilidade(true);return;}
    setDataUnica(false);setFocoRetorno(cadastroInicial.gatilho);
    setForm({...vazio(),entregavelId:entregavelIdInicial,modoRegistro:contextoDoEntregavel?.tipo==='QUANTITATIVO'?'QUANTITATIVO':'DESCRITIVO',metaQuantidade:cadastroInicial.metaQuantidade??''});
    setModalCadastro(true);
    });return()=>{ativo=false;};
  },[cadastroInicial,planejamentoDisponivel,podeCriar,podeCadastrarNesteContexto,entregavelIdInicial,contextoDoEntregavel?.tipo,perfilConsulta.carregando,perfilConsulta.atualizando,acesso.carregando,acesso.atualizando]);
  function abrirCadastro(gatilho: HTMLElement) {
    setDataUnica(false); setFocoRetorno(gatilho); setForm({ ...vazio(), entregavelId: entregaveisManuais.some(e=>e.id===entregavelFiltro) ? entregavelFiltro : '', modoRegistro: entregaveis.find(e => e.id === entregavelFiltro)?.tipo === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO' }); setErro(''); setSucesso(''); setModalCadastro(true);
  }
  function abrirDetalhe(o: Ocorrencia, gatilho: HTMLElement, editar = false) {
    const versao = ++versaoDetalhe.current;
    setFocoRetorno(gatilho); setErro(''); setSucesso(''); setDetalhe(null);
    // Carregar o estado autoritativo antes de montar a superfície colorida.
    const consulta = agenda.consultarDetalhe ? agenda.consultarDetalhe(o.id) : Promise.resolve(o);
    void consulta.then(registro => {
      if (versaoDetalhe.current !== versao) return;
      if (registro.id !== o.id || registro.contratoId !== contratoId) throw new Error('Ocorrência incompatível com o contrato.');
      setDetalhe(registro); setAbaDetalhe('DETALHES'); setEditando(editar); setMostrarReabertura(false);
      setPesoPeriodoEdicao(registro.pesoPeriodo==null?'':Number(registro.pesoPeriodo).toFixed(2).replace('.',',')); setJustificativaMeta('');
      setFormEdicao({status:registro.status,titulo:registro.titulo,dataPrevista:registro.dataPrevista??'',dataRealizada:registro.dataRealizada??'',quantidadeRealizada:registro.quantidadeRealizada??'',metaQuantidade:quantidadeApiParaBR(registro.metaQuantidade),observacoes:registro.observacoes??'',...requisitosDe(registro)});
    }).catch(() => { if (versaoDetalhe.current === versao) setErro('Não foi possível abrir os detalhes da ocorrência.'); });
  }
  // Consulta direta pelo ID, independente da lista e de seus filtros. Uma
  // resposta de uma seleção anterior não pode reabrir ou substituir o modal.
  const consultarDetalheRef = useRef(agenda.consultarDetalhe);
  useEffect(() => () => { versaoDetalhe.current++; }, []);
  useEffect(() => { consultarDetalheRef.current = agenda.consultarDetalhe; });
  useEffect(() => {
    if (!abrirOcorrenciaId) return;
    const id = abrirOcorrenciaId;
    let ativo = true;
    const versao = ++versaoDetalhe.current;
    const foco = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    queueMicrotask(() => {
      if (!ativo) return;
      setFalhaAbertura(null); setDetalhe(null); setErro(''); setSucesso(''); setFocoRetorno(foco);
      void Promise.resolve().then(() => consultarDetalheRef.current(id)).then(registro => {
        if (!ativo || versaoDetalhe.current !== versao) return;
        if (registro.id !== id || registro.contratoId !== contratoId) throw new Error('Ocorrência incompatível com o contrato.');
        setDetalhe(registro); setAbaDetalhe('DETALHES'); setEditando(false); setMostrarReabertura(false);
        setPesoPeriodoEdicao(registro.pesoPeriodo==null?'':Number(registro.pesoPeriodo).toFixed(2).replace('.',',')); setJustificativaMeta('');
        setFormEdicao({status:registro.status,titulo:registro.titulo,dataPrevista:registro.dataPrevista??'',dataRealizada:registro.dataRealizada??'',quantidadeRealizada:registro.quantidadeRealizada??'',metaQuantidade:quantidadeApiParaBR(registro.metaQuantidade),observacoes:registro.observacoes??'',...requisitosDe(registro)});
      }).catch(e => { if (ativo && versaoDetalhe.current === versao) setFalhaAbertura(e instanceof Error ? e.message : 'Ocorrência não encontrada ou sem acesso.'); });
    });
    return () => { ativo = false; };
  }, [abrirOcorrenciaId, contratoId]);
  async function atualizarDetalheOcorrencia(){
    if (!detalhe)return;
    const atualizado=await agenda.consultarDetalhe(detalhe.id);
    setDetalhe(atual=>atual?.id===atualizado.id?atualizado:atual);
    const resultados=await Promise.allSettled([agenda.atualizar(),progresso.atualizar()]);
    avisarAtualizacaoContratual();
    if(resultados.some(r=>r.status==='rejected'))throw new Error('Dados salvos, mas não foi possível atualizar todos os indicadores.');
  }
  async function gerarRecorrencias() {
    const selecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
    if (!podeGerar || !selecionado || ocupado || !agendaConfiavel || !modoRecorrente || (agendaJaCriada !== recuperarAgenda)) return;
    const meta = quantidadeBRParaApi(metaRecorrente);
    if (!recuperarAgenda && modoRecorrente === 'QUANTITATIVO') {
      if (!podeEditarMeta || !(Number(meta ?? 0)>0)) { setErro('A geração quantitativa exige permissão para definir a meta e uma quantidade positiva.'); return; }
      if (!selecionado.unidadeMedida?.trim()) { setErro('Defina a unidade de medida no planejamento do entregável antes de gerar ocorrências quantitativas.'); return; }
    }
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const geradas = await agenda.gerarOcorrenciasRecorrentes(selecionado.id, recuperarAgenda ? {recuperarFaltantes:true} : {
        ...(podeEditarExigencias ? requisitosGeracao : {}), modoRegistro:modoRecorrente,
        ...(modoRecorrente==='QUANTITATIVO'?{metaQuantidade:meta!}:{}),
      });
      setSucesso(geradas ? `${geradas} ocorrência(s) recorrente(s) gerada(s). Períodos existentes preservados.` : 'Agenda completa. Nenhuma ocorrência nova foi necessária.');
      setConfirmarGeracao(false); setRecuperarAgenda(false);
      avisarAtualizacaoContratual();
    } catch (falha) { setErro(explicarFalhaDePeriodo(falha instanceof Error ? falha.message : 'Não foi possível gerar os períodos.')); }
    finally { setOcupado(false); }
  }
  function abrirGeracao(id:string, gatilho:HTMLElement, recuperar=false) {
    setFocoRetorno(gatilho); setEntregavelRecorrente(id); setRecuperarAgenda(recuperar);
    setRequisitosGeracao(requisitosPadrao()); setMetaRecorrente(''); setErro(''); setConfirmarGeracao(true);
  }
  function iniciarReplanejamento(id: string, gatilho: HTMLElement) {
    const selecionado = entregaveis.find(e => e.id === id);
    if (!selecionado || !agendaConfiavel || !podeAgendar) return;
    setFocoRetorno(gatilho); setEntregavelRecorrente(id);
    const registroModelo = agenda.ocorrencias.find(o => o.entregavelId === id && o.origem === 'RECORRENTE' && !o.substituidaEm);
    setModoNovoPeriodo(selecionado.configuracaoPeriodicidade?.modoRegistro??(registroModelo?.modoRegistro === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO'));
    const meta = registroModelo?.metaQuantidade ? quantidadeApiParaBR(registroModelo.metaQuantidade) : '';
    setMetaNovoPeriodo(meta); setInformarMetaNova(false);
    setUnidadeReplanejamento(selecionado.unidadeMedida ?? '');
    setPrazoOriginal(selecionado.terminoPrevisto ?? '');
    // O entregável fornece o snapshot do planejamento. A prévia do backend
    // verifica a grade e sua configuração; nenhuma resposta assíncrona sobrescreve o formulário.
    const hoje = diaLocalBrasil();
    const inicioAgenda = selecionado.agendaInicioFuturo ?? selecionado.inicioPrevisto ?? '';
    const fronteiraFutura = agenda.ocorrencias.filter(o=>o.entregavelId===id && o.origem==='RECORRENTE' && !o.substituidaEm && o.periodoInicio && o.periodoInicio>=hoje).map(o=>o.periodoInicio!).sort()[0];
    setPlano({ inicioFuturo: inicioAgenda >= hoje ? inicioAgenda : fronteiraFutura ?? hoje, terminoPrevisto: selecionado.terminoPrevisto ?? '', periodicidade: selecionado.periodicidade ?? 'SEMANAL' });
    setImpacto(null); setErro(''); setReplanejar(true);
  }
  function explicarFalhaDePeriodo(texto: string) {
    if (/periodicidade|período parcial|per[ií]odos completos|PQ-09|PQ-10|último período/i.test(texto)) {
      const intervalo = texto.match(/\d{4}-\d{2}-\d{2}/g);
      const complemento = intervalo && intervalo.length >= 3
        ? ` O último período seria ${dataBR(intervalo[0])} a ${dataBR(intervalo[1])}, mas a vigência termina em ${dataBR(intervalo[2])}.` : '';
      return `As datas selecionadas não formam períodos completos na periodicidade escolhida.${complemento} Ajuste o início, o fim ou a periodicidade para que todos os períodos caibam na vigência do entregável.`;
    }
    return texto;
  }
  async function calcularImpacto(confirmar: boolean) {
    if (!podeAgendar || !podeGerar || !entregavelRecorrente || ocupado || !agendaConfiavel || !agendaJaCriada) return;
    if (modoNovoPeriodo === 'QUANTITATIVO' && !unidadeReplanejamento.trim()) {
      setErro('A medição quantitativa exige unidade de medida no entregável.'); return;
    }
    const metaAlterada = modoNovoPeriodo === 'QUANTITATIVO' && informarMetaNova;
    const meta = metaAlterada ? quantidadeBRParaApi(metaNovoPeriodo) : null;
    if (metaAlterada && (!podeEditarMeta || !meta || Number(meta) <= 0)) {
      setErro('A meta quantitativa de novos períodos deve ser maior que zero.'); return;
    }
    if (plano.terminoPrevisto !== prazoOriginal && !podeEditarPlanejamento) { setErro('Sem permissão para alterar o prazo do entregável.'); return; }
    setOcupado(true); setErro('');
    try {
      const r = await agenda.replanejar(entregavelRecorrente,{...plano,
        ...(plano.terminoPrevisto !== prazoOriginal ? {alterarPrazo:true} : {}),
        ...(meta ? {metaQuantidade: meta} : {}),
        ...(confirmar && impacto?{confirmacao:impacto.confirmacao}:{})});
      if(r.aplicado){setReplanejar(false);setImpacto(null);setSucesso('Agenda replanejada. Conclusões preservadas; versões conflitantes arquivadas.'); avisarAtualizacaoContratual();void Promise.allSettled([agenda.atualizar(),entregaveisConsulta.atualizar(),progresso.atualizar()]);}else setImpacto(r);
    } catch(f){setImpacto(null);setErro(explicarFalhaDePeriodo(f instanceof Error ? f.message : 'Não foi possível replanejar os períodos.'));} finally {setOcupado(false);}
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    const resultado = esquemaCadastro.safeParse(form);
    if (!resultado.success) { setErro(resultado.error.issues[0]?.message ?? 'Revise os campos da ocorrência.'); return; }
    if (!podeCriar || !entregaveisDoFormulario.some(e => e.id === form.entregavelId)) { setErro('Selecione um entregável autorizado para este tipo de ocorrência.'); return; }
    if (form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null) { setErro('Concilie a quantidade declarada antes de registrar ocorrências medidas, para evitar dupla contagem.'); return; }
    if (form.modoRegistro === 'QUANTITATIVO' && !(Number(quantidadeBRParaApi(form.metaQuantidade) ?? 0) > 0)) { setErro('Informe uma meta maior que zero para esta ocorrência por quantidade.'); return; }
    if (!dataUnica && form.periodoInicio && form.periodoFim && form.periodoInicio > form.periodoFim) { setErro('A data final deve ser igual ou posterior à inicial.'); return; }
    setOcupado(true);
    try {
      const criada=await agenda.criarOcorrenciaManual({
        entregavelId: form.entregavelId, titulo: form.titulo.trim(), modoRegistro: form.modoRegistro,
        minimoAtividadesVerificadas:form.minimoAtividadesVerificadas,minimoEvidenciasVerificadas:form.minimoEvidenciasVerificadas,
        minimoFotos:form.minimoFotos,minimoRelatorios:form.minimoRelatorios,minimoEvidenciasLivres:form.minimoEvidenciasLivres,
        evidenciaExigida:form.evidenciaExigida,permiteEncerramentoExcepcional:form.permiteEncerramentoExcepcional,
        ...(form.periodoInicio ? { periodoInicio: form.periodoInicio } : {}),
        ...(form.periodoFim || dataUnica && form.periodoInicio ? { periodoFim: dataUnica ? form.periodoInicio : form.periodoFim } : {}),
        ...(form.periodoFim || form.periodoInicio ? { dataPrevista: dataUnica ? form.periodoInicio : (form.periodoFim || form.periodoInicio) } : {}),
        ...(form.modoRegistro === 'QUANTITATIVO' && form.metaQuantidade ? { metaQuantidade: quantidadeBRParaApi(form.metaQuantidade)! } : {}),
        ...(form.observacoes.trim() ? { observacoes: form.observacoes.trim() } : {}),
      });
      setModalCadastro(false); setSucesso('Ocorrência registrada. Configure agora atividades, evidências e execução no detalhe.'); setForm(vazio()); avisarAtualizacaoContratual();
      if(criada?.id){setDetalhe(criada);setAbaDetalhe('DETALHES');setEditando(false);}
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    if (!detalhe || !podeEditarDetalhe) return;
    setOcupado(true);
    try {
      let alterou = false;
      if (podeEditar) {
        const dados: Record<string,string|null> = {};
        if(detalhe.origem!=='RECORRENTE' && formEdicao.titulo.trim()!==detalhe.titulo){if(!formEdicao.titulo.trim())throw new Error('Informe o título.');dados.titulo=formEdicao.titulo.trim();}
        if(formEdicao.dataPrevista!==(detalhe.dataPrevista??''))dados.dataPrevista=formEdicao.dataPrevista||null;
        if (formEdicao.dataRealizada !== (detalhe.dataRealizada ?? '')) dados.dataRealizada = formEdicao.dataRealizada || null;
        if (detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null && formEdicao.quantidadeRealizada.replace(',', '.') !== (detalhe.quantidadeRealizada ?? ''))
          dados.quantidadeRealizada = formEdicao.quantidadeRealizada.replace(',', '.') || null;
        if (formEdicao.observacoes !== (detalhe.observacoes ?? '')) dados.observacoes = formEdicao.observacoes.trim() || null;
        if (Object.keys(dados).length) { await agenda.editarOcorrencia(detalhe.id,dados); alterou=true; }
      }
      if (podeEditarMeta && detalhe.metaQuantidade != null &&
          quantidadeBRParaApi(formEdicao.metaQuantidade) !== quantidadeBRParaApi(quantidadeApiParaBR(detalhe.metaQuantidade))) {
        const novaMeta = quantidadeBRParaApi(formEdicao.metaQuantidade);
        if (!novaMeta || Number(novaMeta) <= 0)
          throw new Error('Informe uma meta positiva, com até três casas decimais.');
        if (milesimosApi(novaMeta) < milesimosApi(detalhe.quantidadeRegistradaExata??detalhe.quantidadeRegistrada??detalhe.quantidadeExecutada) &&
            (justificativaMeta.trim().length < 15 || justificativaMeta.trim().length > 200))
          throw new Error('Informe uma justificativa de 15 a 200 caracteres para reduzir a meta abaixo da execução registrada.');
        await editarMetaOcorrencia(contratoId, detalhe.id, novaMeta, justificativaMeta);
        alterou = true;
      }
      if (podeEditarExigencias) {
        const alteradas = ['minimoAtividadesVerificadas','minimoEvidenciasVerificadas','minimoFotos',
          'minimoRelatorios','minimoEvidenciasLivres','evidenciaExigida','permiteEncerramentoExcepcional'].some(chave=>
          String(formEdicao[chave as keyof typeof formEdicao]) !== String((detalhe as unknown as Record<string,unknown>)[chave] ??
          (chave==='minimoFotos'||chave==='minimoRelatorios'||chave==='minimoEvidenciasLivres'?0:undefined)));
        if (alteradas) {
          await editarExigenciasOcorrencia(contratoId,detalhe.id,{
            minimoAtividadesVerificadas:formEdicao.minimoAtividadesVerificadas,
            minimoEvidenciasVerificadas:formEdicao.minimoEvidenciasVerificadas,
            minimoFotos:formEdicao.minimoFotos,minimoRelatorios:formEdicao.minimoRelatorios,
            minimoEvidenciasLivres:formEdicao.minimoEvidenciasLivres,
            evidenciaExigida:formEdicao.evidenciaExigida,
            permiteEncerramentoExcepcional:formEdicao.permiteEncerramentoExcepcional,
          });
          alterou=true;
        }
      }
      if (podeEditarPeso && detalhe.origem==='RECORRENTE' && (pesoPeriodoEdicao.trim()?Number(pesoPeriodoEdicao.replace(',','.')):null) !== (detalhe.pesoPeriodo==null?null:Number(detalhe.pesoPeriodo))) {
        await editarPesoOcorrencia(contratoId,detalhe.id,pesoPeriodoEdicao.trim()?pesoPeriodoEdicao.replace(',','.'):null);
        alterou=true;
      }
      setEditando(false); setSucesso(alterou?'Ocorrência atualizada com sucesso.':'Nenhuma alteração para salvar.');
      if(alterou) avisarAtualizacaoContratual();
      await atualizarDetalheOcorrencia();
    } catch (falha) {
      // PATCHes separados podem ter persistido antes da falha seguinte. Não
      // afirmar rollback; sincronizar o detalhe sem descartar o erro original.
      await Promise.allSettled([atualizarDetalheOcorrencia()]);
      setErro(falha instanceof Error ? `${falha.message} Confira os campos já salvos antes de tentar novamente.` : 'Não foi possível atualizar a ocorrência. Confira os campos já salvos.');
    }
    finally { setOcupado(false); }
  }
  async function transicionar(acao: 'iniciar' | 'solicitar-conclusao' | 'solicitar-conclusao-parcial' | 'concluir' | 'reabrir' | 'solicitar-encerramento' | 'aprovar-encerramento', justificativa?: string) {
    if (!detalhe || ocupado) return;
    setOcupado(true); setErro('');
    try {
      const confirmado = await agenda.transicionarOcorrencia(detalhe.id, acao, justificativa);
      if (confirmado?.id) setDetalhe(atual => atual?.id === confirmado.id ? {...atual,...confirmado} : atual);
      setSucesso('Situação da ocorrência atualizada.'); avisarAtualizacaoContratual();
      setMostrarReabertura(false); setMotivoReabertura(''); setMostrarEncerramento(false); setMotivoEncerramento('');
      await Promise.allSettled([progresso.atualizar(), agenda.consultarDetalhe(detalhe.id).then(atualizado => setDetalhe(atual => atual?.id === atualizado.id ? atualizado : atual))]);
    } catch (falha) { setErro(falha instanceof Error && (falha.name === 'AbortError' || /operation aborted/i.test(falha.message)) ? 'A comunicação foi interrompida. Atualize a ocorrência para confirmar sua situação antes de repetir a operação.' : falha instanceof Error ? falha.message : 'Não foi possível alterar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  const noCalendario = calendarioInicial !== undefined;
  const semAgendaRecorrente = agendaConfiavel && entregavelDaConsulta?.tipo === 'RECORRENTE' && serieCompleta.length === 0;
  const podeGerarSelecionado = podeAgendar && entregaveisRecorrentes.some(e => e.id === entregavelDaConsulta?.id);
  const avisoAgendaInicial = (id:string, noEspacoCalendario=false) => <div data-pi-agenda-nao-gerada className={noEspacoCalendario ? 'pi-agenda-grade pi-agenda-inicial' : 'flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-current/25 bg-current/[0.025] p-6 text-center'}>
    <IconeOcorrencias tamanho={28} />
    <h4 className="text-sm font-semibold">Agenda ainda não gerada</h4>
    {podeGerarSelecionado ? <><p className="max-w-sm text-sm text-foreground/65">Configure os requisitos para gerar as ocorrências.</p>
      <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={!planejamentoDisponivel || ocupado} onClick={e=>abrirGeracao(id,e.currentTarget)}>＋ Configurar e gerar ocorrências</button></> : <p className="text-sm text-foreground/65">Nenhuma ocorrência recorrente disponível.</p>}
  </div>;
  return <section aria-label={noCalendario ? 'Agenda do entregável' : 'Ocorrências do contrato'} data-modo-visualizacao={modoVisualizacao.toLowerCase()} data-tec09-painel-ocorrencias data-pi-painel-contextual={!noCalendario || undefined} data-pi-entregavel={contextoEntregavel || undefined} data-tec08-contexto-operacional data-tec08-estado={estadoContextual} className={somenteDetalhe || noCalendario ? 'contents' : `min-w-0 space-y-5 rounded-2xl border p-4 ${embutido ? 'sm:p-6' : 'sm:p-5'}`}>
    {noCalendario && (semAgendaRecorrente && entregavelDaConsulta ?
      <div data-pi-agenda-desktop className="pi-agenda-inicial-container">
        {avisoAgendaInicial(entregavelDaConsulta.id,true)}
      </div> : calendarioInicial)}
    {!somenteDetalhe && !noCalendario && <>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 data-pi-titulo className="flex items-center gap-2 text-lg font-bold text-foreground"><IconeOcorrencias tamanho={20} /> {contextoEntregavel ? 'Ocorrências' : 'Ocorrências do contrato'}</h3>
        <p className="text-sm text-foreground/65">{contextoEntregavel ? 'Execuções vinculadas a este entregável.' : 'Consulte os registros do contrato e filtre por entregável.'}</p>
      </div>
      <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
        {(contextoEntregavel || Boolean(entregavelFiltro)) && entregavelDaConsulta?.tipo === 'RECORRENTE' && !entregavelDaConsulta.arquivadoEm && (!calendarioExterno || serieCompleta.some(o=>o.origem==='RECORRENTE')) && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO'].includes(entregavelDaConsulta.statusExecucao ?? '') && <button type="button" disabled={!podeConfigurarSelecionado} data-pi-configurar-ocorrencias
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-current hover:text-brand-neon focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35"
          onClick={e => {
            if (!podeConfigurarSelecionado) return;
            if (entregavelDaConsulta?.tipo === 'RECORRENTE') {
              if (!podeAgendar) { setErro('Sem permissão para replanejar a agenda recorrente.'); return; }
              const selecionado = contextoEntregavel ? entregavelIdInicial : entregavelFiltro;
              if (agenda.ocorrencias.some(o => o.entregavelId === selecionado && o.origem === 'RECORRENTE' && !o.substituidaEm)) iniciarReplanejamento(selecionado,e.currentTarget);
              else abrirGeracao(selecionado,e.currentTarget);
            }
          }} aria-label="Configurar ocorrências" title={!podeConfigurarSelecionado ? 'Sem permissão para configurar as ocorrências' : entregavelDaConsulta?.tipo === 'RECORRENTE' ? 'Replanejar datas e periodicidade' : 'Editar planejamento do entregável'}>
          <IconeEngrenagem />
        </button>}
        {podeAgendar && agendaConfiavel && entregavelDaConsulta?.tipo === 'RECORRENTE' && entregaveisRecorrentes.some(e=>e.id===entregavelDaConsulta.id) && serieCompleta.some(o=>o.origem==='RECORRENTE') && <button type="button" className={BOTAO_AGENDA} onClick={e=>abrirGeracao(entregavelDaConsulta.id,e.currentTarget,true)}>Verificar / completar agenda</button>}
        {!ocultarCadastro && (!contextoEntregavel || contextoDoEntregavel?.tipo !== 'RECORRENTE') && podeCriarBase && <button type="button" disabled={!planejamentoDisponivel || !podeCriar || !podeCadastrarNesteContexto} title={!podeCriar || !podeCadastrarNesteContexto ? "É necessário entregável aberto e permissão para registrar" : "Criar ocorrência"} onClick={e => { abrirCadastro(e.currentTarget); }} data-pi-acao="primaria" className={PRINCIPAL}>＋ Nova ocorrência</button>}
      </div>
    </header>
    {somenteLeitura && <p className="text-xs text-foreground/65">Contrato somente para consulta.</p>}
    {!somenteLeitura && !podeCriarBase && <p className="text-xs text-foreground/65">Você não possui permissão para adicionar ou gerar ocorrências.</p>}
    {podeCriarBase && !planejamentoCarregado && <p role="status" className="text-xs text-foreground/65">{entregaveisConsulta.erro || etapasConsulta.erro ? "Não foi possível consultar o planejamento." : "Consultando entregáveis disponíveis..."}</p>}
    {erro && !modalCadastro && !detalhe && !confirmarGeracao && !replanejar && <p role="alert" className="rounded-lg border border-red-500/40 p-3 text-sm text-error-text">{erro}</p>}
    {!contextoEntregavel && <div className="grid gap-3 sm:grid-cols-3">
      <div data-pi-superficie className="rounded-xl border p-3"><p className="text-xs text-foreground/65">Total</p><p className="mt-1 text-2xl font-semibold text-foreground">{agendaConfiavel ? registros.length : '—'}</p></div>
      <div className="rounded-xl border border-[#65813b]/50 bg-[#556b2f]/[0.065] p-3"><p className="text-xs text-foreground/65">Em andamento</p><p className="mt-1 text-2xl font-semibold text-[#486129] dark:text-[#b8d28a]">{agendaConfiavel ? andamento : '—'}</p></div>
      <div className="rounded-xl border border-violet-400/35 bg-violet-500/[0.035] p-3"><p className="text-xs text-foreground/65">Finalizadas</p><p className="mt-1 text-2xl font-semibold text-violet-700 dark:text-violet-300">{agendaConfiavel ? concluidas + encerradas : '—'}</p><p className="mt-1 text-xs text-foreground/60">{agendaConfiavel ? `${concluidas} concluídas · ${encerradas} encerradas` : 'Conclusões e encerramentos separados'}</p></div>
    </div>}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div role="tablist" aria-label="Situação das ocorrências" className="flex max-w-full flex-wrap gap-1 rounded-xl border border-current/20 bg-background/40 p-1">
        {([['ATIVAS','Ativas'],['REVISAO','Em revisão'],['PENDENTE','Pendentes de conclusão'],['CONCLUIDAS','Finalizadas'],['ARQUIVADAS','Arquivadas']] as const).map(([chave, rotulo]) =>
          <button key={chave} type="button" role="tab" aria-selected={abaOcorrencias === chave} aria-label={rotulo} title={rotulo}
            className={`rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${abaOcorrencias === chave ? 'bg-current/15' : 'hover:bg-current/5'}`}
            onClick={() => { setAbaOcorrencias(chave); setSituacaoFiltro('TODAS'); }}>
            <span className="inline-flex items-center gap-1.5"><IconeStatus tipo={chave === 'ARQUIVADAS' ? 'arquivadas' : chave === 'REVISAO' ? 'revisao' : chave === 'PENDENTE' ? 'pendentes' : chave === 'CONCLUIDAS' ? 'concluidas' : 'ativas'}/>{chave !== 'ARQUIVADAS' && rotulo}</span>
          </button>)}
      </div>

    </div>
    <div className="flex min-w-0 items-stretch gap-2" data-pi-superficie>
      {abaOcorrencias === 'ATIVAS' && <button type="button" data-pi-acao="secundaria" className="shrink-0 rounded-xl border border-current/35 bg-current/[0.07] px-3 py-2 text-sm font-bold transition-colors hover:bg-current/15" onClick={e => { setFocoFiltros(e.currentTarget); setModalFiltros(true); }}>
        <span aria-hidden="true" className="mr-1.5">☷</span>Mais filtros{(dataInicial || dataFinal || situacaoFiltro !== 'TODAS' || etapaFiltro || (!contextoEntregavel && entregavelFiltro)) ? ' •' : ''}
      </button>}
      <CampoBuscaSugestoes valor={busca} onChange={setBusca} rotulo="Pesquisar ocorrências pelo título" placeholder="Pesquisar pelo título..." opcoes={sugestoesBusca} />
      <button type="button" className="pi-limpar-filtros" disabled={!busca&&!dataInicial&&!dataFinal&&situacaoFiltro==='TODAS'&&!etapaFiltro&&(contextoEntregavel||!entregavelFiltro)} onClick={()=>{setBusca('');setDataInicial('');setDataFinal('');setSituacaoFiltro('TODAS');if(!contextoEntregavel){setEtapaFiltro('');setEntregavelFiltro('');}}}>Limpar filtros</button>
    </div>
    {modalFiltros && <ModalEtapa camada="edicao" titulo="Mais filtros" contexto="Pesquisar ocorrências" compacto estadoContextual={estadoContextual} ocupado={false} focoRetorno={focoFiltros} onFechar={() => setModalFiltros(false)}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Combine os critérios para encontrar ocorrências. A pesquisa por texto continua disponível na lista.</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Período a partir de
            <CampoDataCivil className={`${CAMPO} max-w-full`} value={dataInicial} onChange={e => setDataInicial(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Período até
            <CampoDataCivil  className={`${CAMPO} max-w-full`} min={dataInicial || undefined} value={dataFinal} onChange={e => setDataFinal(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Situação
            <select aria-label="Filtrar situação das ocorrências" className={CAMPO_SELECT} value={situacaoFiltro} onChange={e => setSituacaoFiltro(e.target.value as typeof situacaoFiltro)}>
              <option value="TODAS">Todas</option>{abaOcorrencias === 'ATIVAS' && <><option value="NAO_INICIADO">Não iniciadas</option><option value="EM_ANDAMENTO">Em andamento</option><option value="EM_REVISAO">Em revisão</option></>}{abaOcorrencias === 'PENDENTE' && <><option value="PENDENTE_CONCLUSAO">Pendente de conclusão</option><option value="PENDENTE_CONCLUSAO_PARCIAL">Pendente de conclusão parcial</option><option value="PENDENTE_ENCERRAMENTO">Pendente de encerramento</option></>}
            </select>
          </label>
          {!contextoEntregavel && <SeletorEntregavel rotulo="Filtrar etapa das ocorrências" itens={(etapasConsulta.dados ?? []).map(et => ({ id: et.id, nome: et.nome || 'Etapa sem nome' }))} valor={etapaFiltro} onChange={id => { setEtapaFiltro(id); setEntregavelFiltro(''); }} opcaoTodos rotuloTodos="Todas as etapas" placeholder="Digite ou selecione uma etapa..." />}
          {!contextoEntregavel && <div className="min-w-0 sm:col-span-2">
            <SeletorEntregavel rotulo="Filtrar entregável das ocorrências" itens={entregaveis.filter(e => !etapaFiltro || e.etapaId === etapaFiltro)} valor={entregavelFiltro} onChange={id => { setEntregavelFiltro(id); if (entregaveis.find(item => item.id === id)?.tipo === 'RECORRENTE') setEntregavelRecorrente(id); }} opcaoTodos placeholder="Todos os entregáveis..." />
          </div>}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-current/20 pt-3">
          <button type="button" className={CANCELAR} onClick={() => { setDataInicial(''); setDataFinal(''); setSituacaoFiltro('TODAS'); if (!contextoEntregavel) { setEtapaFiltro(''); setEntregavelFiltro(''); } }}>Limpar filtros</button>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} onClick={() => setModalFiltros(false)}>Aplicar filtros</button>
        </div>
      </div>
    </ModalEtapa>}
    {sucesso && <p role="status" className="rounded-lg border border-brand-green/30 bg-brand-green/10 p-3 text-sm text-foreground">{sucesso}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3"><h4 data-pi-titulo className="text-base font-semibold">{historico ? 'Histórico arquivado' : 'Registros'}</h4><p className="text-xs text-foreground/65">{agendaConfiavel ? `${registros.length} ${registros.length === 1 ? 'ocorrência encontrada' : 'ocorrências encontradas'}` : 'Consulta indisponível'}</p></div>
    {!contratoId ? <p className="rounded-xl border border-dashed border-brand-green/20 p-6 text-sm text-foreground/65">Selecione um contrato para consultar as ocorrências.</p>
      : agenda.loading && !agenda.ocorrencias.length ? <div role="status" aria-label="Carregando ocorrências" className="min-h-[480px] space-y-3 rounded-xl border border-current/15 p-4 animate-pulse">
          <div className="h-10 w-1/2 rounded-lg bg-foreground/10" />
          <div className="grid grid-cols-7 gap-2">{Array.from({length: 28},(_,i) =>
            <div key={i} className="h-16 rounded-lg bg-foreground/5" />)}</div>
        </div>
      : agenda.erro ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 p-4 text-sm text-error-text"><span>{agenda.erro}</span><button type="button" className={BOTAO} onClick={() => { void agenda.atualizar(); }}>Tentar novamente</button></div>
      : !calendarioExterno && semAgendaRecorrente && entregavelDaConsulta && podeGerarSelecionado ? avisoAgendaInicial(entregavelDaConsulta.id)
      : modoVisualizacao === 'CALENDARIO' ? <>
          <ProgressoSerieRecorrente registros={serieCompleta} inicio={entregavelDaConsulta?.inicioPrevisto??null} fim={entregavelDaConsulta?.terminoPrevisto??null} resumoFisico={resumoFisicoSerie}/>
          <CalendarioOcorrencias key={entregavelDaConsulta?.id} registros={calendarioCompleto} registrosVisiveis={registros} periodicidade={entregavelDaConsulta?.periodicidade ?? 'DIARIA'} resumoCompleto={resumoFisicoSerie?.percentualExecucao === 100} aoAbrir={abrirDetalhe} />
        </>
      : registros.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed border-current/25 p-6 text-sm text-foreground/65">{historico ? 'Nenhuma ocorrência arquivada neste entregável ou contrato.' : 'Nenhuma ocorrência nesta situação corresponde aos filtros.'}</p>
      : <ul aria-label="Lista de ocorrências" className="grid gap-3">{registros.map(o => {
        const visual = estadoTemporal(o.status, o.periodoInicio || o.dataPrevista);
        const cor = o.substituidaEm ? {titulo:'Arquivada',borda:'border-amber-500/40',fundo:'bg-amber-500/[0.11]',texto:'text-amber-600 dark:text-amber-300',badge:'bg-amber-500/10'} : ESTADOS[visual] ?? ESTADOS.NAO_INICIADO;
        return <li key={o.id} data-ocorrencia-estado={estadoTemporal(o.status, o.periodoInicio || o.dataPrevista)} className="relative min-w-0"><button type="button" aria-label={`Ver detalhes da ocorrência ${tituloApresentacao(o, periodos[o.entregavelId])}`} onClick={e => abrirDetalhe(o, e.currentTarget)}
          className={`pi-card-ocorrencia-v18 pi-ocorrencia-card group w-full min-w-0 space-y-3 rounded-xl border p-4 text-left outline-none transition-colors duration-200 hover:brightness-100 focus-visible:ring-2 focus-visible:ring-current/45 sm:p-5 ${cor.borda} ${cor.fundo} ${cor.texto}`}>
          <span className="pi-ocorrencia-titulo-v19 flex min-w-0 flex-wrap items-center gap-2"><span className="min-w-0 truncate font-semibold" title={tituloApresentacao(o, periodos[o.entregavelId])}>{tituloApresentacao(o, periodos[o.entregavelId])}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cor.borda} ${cor.badge} ${cor.texto}`}>{cor.titulo}</span></span>
          <span className="pi-ocorrencia-meta-v19 flex flex-wrap items-center gap-2 text-sm text-foreground/75">
            {(o.periodoInicio || o.dataPrevista) && <time dateTime={o.periodoInicio || o.dataPrevista || ''}>
              {dataBR(o.periodoInicio || o.dataPrevista)}{o.periodoFim && o.periodoFim !== o.periodoInicio ? ` – ${dataBR(o.periodoFim)}` : ''}
            </time>}
            {o.modoRegistro === 'QUANTITATIVO' && o.metaQuantidade != null && <strong className="text-base tabular-nums">{quantidadeApiParaBR(o.metaQuantidade)} {unidades[o.entregavelId] || 'unidades'}</strong>}
            <EtiquetaAtraso atrasado={o.atrasado} finalizadoComAtraso={o.finalizadoComAtraso} feminino/><PesoOcorrencia ocorrencia={o}/>
          </span><MetricasCartaoOcorrencia ocorrencia={o}/>
        </button>

        </li>;
      })}</ul>}
    </>}
    {somenteDetalhe && abrirOcorrenciaId && !detalhe && <ModalEtapa titulo={falhaAbertura?'Ocorrência indisponível':'Consultar ocorrência'} contexto="Ocorrência" larguraFormulario="registro" ocupado={false} onFechar={()=>{versaoDetalhe.current++;aoFecharOcorrenciaSelecionada?.();}}>{falhaAbertura?<p role="alert" className="text-sm text-error-text">{falhaAbertura}</p>:<p role="status" className="text-sm">Consultando os detalhes da ocorrência.</p>}</ModalEtapa>}
    {alertaElegibilidade && <ModalEtapa titulo="Nova ocorrência" estreito camada="edicao" contexto="Condições para o cadastro" estadoContextual={estadoAcaoEntregavel} onFechar={() => {setAlertaElegibilidade(false);aoFecharCadastro?.();}} ocupado={false}>
      <p className="text-sm text-foreground/80">{!podeCriarBase ? 'Você não possui a permissão Cadastrar ocorrências neste contrato.' : contextoEntregavel && contextoDoEntregavel?.tipo === 'RECORRENTE' ? 'Este entregável usa agenda recorrente. Gere ou replaneje os períodos pelo botão da agenda.' : 'Para cadastrar, o entregável precisa estar ativo, com etapa aberta e modalidade compatível. Confira o planejamento antes de continuar.'}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {contextoEntregavel && podeEditarPlanejamento && contextoDoEntregavel && <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={e => {setAlertaElegibilidade(false); setPlanejamento({ id: entregavelIdInicial, editar: true, foco: e.currentTarget });}}>Editar planejamento</button>}
        <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={() => setAlertaElegibilidade(false)}>Entendi</button>
      </div>
    </ModalEtapa>}
    {confirmarGeracao && createPortal(<ModalEtapa camada="edicao" titulo={recuperarAgenda ? "Completar agenda recorrente" : "Gerar ocorrências recorrentes"} cabecalhoUmaLinha larguraFormulario="ocorrencia" neutro contexto="Agenda recorrente" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { if (!ocupado) setConfirmarGeracao(false); }}>
      <div className="pi-form-geracao-recorrente space-y-4">
        {recuperarAgenda && <p className="text-sm text-foreground/75">Somente os períodos faltantes serão gerados. Os registros existentes serão preservados.</p>}
        <dl className="pi-geracao-planejamento">
          <div className="pi-geracao-identificacao"><dt>Entregável</dt><dd>{recorrenteSelecionado?.nome ?? 'Não informado'}</dd></div>
          <div><dt>Início previsto</dt><dd>{dataBR(recorrenteSelecionado?.inicioPrevisto)}</dd></div>
          <div><dt>Término previsto</dt><dd>{dataBR(recorrenteSelecionado?.terminoPrevisto)}</dd></div>
          <div><dt>Periodicidade</dt><dd>{recorrenteSelecionado?.periodicidade ? ROTULOS_PERIODICIDADE[recorrenteSelecionado.periodicidade] : 'Não informada'}</dd></div>
          {planejamentoCompleto && <div><dt>Modalidade de execução</dt><dd>{modoRecorrente==='QUANTITATIVO'?'Quantitativa':'Descritiva'}</dd></div>}
        </dl>
        {planejamentoCompleto && !recuperarAgenda && modoRecorrente==='QUANTITATIVO' && <div className="pi-geracao-meta">
          <label className="block min-w-0 text-sm font-semibold">Meta por período *
            <input type="text" inputMode="decimal" className={CAMPO} maxLength={23} disabled={!podeEditarMeta || ocupado} value={metaRecorrente} onChange={e=>setMetaRecorrente(e.target.value)} placeholder="Ex.: 20" />
          </label>
          <div className="pi-geracao-unidade"><span className="block text-xs text-foreground/65">Unidade de medida</span><strong className="block break-words text-sm">{recorrenteSelecionado?.unidadeMedida || 'Não informada'}</strong></div>
        </div>}
        {planejamentoCompleto && !recuperarAgenda && (podeEditarExigencias ? <fieldset disabled={ocupado}><FormularioRequisitosOcorrencia valor={requisitosGeracao} onChange={setRequisitosGeracao} compacto /></fieldset> : <p role="status" className="text-sm">Serão usados os requisitos padrão do servidor: uma atividade verificada, sem evidência obrigatória adicional. Alterá-los exige permissão específica.</p>)}
        {!recuperarAgenda && modoRecorrente==='QUANTITATIVO' && !podeEditarMeta && <p role="status" className="text-sm">Solicite a um usuário com permissão para definir metas a geração quantitativa inicial.</p>}
        {(erro || !planejamentoCompleto) && <div role={erro ? 'alert' : 'status'} className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="text-foreground/85">{erro || 'Antes de gerar, defina o período, a periodicidade e a modalidade no planejamento do entregável.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: false, foco: e.currentTarget })}>Abrir entregável</button>
            {!recuperarAgenda && podeEditarPlanejamento && <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: true, foco: e.currentTarget })}>Editar planejamento</button>}
          </div>
        </div>}
        <div className="pi-rodape-formulario flex flex-wrap justify-end gap-2 border-t border-current/15 pt-3">
          <button type="button" data-pi-acao="secundaria" className={BOTAO_AGENDA} disabled={ocupado} onClick={() => { setConfirmarGeracao(false); setErro(''); }}>Cancelar</button>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={ocupado || !planejamentoCompleto || (!recuperarAgenda && modoRecorrente==='QUANTITATIVO' && (!podeEditarMeta || !(Number(quantidadeBRParaApi(metaRecorrente) ?? 0)>0)))} onClick={() => void gerarRecorrencias()}>{ocupado ? 'Gerando...' : recuperarAgenda ? 'Confirmar recuperação' : 'Confirmar geração'}</button>
        </div>
      </div>
    </ModalEtapa>, document.body)}
    {replanejar && <ModalEtapa camada="edicao" larguraFormulario="ocorrencia" titulo="Replanejar ocorrências" formularioHorizontal contexto="Agenda recorrente" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={()=>{setReplanejar(false);setImpacto(null);setErro('');}}>
      <form data-pi-formulario className="space-y-4" onSubmit={e=>{e.preventDefault();void calcularImpacto(false);}}>
        <p className="text-xs text-foreground/70">Ajuste a agenda e os parâmetros dos novos períodos. Registros existentes mantêm suas próprias metas e histórico.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Início das ocorrências<CampoDataCivil required disabled={ocupado}  className={CAMPO} value={plano.inicioFuturo} onChange={e=>{setPlano(p=>({...p,inicioFuturo:e.target.value}));setImpacto(null);}} /></label>
          <label className="block text-sm">Término da obrigação<CampoDataCivil required disabled={ocupado || !podeEditarPlanejamento}  className={CAMPO} value={plano.terminoPrevisto} onChange={e=>{setPlano(p=>({...p,terminoPrevisto:e.target.value}));setImpacto(null);}} /></label>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm">Periodicidade
            <select disabled={ocupado} className={CAMPO_SELECT} value={plano.periodicidade} onChange={e=>{setPlano(p=>({...p,periodicidade:e.target.value}));setImpacto(null);}}>{['DIARIA','SEMANAL','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL'].map(v=><option key={v} value={v}>{({DIARIA:'Diária',SEMANAL:'Semanal',MENSAL:'Mensal',TRIMESTRAL:'Trimestral',SEMESTRAL:'Semestral',ANUAL:'Anual'} as Record<string,string>)[v]}</option>)}</select>
          </label>
          <label className="block min-w-0 text-sm">Unidade de medida
            <input className={CAMPO} maxLength={80} readOnly value={unidadeReplanejamento}
              placeholder="Definida no entregável" />
          </label>
          <label className="block min-w-0 text-sm">Medição de novos períodos
            <input className={CAMPO} readOnly value={modoNovoPeriodo === 'QUANTITATIVO' ? 'Quantitativa' : 'Descritiva'} />
          </label>
          {modoNovoPeriodo === 'QUANTITATIVO' && <div className="space-y-2 sm:col-span-2">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={informarMetaNova} disabled={ocupado || !podeEditarMeta} onChange={e=>{setInformarMetaNova(e.target.checked);setImpacto(null);}}/> Informar explicitamente a meta dos novos períodos</label>
            <label className="block min-w-0 text-sm">Meta prevista por nova ocorrência
            <input inputMode="decimal" className={CAMPO} disabled={ocupado || !podeEditarMeta || !informarMetaNova} maxLength={23} value={metaNovoPeriodo}
              onChange={e=>{setMetaNovoPeriodo(e.target.value);setImpacto(null);}} placeholder="Ex.: 20" />
          </label><p className="text-xs text-foreground/65">Sem alteração explícita, a meta é herdada da série se for homogênea.</p></div>}
        </div>
        {erro && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-error-text">{erro}</p>}
        {impacto && <section data-pi-superficie aria-label="Prévia do replanejamento" className="space-y-3 rounded-xl border p-3 text-sm">
          <h3 data-pi-titulo className="font-semibold">Prévia da alteração</h3>
          {impacto.prazoAlterado && impacto.prazoAlterado.anterior !== impacto.prazoAlterado.novo && <p role="status" className="rounded-lg border border-amber-500/40 p-2">Alteração formal do término da obrigação: {dataBR(impacto.prazoAlterado.anterior)} → {dataBR(impacto.prazoAlterado.novo)}. O prazo do entregável também será atualizado.</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Mantidas</span><strong>{impacto.preservadas}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Serão arquivadas</span><strong>{impacto.substituir.length}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Novas</span><strong>{impacto.novas.length}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Reativadas</span><strong>{impacto.reativar}</strong></div>
          </div>
          <p className="text-xs text-foreground/70">Ocorrências concluídas preservam suas datas e pesos. Períodos já iniciados, com execução, vínculos ou comprovantes não podem ser substituídos sem conciliação. Somente períodos futuros livres poderão ser arquivados. A confirmação mantém o histórico.</p>
          {impacto.novas.some(o => o.pesoPeriodo != null) && <p role="status" className="rounded-lg border border-amber-500/40 p-2 text-xs">
            <strong>Redistribuição de pesos:</strong> os pesos dos períodos preservados não mudam; o saldo disponível é dividido entre os {impacto.novas.length} períodos novos, com quatro casas decimais. Revise os pesos abaixo antes de confirmar.
          </p>}
          {impacto.modoRegistro==='QUANTITATIVO' && impacto.metaQuantidade != null && <p className="text-xs">Meta dos novos períodos: <strong>{quantidadeApiParaBR(impacto.metaQuantidade)} {unidadeReplanejamento}</strong></p>}
          {impacto.criteriosHerdados && <p className="rounded-lg border border-current/20 p-2 text-xs" role="status">
            <strong>Exigências herdadas nos novos períodos:</strong> {impacto.criteriosHerdados.minimoAtividadesVerificadas} atividade(s) verificadas,
            {' '}{impacto.criteriosHerdados.minimoFotos ?? 0} foto(s), {impacto.criteriosHerdados.minimoRelatorios ?? 0} relatório(s)
            e {impacto.criteriosHerdados.minimoEvidenciasLivres ?? 0} evidência(s) livre(s).
            {' '}Formato: {impacto.criteriosHerdados.evidenciaExigida}; mínimo total: {impacto.criteriosHerdados.minimoEvidenciasVerificadas}.
          </p>}
          {impacto.substituir.some(o => o.possuiAtividades) && <p className="rounded-lg border border-amber-500/40 p-2 text-xs" role="status">
            Atenção: há ocorrências que serão substituídas com atividades vinculadas. Os vínculos e as medições permanecem no histórico e não migram automaticamente para os novos períodos.
          </p>}
          {(impacto.substituir.length > 0 || impacto.novas.length > 0) && <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
            {[...impacto.substituir].sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(o=><li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 px-3 py-2"><span>{o.possuiAtividades ? 'Será arquivada · contém atividades' : 'Será arquivada'}</span><time>{dataBR(o.inicio)}{o.inicio===o.fim?'':` — ${dataBR(o.fim)}`}</time></li>)}
            {[...impacto.novas].sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(o=><li key={`${o.inicio}:${o.fim}`} className="flex items-center justify-between gap-3 rounded-lg border border-current/20 px-3 py-2"><span>Novo período{o.pesoPeriodo != null ? ` · peso ${o.pesoPeriodo}%` : ''}</span><time>{dataBR(o.inicio)}{o.inicio===o.fim?'':` — ${dataBR(o.fim)}`}</time></li>)}
          </ul>}
        </section>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-current/20 pt-3">
          <button type="button" className={CANCELAR} disabled={ocupado} onClick={() => {setReplanejar(false);setImpacto(null);setErro('');}}>Cancelar</button>
          <button type="submit" data-pi-acao="contextual" disabled={ocupado} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 disabled:opacity-50">Analisar alterações</button>
          {impacto && <button type="button" data-pi-acao="primaria" disabled={ocupado} className={PRINCIPAL} onClick={()=>void calcularImpacto(true)}>Confirmar replanejamento</button>}
        </div>
      </form>
    </ModalEtapa>}
    {modalCadastro && <ModalEtapa titulo={navegacaoCadastro?"Novo registro":"Nova ocorrência"} navegacaoCadastro={navegacaoCadastro} alturaEstavel cabecalhoUmaLinha larguraFormulario="atividade" larguraAmpla compacto camada="edicao" estadoContextual={estadoAcaoEntregavel} contexto={contextoEntregavel ? `Entregável: ${nomes[entregavelIdInicial] ?? 'selecionado'}` : "Ocorrências do contrato"} rotuloFechar="Fechar cadastro de ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setModalCadastro(false); setErro(''); aoFecharCadastro?.(); }}>
      <form data-pi-formulario onSubmit={salvar} className="pi-form-ocorrencia min-w-0 space-y-3">
        {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
        {!contextoEntregavel && <SeletorEntregavel rotulo="Entregável *" itens={entregaveisDoFormulario} valor={form.entregavelId} onChange={id => setForm(v => ({ ...v, entregavelId: id, modoRegistro: entregaveis.find(e => e.id === id)?.tipo === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO', metaQuantidade: '' }))} placeholder="Digite ou selecione o entregável..." />}
        {form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null && <div className="space-y-3 rounded-xl border border-amber-500/35 bg-amber-500/[0.06] p-4" role="status">
          <h4 className="font-semibold text-foreground">Conciliação necessária</h4>
          <p className="text-sm text-foreground/80">Este entregável já possui <strong>{quantidadeDireta}</strong> de quantidade realizada informada diretamente. Para registrar por ocorrências, primeiro escolha esta modalidade. A quantidade anterior ficará registrada na auditoria e não será somada novamente.</p>
          {!confirmarConcilicacao ? <button type="button" className={BOTAO} disabled={ocupado || !podeEditar} onClick={() => setConfirmarConciliacao(true)}>Passar a registrar por ocorrências</button> : <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={BOTAO} disabled={ocupado} onClick={() => setConfirmarConciliacao(false)}>Voltar</button>
            <button type="button" className={PRINCIPAL} disabled={ocupado || !podeEditar} onClick={() => {
              if (!form.entregavelId || !podeEditar) return;
              setOcupado(true); setErro('');
              void progresso.usarOcorrencias(form.entregavelId).then(() => {
                setConfirmarConciliacao(false); setSucesso('Fonte alterada. Cadastre agora a primeira ocorrência.');
              }).catch((falha: unknown) => setErro(falha instanceof Error ? falha.message : 'Falha na conciliação.'))
                .finally(() => setOcupado(false));
            }}>Confirmar conciliação</button>
          </div>}
          {!podeEditar && <p className="text-xs">A conciliação requer permissão de editar entregáveis neste contrato.</p>}
        </div>}
        {form.entregavelId && <p role="note" className="text-xs text-foreground/70">{tipoCadastroSelecionado === 'QUANTITATIVO' ? 'Informe a meta planejada. Registre a execução depois de criar a ocorrência.' : 'Registro descritivo. Descreva o serviço e vincule as atividades realizadas.'}</p>}
        <div className="pi-form-colunas"><section className="min-w-0 space-y-3">
        <div className={`grid items-start gap-3 ${form.modoRegistro==='QUANTITATIVO'?'sm:grid-cols-2':''}`}><label className="block min-w-0 text-sm font-medium">Título *<input className={CAMPO} required maxLength={50} placeholder="Ex.: Manutenção do laboratório A" value={form.titulo} onChange={e => setForm(v => ({ ...v, titulo: e.target.value }))}/><span className="block text-right text-[11px] text-foreground/60">{form.titulo.length}/50</span></label>
        {form.modoRegistro === 'QUANTITATIVO' && <label className="block text-sm font-medium">Meta prevista{unidades[form.entregavelId] ? ` (${unidades[form.entregavelId]})` : ' (quantidade)'} *
          <input type="text" inputMode="decimal" maxLength={23} required className={CAMPO} value={form.metaQuantidade} onChange={e => setForm(v => ({ ...v, metaQuantidade: e.target.value }))} placeholder="Ex.: 20" />
        </label>}{form.modoRegistro==='QUANTITATIVO'&&<ParticipacaoOcorrencia key={form.entregavelId} total={metaTotal(form.entregavelId)} outras={metasOutras(form.entregavelId)} meta={form.metaQuantidade} onMeta={metaQuantidade=>setForm(v=>({...v,metaQuantidade}))} disabled={!agendaConfiavel}/>}</div>
        <fieldset className="space-y-2 border-t border-current/15 pt-2">
          <legend className="px-1 text-sm font-semibold">Período da ocorrência (opcional)</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-green" checked={dataUnica} onChange={e => setDataUnica(e.target.checked)}/> Ocorrência prevista para um único dia</label>
          <div className="flex flex-wrap items-start gap-4">
            <label className="block text-sm">{dataUnica ? 'Data prevista' : 'Início previsto'}<CampoDataCivil  className={`${CAMPO} tec08-data-hora max-w-[12rem]`} value={form.periodoInicio} onChange={e => setForm(v => ({ ...v, periodoInicio: e.target.value }))}/></label>
            {!dataUnica && <label className="block text-sm">Término previsto<CampoDataCivil  min={form.periodoInicio || undefined} className={`${CAMPO} tec08-data-hora max-w-[12rem]`} value={form.periodoFim} onChange={e => setForm(v => ({ ...v, periodoFim: e.target.value }))}/></label>}
          </div>
        </fieldset>
        </section><section className="min-w-0 space-y-3">
        <FormularioRequisitosOcorrencia compacto valor={form} onChange={novo=>setForm(anterior=>({...anterior,...novo}))} />
        <label className="block text-sm">Observações<textarea rows={2} maxLength={200} placeholder="Descreva brevemente a ocorrência." className={CAMPO} value={form.observacoes} onChange={e => setForm(v => ({ ...v, observacoes: e.target.value }))}/></label><span className="block text-right text-[11px] text-foreground/60">{form.observacoes.length}/200</span>
        </section></div>
        <div className="pi-rodape-formulario flex flex-wrap justify-end gap-2 border-t border-current/15 pt-3"><button data-pi-acao="secundaria" type="button" className={BOTAO} disabled={ocupado} onClick={() => { setModalCadastro(false); setErro(''); aoFecharCadastro?.(); }}>Cancelar</button>
          <button data-pi-acao="primaria" type="submit" className={PRINCIPAL} disabled={!podeCriar || ocupado || (form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null) || !form.titulo.trim() || !form.entregavelId || (form.modoRegistro === 'QUANTITATIVO' && Number(quantidadeBRParaApi(form.metaQuantidade) ?? 0) <= 0)}>{ocupado ? 'Salvando...' : navegacaoCadastro ? 'Cadastrar' : 'Registrar ocorrência'}</button></div>
      </form>
    </ModalEtapa>}
    {detalhe && <ModalEtapa titulo={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])} camada={editando?"edicao":"evidencia"} larguraFormulario={editando?"registro":undefined} larguraAmpla alturaEstavel cabecalhoUmaLinha etiquetaNoContexto compacto etiqueta={detalhe.substituidaEm ? 'Arquivada' : (ESTADOS[estadoTemporal(detalhe.status, detalhe.periodoInicio || detalhe.dataPrevista)] ?? ESTADOS.NAO_INICIADO).titulo} contexto="Detalhes da ocorrência" atrasado={detalhe.atrasado} finalizadoComAtraso={detalhe.finalizadoComAtraso} rotuloFechar="Fechar detalhes da ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { versaoDetalhe.current++; setDetalhe(null); setEditando(false); setMostrarReabertura(false); setErro(''); aoFecharOcorrenciaSelecionada?.(); aoFecharCadastro?.(); }} estadoContextual={estadoDoObjeto({objeto:'ocorrencia', status:estadoTemporal(detalhe.status, detalhe.periodoInicio || detalhe.dataPrevista), arquivado:Boolean(detalhe.substituidaEm)})}
      somenteIconeFechar
      acoes={<>
      {!editando && podeEditarDetalhe && <BotaoEditarModal rotulo="Editar ocorrência" disabled={ocupado} onClick={() => {
        setFormEdicao({status:detalhe.status,titulo:detalhe.titulo,dataPrevista:detalhe.dataPrevista??'',dataRealizada:detalhe.dataRealizada??'',quantidadeRealizada:detalhe.quantidadeRealizada??'',metaQuantidade:quantidadeApiParaBR(detalhe.metaQuantidade),observacoes:detalhe.observacoes??'',...requisitosDe(detalhe)});
        setPesoPeriodoEdicao(detalhe.pesoPeriodo==null?'':Number(detalhe.pesoPeriodo).toFixed(2).replace('.',','));setJustificativaMeta('');setErro('');setEditando(true);
      }} />}
      {!editando && !detalhe.substituidaEm && detalhe.status === 'NAO_INICIADO' && podeEditar &&
        <button type="button" disabled={ocupado} onClick={() => void transicionar('iniciar')}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-lime-500/50 bg-lime-500/10 px-3 py-2 text-xs font-semibold text-lime-700 transition-colors hover:bg-lime-500/20 dark:text-lime-200 disabled:opacity-45">
          <span aria-hidden="true">▶</span> Iniciar ocorrência
        </button>}
      {!editando && podeSolicitarRegularizacao && !detalhe.regularizacaoDocumentalSolicitada && <BotaoAcaoModal intencao="solicitar-conclusao" disabled={ocupado || !podeSolicitarConclusao} onClick={() => void transicionar('solicitar-conclusao')}>Solicitar regularização documental</BotaoAcaoModal>}
      {!editando && !detalhe.substituidaEm && podeReabrir && !detalhe.regularizacaoDocumentalSolicitada && ['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA'].includes(detalhe.status) &&
        <MenuAcoesObjeto rotulo="Reabrir" disabled={ocupado} acaoDireta={() => {setFocoReabertura(null);setMotivoReabertura('');setMostrarReabertura(true);}} />}
      {!editando && !detalhe.substituidaEm && podeEditar && abertos.some(e=>e.id===detalhe.entregavelId) && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && <MenuAcoesObjeto rotulo="Fechar" disabled={ocupado} icone={podeSolicitarConclusao?<IconeConclusao className="h-4 w-4 text-violet-400"/>:podeSolicitarParcial?<IconeConclusaoParcial className="h-4 w-4 text-violet-400"/>:undefined}>
          <BotaoAcaoModal intencao="solicitar-conclusao" disabled={ocupado || !podeSolicitarConclusao}
            title={semAtividadeVerificada ? 'Os requisitos configurados precisam estar atendidos para solicitar aprovação.' : undefined}
            onClick={() => void transicionar('solicitar-conclusao')}>Solicitar conclusão</BotaoAcaoModal>
          <BotaoAcaoModal intencao="solicitar-conclusao" conclusaoParcial disabled={ocupado || !podeSolicitarParcial}
            onClick={() => void transicionar('solicitar-conclusao-parcial')}>Solicitar conclusão parcial</BotaoAcaoModal>
          <BotaoAcaoModal intencao="solicitar-encerramento" disabled={ocupado || podeSolicitarConclusao || podeSolicitarParcial || haExecucaoPendente || !(detalhe.permiteEncerramentoExcepcional??true)}
            title={podeSolicitarConclusao ? 'A conclusão está disponível; o encerramento está desabilitado.' : haExecucaoPendente ? 'Resolva as atividades e contribuições pendentes ou em revisão antes de solicitar encerramento.' : !detalhe.permiteEncerramentoExcepcional ? 'Encerramento excepcional desabilitado nesta ocorrência.' : undefined}
            onClick={() => { setMotivoEncerramento(''); setMostrarEncerramento(true); }}>Solicitar encerramento</BotaoAcaoModal>
        </MenuAcoesObjeto>}
      {!editando && (detalhe.regularizacaoDocumentalSolicitada || ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(detalhe.status)) && <>
        {(podeReabrir || podeCancelarRegularizacao) && <button type="button" className="rounded-lg border border-red-500/50 bg-red-600/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-600/25 disabled:opacity-40" disabled={ocupado} onClick={e => { setFocoReabertura(e.currentTarget); setMotivoReabertura(''); setMostrarReabertura(true); }} title="Cancelar a solicitação e devolver à revisão">✕ Cancelar</button>}
        {(podeConcluir || podeDecidirRegularizacao) && <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 ${detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'border-green-600 bg-green-700' : 'border-green-600 bg-green-700'}`} disabled={ocupado} onClick={() => void transicionar(detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'aprovar-encerramento' : 'concluir')}>✓ Aprovar</button>}
      </>}
    </>}>
      {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
      {!editando ? <div className="pi-ocorrencia-workspace" key={detalhe.id}>
        <div className="pi-ocorrencia-conteudo min-w-0">
          <div role="tablist" aria-label="Seções da ocorrência" className="pi-ocorrencia-abas">
            {([['DETALHES','Manual'],['ATIVIDADES','Atividades'],['EVIDENCIAS','Evidências'],['HISTORICO','Histórico']] as const).filter(([id])=>id!=='HISTORICO'||podeConsultarHistorico).map(([id,rotulo])=><button key={id} role="tab" type="button" aria-selected={abaDetalhe===id} onClick={()=>setAbaDetalhe(id)}>{id==='DETALHES'&&<span aria-hidden="true">✎ </span>}{rotulo}</button>)}
          </div>
          <div hidden={abaDetalhe!=='DETALHES'} className="min-w-0">
            <ExecucaoOcorrencia key={`${contratoId}:${detalhe.id}`} usuarioId={perfil?.id} contratoId={contratoId} ocorrencia={detalhe} unidade={unidades[detalhe.entregavelId]||'unidades'} podeRegistrar={podeRegistrarMedicao&&abertos.some(e=>e.id===detalhe.entregavelId)} podeCorrigir={podeCorrigirMedicao&&abertos.some(e=>e.id===detalhe.entregavelId)} podeBloquear={podeBloquearMedicao&&abertos.some(e=>e.id===detalhe.entregavelId)} podeExcluir={podeExcluirMedicao&&abertos.some(e=>e.id===detalhe.entregavelId)} podeAprovar={permitir('aprovarExecucaoManual')&&abertos.some(e=>e.id===detalhe.entregavelId)} onAtualizar={atualizarDetalheOcorrencia}/>
          </div>
          {abaDetalhe==='ATIVIDADES' && <section className="pi-lista-vinculos-v18 space-y-3" aria-label="Atividades vinculadas à ocorrência">

                <div>{detalhe.atividades ? detalhe.atividades.length ? <ul className="mt-2 space-y-2">{detalhe.atividades.map(a=><li key={a.id}><button type="button" className="pi-card-vinculo-v18 flex w-full min-w-0 items-center gap-3 rounded-lg border p-3 text-left text-sm" onClick={e => abrirAtividade(a.id, e.currentTarget)}><span className="pi-diario-icone" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/></svg></span><span className="min-w-0 flex-1"><strong className="block truncate font-semibold" title={a.titulo}>{a.titulo}</strong></span><span className="pi-diario-etiqueta shrink-0" data-situacao={a.status}>{a.status === 'VERIFICADA' ? 'Verificada' : a.status === 'ARQUIVADA' ? 'Arquivada' : a.status === 'PENDENTE_CONCLUSAO' ? 'Pendente de conclusão' : 'Registrada'}</span><span aria-hidden="true" className="text-foreground/60">›</span></button></li>)}</ul> : <p>Nenhuma atividade vinculada.</p> : <p>Consulta de vínculos indisponível ou em carregamento.</p>}</div>
      </section>}
          <div hidden={abaDetalhe!=='EVIDENCIAS'}><EvidenciasOcorrencia contratoId={contratoId} ocorrencia={detalhe} podeVincular={podeVincularEvidencia} ativa={abaDetalhe==='EVIDENCIAS'} onAtualizar={atualizarDetalheOcorrencia}/></div>
          {abaDetalhe==='HISTORICO' && podeConsultarHistorico && <HistoricoOcorrencia contratoId={contratoId} ocorrenciaId={detalhe.id}/>}
          {abaDetalhe==='ATIVIDADES' && <button type="button" className="pi-ocorrencia-vincular" aria-label="Vincular atividade à ocorrência" disabled={ocupado||!podeVincularAtividade} onClick={abrirVinculo}>+ Vincular atividade</button>}
        </div>
        <ResumoLateralOcorrencia ocorrencia={detalhe} unidade={unidades[detalhe.entregavelId]||'unidades'} entregavel={nomes[detalhe.entregavelId]??'Entregável'} periodo={descricaoPeriodo(detalhe,periodos[detalhe.entregavelId])} />
      </div> : <form data-pi-formulario className="pi-form-edicao-ocorrencia pi-form-revisao-ocorrencia" onSubmit={salvarEdicao}>

        <div className="pi-ocorrencia-dados">
          {detalhe.origem!=='RECORRENTE'&&<label className="block min-w-0 text-sm">Título<input maxLength={50} required disabled={!podeEditar} className={CAMPO} value={formEdicao.titulo} onChange={e=>setFormEdicao(v=>({...v,titulo:e.target.value}))}/></label>}
          <label className="block min-w-0 text-sm">Prazo previsto<CampoDataCivil disabled={!podeEditar} className={CAMPO} value={formEdicao.dataPrevista} onChange={e=>setFormEdicao(v=>({...v,dataPrevista:e.target.value}))}/></label>
          <label className="block min-w-0 text-sm">Data realizada<CampoDataCivil  disabled={!podeEditar} className={`${CAMPO} tec08-data-hora [color-scheme:light] dark:[color-scheme:dark]`} value={formEdicao.dataRealizada} max={diaLocalBrasil()} onChange={e => setFormEdicao(v => ({ ...v, dataRealizada: e.target.value }))}/></label>
        {detalhe.metaQuantidade != null && <label className="block text-sm">Meta planejada desta ocorrência
          <input type="text" inputMode="decimal" maxLength={23} disabled={!podeEditarMeta} className={CAMPO} value={formEdicao.metaQuantidade} onChange={e => setFormEdicao(v=>({...v,metaQuantidade:e.target.value}))}/>

        </label>}
        {detalhe.origem==='MANUAL_QUANTITATIVA'&&detalhe.metaQuantidade!=null&&<ParticipacaoOcorrencia key={detalhe.id} total={metaTotal(detalhe.entregavelId)} outras={metasOutras(detalhe.entregavelId,detalhe.id)} meta={formEdicao.metaQuantidade} onMeta={metaQuantidade=>setFormEdicao(v=>({...v,metaQuantidade}))} disabled={!podeEditarMeta||!agendaConfiavel}/>}
        {detalhe.origem==='RECORRENTE' && <label className="block text-sm">Peso deste período (%)
          <CampoPercentual decimalBR disabled={!podeEditarPeso} valor={pesoPeriodoEdicao} onValor={setPesoPeriodoEdicao} placeholder="Igual" className={CAMPO}/><span className="block text-xs text-foreground/65">Disponível: {Math.max(0,100-agenda.ocorrencias.filter(o=>o.entregavelId===detalhe.entregavelId&&o.id!==detalhe.id&&!o.substituidaEm).reduce((a,o)=>a+Number(o.pesoPeriodo??0),0)-Number(pesoPeriodoEdicao.replace(',','.')||0)).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</span>
        </label>}
        </div>
        {detalhe.metaQuantidade != null && podeEditarMeta &&
          milesimosApi(quantidadeBRParaApi(formEdicao.metaQuantidade)) < milesimosApi(detalhe.quantidadeRegistradaExata??detalhe.quantidadeRegistrada??detalhe.quantidadeExecutada) &&
          <label className="block min-w-0 text-sm">Justificativa para reduzir a meta abaixo do executado
            <textarea className={CAMPO} value={justificativaMeta} minLength={15} maxLength={200} rows={2}
              onChange={e=>setJustificativaMeta(e.target.value)} placeholder="Explique o replanejamento e preserve o excedente registrado" required/>
            <span className="block text-right text-xs text-foreground/60">{justificativaMeta.length}/200</span>
          </label>}
        {detalhe.origem === 'MANUAL_QUANTITATIVA' && detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null && <label className="block text-sm">Quantidade realizada<input type="text" inputMode="decimal" maxLength={18} disabled={!podeEditar} className={CAMPO} value={formEdicao.quantidadeRealizada} onChange={e => setFormEdicao(v => ({ ...v, quantidadeRealizada: e.target.value }))}/></label>}
        {podeEditarExigencias?<FormularioRequisitosOcorrencia compacto valor={formEdicao} onChange={novo=>setFormEdicao(anterior=>({...anterior,...novo}))} />
          : <p className="rounded-lg border border-current/20 p-3 text-xs text-foreground/70">Os mínimos de atividades e evidências exigem a permissão específica de editar requisitos da ocorrência.</p>}
        <div className="pi-ocorrencia-observacoes"><label className="block text-sm">Observações<textarea maxLength={Math.max(200,detalhe.observacoes?.length??0)} rows={2} disabled={!podeEditar} className={CAMPO} value={formEdicao.observacoes} onChange={e => setFormEdicao(v => ({ ...v, observacoes: e.target.value }))}/></label><span className="block text-right text-[11px] text-foreground/60">{formEdicao.observacoes.length}/200</span></div>
        <div className="pi-rodape-formulario flex flex-wrap justify-end gap-2 border-t border-current/15 pt-3"><button data-pi-acao="secundaria" className={BOTAO} type="button" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar edição</button><button data-pi-acao="primaria" className={PRINCIPAL} type="submit" disabled={ocupado || !podeEditarDetalhe}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>}
    </ModalEtapa>}
    {detalhe && mostrarVincular && <ModalEtapa titulo="Vincular atividade" contexto={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])}
      estadoContextual="normal" larguraFormulario="registro" camada="edicao" estreito ocupado={ocupado}
      onFechar={() => { if (!ocupado) {setMostrarVincular(false); setErroVinculo('');} }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Selecione uma atividade já registrada neste entregável. A vinculação não conclui a ocorrência nem duplica quantidades.</p>
        <div className="min-w-0">
          <p className="mb-2 text-xs font-semibold">Pesquisar atividade</p>
          <CampoBuscaSugestoes contextual rotulo="Pesquisar atividade" valor={buscaVinculo} placeholder="Digite o título da atividade..." onChange={valor=>{
            setBuscaVinculo(valor);
            const encontrada=atividadesDisponiveis.find(a=>`${a.titulo} · ${a.id.slice(0,8)}`===valor);
            setAtividadeParaVincular(encontrada?.id ?? '');
          }} opcoes={atividadesDisponiveis.filter(a=>!detalhe.atividades?.some(v=>v.id===a.id)).map(a=>`${a.titulo} · ${a.id.slice(0,8)}`)} maximo={5} />
          {consultandoVinculos && <p role="status" className="mt-2 text-xs text-foreground/70">Consultando atividades...</p>}
          {!consultandoVinculos && atividadesDisponiveis.length === 0 && !erroVinculo && <p className="mt-2 text-xs text-foreground/70">Nenhuma atividade registrada disponível neste entregável.</p>}
          {atividadeParaVincular && <p className="mt-3 rounded-lg border border-current/25 bg-current/[0.06] p-2 text-xs font-semibold">✓ Atividade selecionada</p>}
        </div>
        {erroVinculo && <p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-error-text">{erroVinculo}</p>}
        <div className="flex justify-end gap-2 border-t border-current/15 pt-3">
          <button type="button" className="rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-400 dark:text-red-300 disabled:opacity-50" disabled={ocupado} onClick={()=>setMostrarVincular(false)}>Cancelar</button>
          <button type="button" data-pi-acao="primaria" className="pi-ocorrencia-confirmar-vinculo" disabled={ocupado || !atividadeParaVincular || !podeVincularAtividade} onClick={()=>void confirmarVinculo()}>{ocupado?'Vinculando...':'Confirmar vínculo'}</button>
        </div>
      </div>
    </ModalEtapa>}
    {detalhe && mostrarEncerramento && <ModalEtapa titulo="Solicitar encerramento administrativo" contexto={detalhe.titulo} estreito camada="edicao" estadoContextual="finalizado" ocupado={ocupado} onFechar={() => setMostrarEncerramento(false)}>
      <div className="space-y-4"><p className="text-sm text-foreground/75">O encerramento não conclui a execução física. O progresso efetivamente comprovado será preservado.</p>
        <label className="block text-sm font-semibold">Justificativa obrigatória (15 a 200 caracteres)
          <textarea className={CAMPO} rows={3} maxLength={200} value={motivoEncerramento} onChange={e => setMotivoEncerramento(e.target.value)} /></label>
        {erro && <p role="alert" className="text-error-text">{erro}</p>}
        <div className="flex justify-end gap-2"><button type="button" className={CANCELAR} onClick={() => setMostrarEncerramento(false)}>Cancelar</button><button type="button" className="rounded-lg bg-purple-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40" disabled={ocupado || motivoEncerramento.trim().length < 15} onClick={() => void transicionar('solicitar-encerramento', motivoEncerramento.trim())}>Solicitar encerramento</button></div>
      </div>
    </ModalEtapa>}
    {detalhe && mostrarReabertura && <ModalEtapa titulo={['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(detalhe.status) || detalhe.regularizacaoDocumentalSolicitada ? 'Cancelar solicitação' : 'Reabrir ocorrência'} contexto={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])} estreito camada="edicao"
      estadoContextual={(ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).modal} ocupado={ocupado} focoRetorno={focoReabertura}
      onFechar={() => { setMostrarReabertura(false); setMotivoReabertura(''); }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/75">Informe a justificativa. A solicitação será cancelada e a ocorrência voltará para revisão, com histórico preservado.</p>
        <label className="block text-sm font-medium">Justificativa (15 a 200 caracteres)
          <textarea className={CAMPO} rows={3} maxLength={200} value={motivoReabertura} onChange={e => setMotivoReabertura(e.target.value)} placeholder="Explique a necessidade de reabertura..." />
        </label>
        {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
        <div className="flex justify-end gap-2 border-t border-current/20 pt-3">
          <button type="button" className={CANCELAR} disabled={ocupado} onClick={() => { setMostrarReabertura(false); setMotivoReabertura(''); }}>Cancelar</button>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={ocupado || motivoReabertura.trim().length < 15 || motivoReabertura.trim().length > 200}
            onClick={() => void transicionar('reabrir', motivoReabertura.trim())}>{['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(detalhe.status) || detalhe.regularizacaoDocumentalSolicitada ? 'Confirmar cancelamento' : 'Confirmar reabertura'}</button>
        </div>
      </div>
    </ModalEtapa>}
    {planejamento && (() => {
      const item = entregaveis.find(e => e.id === planejamento.id);
      return item ? <ModalDetalheEntregavel key={`${item.id}:${planejamento.editar}`} contratoId={contratoId} etapaId={item.etapaId} entregavelId={item.id} itemInicial={item}
        podeEditar={podeEditarPlanejamento} permissoes={acesso.dados?.permissoes} dentroModal iniciarEditando={planejamento.editar} secaoInicial="planejamento"
        focoRetorno={planejamento.foco} onFechar={() => { setPlanejamento(null); setErro(''); }} atualizar={async () => { await entregaveisConsulta.atualizar(); }} /> : null;
    })()}
    {atividadeSelecionada && !atividadeDetalhe && !atividadeErro && <span role="status" className="sr-only">Consultando atividade.</span>}
    {atividadeSelecionada && (atividadeDetalhe||atividadeErro) && createPortal(<ModalEtapa cabecalhoUmaLinha titulo={atividadeDetalhe?.titulo ?? 'Detalhes da atividade'} contexto="Atividade vinculada à ocorrência"
      estadoContextual={atividadeDetalhe?.status === 'VERIFICADA' ? 'concluido' : atividadeDetalhe?.status === 'ARQUIVADA' ? 'arquivado' : atividadeDetalhe?.status === 'PENDENTE_CONCLUSAO' ? 'pendente' : 'andamento'}
      camada="edicao" compacto larguraFormulario="atividade" ocupado={verificandoAtividade} focoRetorno={atividadeSelecionada.foco}
      onFechar={() => { leituraAtividade.current?.abort(); setAtividadeSelecionada(null); setAtividadeDetalhe(null); setAtividadeErro(''); }}
      acoes={atividadeDetalhe && detalhe && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status)
        ? <div className="flex flex-wrap items-center gap-2">
          {atividadeDetalhe.status === 'REGISTRADA' && podeSolicitarAtividade && <button type="button"
            className="min-h-9 rounded-lg border border-violet-500/65 bg-violet-500/10 px-3 text-xs font-semibold text-violet-700 hover:bg-violet-500/20 dark:text-violet-200"
            disabled={verificandoAtividade} onClick={() => void verificarAtividadeVinculada()}>Solicitar conclusão</button>}
          {atividadeDetalhe.status === 'PENDENTE_CONCLUSAO' && podeSolicitarAtividade && <button type="button"
            className="min-h-9 rounded-lg border border-red-500/65 bg-red-500/10 px-3 text-xs font-semibold text-red-700 dark:text-red-300"
            disabled={verificandoAtividade} onClick={() => {setAcaoAtividadePendente('cancelar-solicitacao');setMotivoAcaoAtividade('');}}>Cancelar</button>}
          {atividadeDetalhe.status === 'PENDENTE_CONCLUSAO' && podeVerificarAtividade && <button type="button"
            className="min-h-9 rounded-lg border border-green-600 bg-green-700 px-3 text-xs font-semibold text-white hover:bg-green-600"
            disabled={verificandoAtividade} onClick={() => void verificarAtividadeVinculada()}>Aprovar</button>}
          {atividadeDetalhe.status === 'VERIFICADA' && (administrador || acesso.dados?.permissoes?.reabrirAtividades) && <button type="button"
            className="min-h-9 rounded-lg border border-slate-400/40 bg-slate-500/10 px-3 text-xs font-semibold text-foreground hover:bg-slate-500/20"
            disabled={verificandoAtividade} onClick={() => {setAcaoAtividadePendente('reabrir');setMotivoAcaoAtividade('');}}>↻ Reabrir</button>}
          {atividadeDetalhe.status === 'REGISTRADA' && podeVincularAtividade && <button type="button"
            className="min-h-9 rounded-lg border border-red-500/50 bg-red-500/5 px-3 text-xs font-semibold text-red-700 hover:bg-red-500/15 dark:text-red-300"
            disabled={verificandoAtividade} onClick={() => {setAcaoAtividadePendente('desvincular');setMotivoAcaoAtividade('');}}>Desvincular</button>}
        </div> : undefined}>
      {atividadeErro && <p role="alert" className="mb-3 rounded-lg border border-red-500/35 bg-red-500/10 p-3 text-sm text-error-text">{atividadeErro}</p>}
      {atividadeDetalhe && <div className="space-y-4 text-sm">
        <div data-pi-superficie data-tec08-estado={atividadeDetalhe.status === 'VERIFICADA' ? 'concluido' : atividadeDetalhe.status === 'ARQUIVADA' ? 'arquivado' : 'pendente'} className="rounded-xl border p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-foreground/60">{atividadeDetalhe.status === 'VERIFICADA' ? 'Atividade verificada' : atividadeDetalhe.status === 'ARQUIVADA' ? 'Atividade arquivada' : atividadeDetalhe.status === 'PENDENTE_CONCLUSAO' ? 'Pendente de conclusão' : 'Atividade registrada'}</p>
          <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed">{atividadeDetalhe.descricao}</p>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div data-pi-superficie className="rounded-lg border p-3"><dt className="text-xs text-foreground/60">Data e hora</dt><dd className="mt-1 font-semibold">{new Date(atividadeDetalhe.dataHora).toLocaleString('pt-BR')}</dd></div>
          <div data-pi-superficie className="rounded-lg border p-3"><dt className="text-xs text-foreground/60">Tipo</dt><dd className="mt-1 font-semibold">{atividadeDetalhe.tipo}</dd></div>
          <div data-pi-superficie className="rounded-lg border p-3"><dt className="text-xs text-foreground/60">Responsável</dt><dd className="mt-1 font-semibold">{atividadeDetalhe.responsavel || 'Não informado'}</dd></div>
          <div data-pi-superficie className="rounded-lg border p-3"><dt className="text-xs text-foreground/60">Entregáveis</dt><dd className="mt-1 font-semibold">{atividadeDetalhe.entregaveis.map(e => e.nome).join(', ') || 'Nenhum'}</dd></div>
        </dl>
        {(atividadeDetalhe.medicoes?.length??0)>0 && <div className="rounded-xl border border-current/20 p-3">
          <h4 className="text-xs font-semibold uppercase text-foreground/70">Medições por ocorrência</h4>
          <p className="mt-1 text-xs text-foreground/60">Cada valor pertence apenas à ocorrência indicada. Só atividades verificadas aumentam o realizado aprovado.</p>
          <ul className="mt-2 space-y-2">{(atividadeDetalhe.medicoes??[]).map(item=><li key={item.ocorrenciaId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-current/[0.045] p-2 text-xs">
            <span className="min-w-0 break-words">{agenda.ocorrencias.find(o=>o.id===item.ocorrenciaId)?.titulo??`Ocorrência ${item.ocorrenciaId.slice(0,8)}`}</span>
            <strong className="tabular-nums">{item.quantidade} {unidades[agenda.ocorrencias.find(o=>o.id===item.ocorrenciaId)?.entregavelId??'']||'unidades'}</strong>
          </li>)}</ul>
        </div>}
        {atividadeDetalhe.observacoes && <div data-pi-superficie className="rounded-xl border p-3"><h4 className="text-xs font-semibold uppercase text-foreground/70">Observações</h4><p className="mt-2 whitespace-pre-wrap break-words">{atividadeDetalhe.observacoes}</p></div>}
        {atividadeDetalhe.status === 'PENDENTE_CONCLUSAO' && !podeVerificarAtividade && <p className="text-xs text-foreground/65">A aprovação exige permissão de verificar atividades neste contrato.</p>}
        {detalhe && ['PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO','CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADA'].includes(detalhe.status) && <p className="text-xs text-foreground/65">A ocorrência está protegida: alterações nas atividades vinculadas foram bloqueadas.</p>}
      </div>}
    </ModalEtapa>, document.body)}
    {acaoAtividadePendente && atividadeDetalhe && <ConfirmacaoSimples
      titulo={acaoAtividadePendente === 'desvincular' ? 'Desvincular atividade?' : acaoAtividadePendente === 'reabrir' ? 'Reabrir atividade?' : 'Cancelar solicitação?'}
      descricao={acaoAtividadePendente === 'desvincular' ? (atividadeDetalhe.medicoes?.some(m => m.ocorrenciaId === detalhe?.id) || (atividadeDetalhe.ocorrenciaId === detalhe?.id && atividadeDetalhe.quantidadeExecucao != null) ? 'A quantidade registrada nesta atividade para esta ocorrência deixará de contar no progresso. Os outros vínculos e suas medições serão preservados. Confirme apenas se esta correção for intencional; o histórico será auditado.' : 'O vínculo será retirado. Os demais vínculos e suas medições serão preservados; a alteração será auditada.') : 'A decisão será auditada, com justificativa e preservação do histórico.'}
      confirmar={acaoAtividadePendente === 'desvincular' ? 'Desvincular' : acaoAtividadePendente === 'reabrir' ? 'Reabrir' : 'Confirmar cancelamento'}
      ocupado={verificandoAtividade} perigoso={acaoAtividadePendente !== 'reabrir'}
      estadoContextual={acaoAtividadePendente === 'reabrir' ? 'revisao' : 'normal'}
      justificativa={motivoAcaoAtividade} onJustificativaChange={acaoAtividadePendente === 'desvincular' ? undefined : setMotivoAcaoAtividade}
      onCancelar={() => {setAcaoAtividadePendente(null);setMotivoAcaoAtividade('');}}
      onConfirmar={() => void executarAcaoAtividadePendente()}/>}
  </section>;
}
