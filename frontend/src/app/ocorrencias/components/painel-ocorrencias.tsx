'use client';

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias, consultarConfiguracaoOcorrencias, type Ocorrencia, type StatusOcorrencia, type ImpactoAgenda } from '@/hooks/use-ocorrencias';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { IconeOcorrencias } from '@/app/components/icones-operacionais';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { IconeStatus } from '@/app/components/icones-status';
import { ModalDetalheEntregavel } from '@/app/contratos/components/modal-detalhe-entregavel';
import { consultarAtividade, editarAtividadeApi, listarAtividadesVinculaveis, transicionarAtividadeApi, type Atividade } from '@/hooks/use-atividades';
import { estadoTemporal } from '@/lib/estado-temporal';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { CampoBuscaSugestoes } from '@/app/components/campo-busca-sugestoes';
import { useProgresso } from '@/hooks/use-progresso';
import { SeletorEntregavel } from './seletor-entregavel';
import { CalendarioOcorrencias } from './calendario-ocorrencias';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { BotaoEditarModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { IconeEngrenagem } from '@/app/components/icone-engrenagem';
import { ExecucaoOcorrencia, ResumoExecucaoOcorrencia, EvidenciasOcorrencia, HistoricoOcorrencia } from './execucao-ocorrencia';
import { editarExigenciasOcorrencia, editarMetaOcorrencia, editarPesoOcorrencia } from '@/hooks/use-ocorrencias';
import { FormularioRequisitosOcorrencia, ResumoRequisitosOcorrencia, type RequisitosOcorrencia } from './requisitos-ocorrencia';
import { ProgressoSerieRecorrente } from './progresso-serie-recorrente';
import { quantidadeBRParaApi, quantidadeApiParaBR } from '@/lib/numero-quantidade-br';

const CAMPO = 'mt-1.5 w-full min-w-0 rounded-xl border border-brand-green/25 bg-background/80 px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25 disabled:opacity-50';
const CAMPO_SELECT = `${CAMPO} pi-select pr-10`;
const BOTAO = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-40';
const BOTAO_AGENDA = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40';
const CANCELAR = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-400 dark:text-red-300 disabled:opacity-50';
const PRINCIPAL = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50';
const ESTADOS: Record<StatusOcorrencia, { titulo: string; borda: string; fundo: string; texto: string; badge: string; modal: 'nao-iniciado' | 'andamento' | 'concluido' | 'pendente' | 'revisao' | 'finalizado' }> = {
  NAO_INICIADO: { titulo: 'Não iniciada', borda: 'border-brand-green/40', fundo: 'bg-brand-green/[0.045]', texto: 'text-brand-neon', badge: 'border-brand-green/35 bg-brand-green/10', modal: 'andamento' },
  EM_ANDAMENTO: { titulo: 'Em andamento', borda: 'border-brand-green/55', fundo: 'bg-brand-green/[0.075]', texto: 'text-brand-neon', badge: 'border-brand-green/40 bg-brand-green/10', modal: 'andamento' },
  PENDENTE_CONCLUSAO: { titulo: 'Pendente de conclusão', borda: 'border-violet-400/55', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-amber-400/60 bg-amber-500/10', modal: 'pendente' },
  PENDENTE_ENCERRAMENTO: { titulo: 'Pendente de encerramento', borda: 'border-violet-500/55', fundo: 'bg-violet-500/[0.12]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-500/55 bg-violet-500/15', modal: 'pendente' },
  EM_REVISAO: { titulo: 'Em revisão', borda: 'border-teal-500/55', fundo: 'bg-teal-500/[0.045]', texto: 'text-teal-800 dark:text-teal-200', badge: 'border-teal-500/40 bg-teal-500/10', modal: 'revisao' },
  ENCERRADA: { titulo: 'Encerrada', borda: 'border-purple-500/65', fundo: 'bg-purple-500/[0.15]', texto: 'text-purple-700 dark:text-purple-300', badge: 'border-purple-500/65 bg-purple-500/20', modal: 'finalizado' },
  CONCLUIDO: { titulo: 'Concluída', borda: 'border-violet-400/45', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-400/40 bg-violet-500/10', modal: 'concluido' },
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
function estaAtrasada(o: Ocorrencia) {
  const prazo = o.dataPrevista || o.periodoFim;
  if (!prazo) return false;
  if (o.dataRealizada) return o.dataRealizada.slice(0, 10) > prazo.slice(0, 10);
  if (['CONCLUIDO', 'ENCERRADA'].includes(o.status)) return false;
  const hoje = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  return hoje > prazo.slice(0, 10);
}
/** Painel compartilhado: mesma agenda por contrato na rota global e na aba do contrato. */
export function PainelOcorrencias({ contratoId, somenteLeitura = false, embutido = false, estadoContextual = 'normal', entregavelIdInicial = '', abrirOcorrenciaId = null, aoFecharOcorrenciaSelecionada }: { contratoId: string; somenteLeitura?: boolean; embutido?: boolean; estadoContextual?: EstadoContextual; entregavelIdInicial?: string; abrirOcorrenciaId?:string|null; aoFecharOcorrenciaSelecionada?:()=>void }) {
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
  const [modoRecorrente, setModoRecorrente] = useState<'DESCRITIVO'|'QUANTITATIVO'>('DESCRITIVO');
  const [metaRecorrente, setMetaRecorrente] = useState('');
  const [entregavelRecorrente, setEntregavelRecorrente] = useState(entregavelIdInicial);
  const [form, setForm] = useState<Formulario>(vazio);
  const [detalhe, setDetalhe] = useState<Ocorrencia | null>(null);
  const abertoPelaAgenda = useRef<string | null>(null);
  const [abaDetalhe, setAbaDetalhe] = useState<'DETALHES'|'ATIVIDADES'|'EVIDENCIAS'|'HISTORICO'>('DETALHES');
  const [editando, setEditando] = useState(false);
  const [pesoPeriodoEdicao,setPesoPeriodoEdicao]=useState('');
  const [justificativaMeta, setJustificativaMeta] = useState('');
  const [formEdicao, setFormEdicao] = useState({ ...requisitosPadrao(), status: 'NAO_INICIADO' as StatusOcorrencia, dataRealizada: '', quantidadeRealizada: '', metaQuantidade: '', observacoes: '' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [focoRetorno, setFocoRetorno] = useState<HTMLElement | null>(null);
  const [planejamento, setPlanejamento] = useState<{ id: string; editar: boolean; foco: HTMLElement } | null>(null);
  const [atividadeSelecionada, setAtividadeSelecionada] = useState<{ id: string; foco: HTMLElement } | null>(null);
  const [atividadeDetalhe, setAtividadeDetalhe] = useState<Atividade | null>(null);
  const [atividadeErro, setAtividadeErro] = useState('');
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
  const { dados: perfil } = useMeuPerfil();
  const acesso = useAcessoContrato(contratoId);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = useMemo(() => (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm), [entregaveisConsulta.dados]);
  const etapasConsulta = useEtapas(contratoId);
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm && e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const contextoDoEntregavel = entregaveis.find(e => e.id === entregavelIdInicial);
  // Também abre calendário quando o recorrente foi escolhido na consulta global.
  const entregavelDaConsulta = entregaveis.find(e => e.id === (contextoEntregavel ? entregavelIdInicial : entregavelFiltro));
  // Somente recorrentes precisam da grade de agenda; demais tipos seguem lista por data de início.
  const modoVisualizacao = entregavelDaConsulta?.tipo === 'RECORRENTE' ? 'CALENDARIO' : 'LISTA';
  const estadoAcaoEntregavel: EstadoContextual = !contextoEntregavel ? estadoContextual
    : contextoDoEntregavel?.arquivadoEm ? 'arquivado' : contextoDoEntregavel?.reabertoEm ? 'revisao'
    : contextoDoEntregavel?.statusExecucao === 'CONCLUIDO' ? 'concluido'
    : contextoDoEntregavel?.statusExecucao === 'EM_ANDAMENTO' ? 'andamento' : 'nao-iniciado';
  const classeAcaoAgenda = estadoAcaoEntregavel === 'concluido' ? 'border-violet-400/50 text-violet-700 dark:text-violet-300 hover:bg-violet-500/10'
    : estadoAcaoEntregavel === 'revisao' ? 'border-teal-500/50 text-teal-700 dark:text-teal-200 hover:bg-teal-500/10'
    : estadoAcaoEntregavel === 'andamento' ? 'border-[#65813b]/65 text-[#486129] dark:text-[#b8d28a] hover:bg-[#556b2f]/10'
    : estadoAcaoEntregavel === 'arquivado' ? 'border-amber-500/50 text-amber-700 dark:text-amber-200 hover:bg-amber-500/10'
    : estadoAcaoEntregavel === 'nao-iniciado' ? 'border-neutral-400/50 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-400/10'
    : 'border-brand-green/45 text-brand-neon hover:bg-brand-green/10';
  const planejamentoDisponivel = !entregaveisConsulta.atualizando && !etapasConsulta.atualizando && !entregaveisConsulta.erro && !etapasConsulta.erro && !entregaveisConsulta.carregando && !etapasConsulta.carregando;
  const abertos = planejamentoDisponivel ? entregaveis.filter(e => e.statusExecucao !== 'CONCLUIDO' && etapasAbertas.has(e.etapaId)) : [];
  const entregaveisManuais = abertos.filter(e => e.tipo !== 'RECORRENTE');
  const tipoCadastroSelecionado = entregaveis.find(e => e.id === form.entregavelId)?.tipo;
  const entregaveisDoFormulario = entregaveisManuais;
  const entregaveisRecorrentes = abertos.filter(e => e.tipo === 'RECORRENTE');
  const agenda = useOcorrencias(contratoId);
  const recorrenteSelecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
  const agendaConfiavel = !agenda.loading && !agenda.erro;
  const agendaJaCriada = Boolean(entregavelRecorrente && agenda.ocorrencias.some(o => o.entregavelId === entregavelRecorrente && o.origem === 'RECORRENTE' && !o.substituidaEm));
  const registrosDoEntregavel = contextoEntregavel ? agenda.ocorrencias.filter(o => o.entregavelId === entregavelIdInicial) : [];
  const planejamentoCompleto = Boolean(recorrenteSelecionado?.inicioPrevisto && recorrenteSelecionado?.terminoPrevisto && recorrenteSelecionado?.periodicidade);
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
  const permitir = (chave: 'criarOcorrencias' | 'editarOcorrencias' | 'editarMetaOcorrencia' | 'vincularAtividadesOcorrencia' | 'vincularEvidenciasOcorrencia' | 'editarExigenciasOcorrencia' | 'editarPesoOcorrencia' | 'registrarExecucaoOcorrencia' | 'corrigirExecucaoOcorrencia' | 'bloquearExecucaoOcorrencia' | 'excluirExecucaoOcorrencia' | 'concluirOcorrencias' | 'reabrirOcorrencias' | 'configurarAgendaOcorrencias' | 'editarExecucaoFisica' | 'enviarComprovantes') => autorizado && (administrador || Boolean(acesso.dados?.permissoes?.[chave]));
  const podeCriarBase = permitir('criarOcorrencias');
  const podeEditar = permitir('editarOcorrencias');
  const podeEditarMeta = permitir('editarMetaOcorrencia');
  const podeEditarExigencias=permitir('editarExigenciasOcorrencia');
  const podeEditarPeso=permitir('editarPesoOcorrencia');
  const podeRegistrarMedicao = permitir('registrarExecucaoOcorrencia');
  const podeCorrigirMedicao = permitir('corrigirExecucaoOcorrencia');
  const podeBloquearMedicao = permitir('bloquearExecucaoOcorrencia');
  const podeExcluirMedicao = permitir('excluirExecucaoOcorrencia');
  const podeVincularEvidencia = permitir('vincularEvidenciasOcorrencia');
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
    setConsultandoVinculos(true); setErroVinculo('');
    void listarAtividadesVinculaveis(contratoId, detalhe.entregavelId, controlador.signal)
      .then(pagina => setAtividadesDisponiveis(pagina.data.filter(a => a.status === 'REGISTRADA')))
      .catch(erro => { if (!controlador.signal.aborted) setErroVinculo(erro instanceof Error ? erro.message : 'Não foi possível consultar as atividades.'); })
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
  const semAtividadeVerificada = atividadesValidas.filter(a=>a.status==='VERIFICADA').length < (detalhe ? requisitosDe(detalhe).minimoAtividadesVerificadas : 0) || haAtividadesPendentes;
  const metaCumprida = detalhe?.metaAtingida ?? (detalhe?.metaQuantidade == null || Number(detalhe.quantidadeExecutada ?? 0) >= Number(detalhe.metaQuantidade));
  const entregavelContinuo = entregaveis.find(e => e.id === detalhe?.entregavelId);
  const periodoCumprido = entregavelContinuo?.tipo !== 'CONTINUO' ||
    !entregavelContinuo.terminoPrevisto || new Date().toISOString().slice(0,10) >= entregavelContinuo.terminoPrevisto;
  const podeSolicitarConclusao = Boolean(detalhe && (detalhe.requisitosAtendidos ?? !semAtividadeVerificada) && metaCumprida && periodoCumprido);
  const podeCriar = podeCriarBase && entregaveisManuais.length > 0;
  const podeCadastrarNesteContexto = !contextoEntregavel || entregaveisManuais.some(e => e.id === entregavelIdInicial);
  const podeGerar = podeAgendar && entregaveisRecorrentes.length > 0;
  const registros = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(estadoTemporal(o.status, o.periodoInicio || o.dataPrevista))) || abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!entregavelFiltro || o.entregavelId === entregavelFiltro) &&
    (!etapaFiltro || entregaveis.some(e => e.id === o.entregavelId && e.etapaId === etapaFiltro)) &&
    (abaOcorrencias !== 'ATIVAS' || !dataInicial || (o.dataPrevista || o.periodoInicio || '') >= dataInicial) &&
    (abaOcorrencias !== 'ATIVAS' || !dataFinal || (o.dataPrevista || o.periodoFim || '') <= dataFinal) &&
    (abaOcorrencias !== 'ATIVAS' || situacaoFiltro === 'TODAS' || estadoTemporal(o.status, o.periodoInicio || o.dataPrevista) === situacaoFiltro) &&
    (!busca.trim() || o.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(busca.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')))
  ).slice().sort((a,b) => (a.periodoInicio ?? a.dataPrevista ?? '9999').localeCompare(b.periodoInicio ?? b.dataPrevista ?? '9999')),
  [agenda.ocorrencias, entregavelFiltro, etapaFiltro, dataInicial, dataFinal, entregaveis, situacaoFiltro, busca, historico, abaOcorrencias, modoVisualizacao]);
  const sugestoesBusca = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (['NAO_INICIADO', 'EM_ANDAMENTO', 'EM_REVISAO'].includes(estadoTemporal(o.status, o.periodoInicio || o.dataPrevista))) ||
      abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!contextoEntregavel || o.entregavelId === entregavelIdInicial)).map(o => o.titulo), [agenda.ocorrencias, historico, abaOcorrencias, contextoEntregavel, entregavelIdInicial, modoVisualizacao]);
  const concluidas = registros.filter(o => o.status === 'CONCLUIDO').length;
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
    setAtividadeSelecionada({ id, foco }); setAtividadeDetalhe(null); setAtividadeErro('');
    void consultarAtividade(contratoId, id).then((atividade) => {
      if (atividade.contratoId !== contratoId || atividade.id !== id) throw new Error('Atividade vinculada incompatível com o contrato.');
      setAtividadeDetalhe(atividade);
    }).catch((falha: unknown) => setAtividadeErro(falha instanceof Error ? falha.message : 'Não foi possível consultar a atividade.'));
  }
  async function verificarAtividadeVinculada() {
    if (!atividadeSelecionada || !atividadeDetalhe || !(atividadeDetalhe.status === 'REGISTRADA' ? podeSolicitarAtividade : podeVerificarAtividade) || !['REGISTRADA', 'PENDENTE_CONCLUSAO'].includes(atividadeDetalhe.status) ||
        !detalhe || ['PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO', 'CONCLUIDO', 'ENCERRADA'].includes(detalhe.status) || verificandoAtividade) return;
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
  function abrirCadastro(gatilho: HTMLElement) {
    setDataUnica(false); setFocoRetorno(gatilho); setForm({ ...vazio(), entregavelId: entregaveisManuais.some(e=>e.id===entregavelFiltro) ? entregavelFiltro : '', modoRegistro: entregaveis.find(e => e.id === entregavelFiltro)?.tipo === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO' }); setErro(''); setSucesso(''); setModalCadastro(true);
  }
  function abrirDetalhe(o: Ocorrencia, gatilho: HTMLElement, editar = false) {
    setFocoRetorno(gatilho); setDetalhe(o); setAbaDetalhe('DETALHES'); setEditando(editar); setMostrarReabertura(false); setErro(''); setSucesso('');
    if (agenda.consultarDetalhe) void agenda.consultarDetalhe(o.id).then(novo=>setDetalhe(atual=>atual?.id===o.id?novo:atual)).catch(()=>setDetalhe(atual=>atual?.id===o.id?{...atual, atividades:undefined}:atual));
    setPesoPeriodoEdicao(o.pesoPeriodo?.replace('.',',')??'');
    setJustificativaMeta('');
    setFormEdicao({ status: o.status, dataRealizada: o.dataRealizada ?? '', quantidadeRealizada: o.quantidadeRealizada ?? '', metaQuantidade: quantidadeApiParaBR(o.metaQuantidade), observacoes: o.observacoes ?? '',...requisitosDe(o) });
  }
  // Agenda geral: a consulta pode terminar depois de montar o componente.
  // Abrir uma única vez por seleção, sem recriar o modal a cada invalidação do cache.
  useEffect(() => {
    if (!abrirOcorrenciaId) { abertoPelaAgenda.current = null; return; }
    if (abertoPelaAgenda.current === abrirOcorrenciaId || agenda.loading) return;
    const id = abrirOcorrenciaId;
    abertoPelaAgenda.current = id;
    const registro = agenda.ocorrencias.find(o => o.id === id);
    if (registro) {
      setDetalhe(registro); setAbaDetalhe('DETALHES'); setEditando(false);
      setPesoPeriodoEdicao(registro.pesoPeriodo?.replace('.', ',') ?? '');
      setJustificativaMeta('');
      setFormEdicao({status:registro.status,dataRealizada:registro.dataRealizada??'',quantidadeRealizada:registro.quantidadeRealizada??'',metaQuantidade:quantidadeApiParaBR(registro.metaQuantidade),observacoes:registro.observacoes??'',...requisitosDe(registro)});
    }
    // Mesmo se o registro não estiver na página atual da lista, buscar diretamente
    // pelo ID autenticado: nunca redirecionar o usuário a outra tela.
    void agenda.consultarDetalhe(id).then(atual => {
      setDetalhe(anterior => anterior?.id === id || !anterior ? atual : anterior);
      if (!registro) { setAbaDetalhe('DETALHES'); setEditando(false); }
    }).catch(e => { setErro(e instanceof Error ? e.message : 'Ocorrência não encontrada ou sem acesso.'); });
    // consultarDetalhe lê pelo ID; não depende de re-renderizações do cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[abrirOcorrenciaId,agenda.loading,agenda.ocorrencias]);
  async function atualizarDetalheOcorrencia(){
    if (!detalhe)return;
    const atualizado=await agenda.consultarDetalhe(detalhe.id);
    setDetalhe(atual=>atual?.id===atualizado.id?atualizado:atual);
    await Promise.all([agenda.atualizar(),progresso.atualizar()]);
    avisarAtualizacaoContratual();
  }
  async function gerarRecorrencias() {
    if (modoRecorrente==='QUANTITATIVO' && !(Number(quantidadeBRParaApi(metaRecorrente) ?? 0)>0)) {
      setErro('Informe uma meta quantitativa positiva para cada ocorrência (até três casas decimais).');return;
    }
    const selecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
    if (!podeGerar || !selecionado || ocupado || !agendaConfiavel || agendaJaCriada) return;
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const geradas = await agenda.gerarOcorrenciasRecorrentes(selecionado.id, {
        ...requisitosGeracao,modoRegistro:modoRecorrente,
        ...(modoRecorrente==='QUANTITATIVO'?{metaQuantidade:quantidadeBRParaApi(metaRecorrente)!}:{}),
      });
      setSucesso(`${geradas} ocorrência(s) recorrente(s) gerada(s). Períodos existentes preservados.`);
      setConfirmarGeracao(false);
    } catch (falha) { setErro(explicarFalhaDePeriodo(falha instanceof Error ? falha.message : 'Não foi possível gerar os períodos.')); }
    finally { setOcupado(false); }
  }
  function iniciarReplanejamento(id: string, gatilho: HTMLElement) {
    const selecionado = entregaveis.find(e => e.id === id);
    if (!selecionado || !agendaConfiavel || !podeAgendar) return;
    setFocoRetorno(gatilho); setEntregavelRecorrente(id);
    const registroModelo = agenda.ocorrencias.find(o => o.entregavelId === id && o.origem === 'RECORRENTE' && !o.substituidaEm);
    setModoNovoPeriodo(registroModelo?.modoRegistro === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO');
    setMetaNovoPeriodo(registroModelo?.metaQuantidade ? quantidadeApiParaBR(registroModelo.metaQuantidade) : '');
    setUnidadeReplanejamento(selecionado.unidadeMedida ?? '');
    setPlano({ inicioFuturo: selecionado.agendaInicioFuturo ?? selecionado.inicioPrevisto ?? '', terminoPrevisto: selecionado.terminoPrevisto ?? '', periodicidade: selecionado.periodicidade ?? 'SEMANAL' });
    setImpacto(null); setErro(''); setReplanejar(true);
    void consultarConfiguracaoOcorrencias(contratoId,id).then(config => {
      if (config && config.inicioPrevisto && config.terminoPrevisto)
        setPlano({inicioFuturo:config.inicioPrevisto, terminoPrevisto:config.terminoPrevisto, periodicidade:config.periodicidade ?? selecionado.periodicidade ?? 'SEMANAL'});
    }).catch(() => { /* DTO do entregável permanece como referência legível. */ });
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
    if (unidadeReplanejamento.length > 40 || (modoNovoPeriodo === 'QUANTITATIVO' && !unidadeReplanejamento.trim())) {
      setErro('A medição quantitativa exige uma unidade de medida de até 40 caracteres.'); return;
    }
    const meta = modoNovoPeriodo === 'QUANTITATIVO' ? quantidadeBRParaApi(metaNovoPeriodo) : null;
    if (modoNovoPeriodo === 'QUANTITATIVO' && (!meta || Number(meta) <= 0)) {
      setErro('A meta quantitativa de novos períodos deve ser maior que zero.'); return;
    }
    setOcupado(true); setErro('');
    try {
      const r = await agenda.replanejar(entregavelRecorrente,{...plano,
        ...(unidadeReplanejamento.trim() ? {unidadeMedida: unidadeReplanejamento.trim()} : {}), modoRegistro: modoNovoPeriodo,
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
        if (formEdicao.dataRealizada !== (detalhe.dataRealizada ?? '')) dados.dataRealizada = formEdicao.dataRealizada || null;
        if (detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null && formEdicao.quantidadeRealizada.replace(',', '.') !== (detalhe.quantidadeRealizada ?? ''))
          dados.quantidadeRealizada = formEdicao.quantidadeRealizada.replace(',', '.') || null;
        if (formEdicao.observacoes !== (detalhe.observacoes ?? '')) dados.observacoes = formEdicao.observacoes.trim() || null;
        if (Object.keys(dados).length) { await agenda.editarOcorrencia(detalhe.id,dados); alterou=true; }
      }
      if (podeEditarMeta && detalhe.metaQuantidade != null &&
          Number(quantidadeBRParaApi(formEdicao.metaQuantidade)) !== Number(detalhe.metaQuantidade)) {
        const novaMeta = quantidadeBRParaApi(formEdicao.metaQuantidade);
        if (!novaMeta || Number(novaMeta) <= 0)
          throw new Error('Informe uma meta positiva, com até três casas decimais.');
        if (Number(novaMeta) < Number(detalhe.quantidadeRegistrada ?? detalhe.quantidadeExecutada ?? 0) &&
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
      if (podeEditarPeso && detalhe.origem==='RECORRENTE' && pesoPeriodoEdicao.replace(',','.') !== (detalhe.pesoPeriodo??'')) {
        await editarPesoOcorrencia(contratoId,detalhe.id,pesoPeriodoEdicao.trim()?pesoPeriodoEdicao.replace(',','.'):null);
        alterou=true;
      }
      setEditando(false); setSucesso(alterou?'Ocorrência atualizada com sucesso.':'Nenhuma alteração para salvar.');
      if(alterou) avisarAtualizacaoContratual();
      await atualizarDetalheOcorrencia();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  async function transicionar(acao: 'iniciar' | 'solicitar-conclusao' | 'concluir' | 'reabrir' | 'solicitar-encerramento' | 'aprovar-encerramento', justificativa?: string) {
    if (!detalhe || ocupado) return;
    setOcupado(true); setErro('');
    try {
      await agenda.transicionarOcorrencia(detalhe.id, acao, justificativa);
      const atualizado = await agenda.consultarDetalhe(detalhe.id);
      setDetalhe(atual => atual?.id === atualizado.id ? atualizado : atual);
      setSucesso('Situação da ocorrência atualizada.'); avisarAtualizacaoContratual();
      setMostrarReabertura(false); setMotivoReabertura(''); setMostrarEncerramento(false); setMotivoEncerramento('');
      await progresso.atualizar();
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível alterar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  return <section aria-label="Ocorrências do contrato" data-modo-visualizacao={modoVisualizacao.toLowerCase()} data-tec09-painel-ocorrencias data-pi-painel-contextual data-tec08-contexto-operacional data-tec08-estado={estadoContextual} className={`min-w-0 space-y-5 rounded-2xl border p-4 ${embutido ? 'sm:p-6' : 'sm:p-5'}`}>
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <h3 data-pi-titulo className="flex items-center gap-2 text-lg font-bold text-foreground"><IconeOcorrencias tamanho={20} /> {contextoEntregavel ? 'Ocorrências' : 'Ocorrências do contrato'}</h3>
        <p className="text-sm text-foreground/65">{contextoEntregavel ? 'Execuções vinculadas a este entregável.' : 'Consulte os registros do contrato e filtre por entregável.'}</p>
      </div>
      <div className="flex min-h-9 flex-wrap items-center justify-end gap-2">
        {(contextoEntregavel || Boolean(entregavelFiltro)) && entregavelDaConsulta?.tipo === 'RECORRENTE' && !entregavelDaConsulta.arquivadoEm && !['CONCLUIDO','FINALIZADO'].includes(entregavelDaConsulta.statusExecucao ?? '') && <button type="button" disabled={!podeConfigurarSelecionado} data-pi-configurar-ocorrencias
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-current hover:text-brand-neon focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35"
          onClick={e => {
            if (!podeConfigurarSelecionado) return;
            if (entregavelDaConsulta?.tipo === 'RECORRENTE') {
              if (!podeAgendar) { setErro('Sem permissão para replanejar a agenda recorrente.'); return; }
              const selecionado = contextoEntregavel ? entregavelIdInicial : entregavelFiltro;
              if (agenda.ocorrencias.some(o => o.entregavelId === selecionado && o.origem === 'RECORRENTE' && !o.substituidaEm)) iniciarReplanejamento(selecionado,e.currentTarget);
              else setPlanejamento({ id: selecionado, editar: true, foco: e.currentTarget });
            }
          }} aria-label="Configurar ocorrências" title={!podeConfigurarSelecionado ? 'Sem permissão para configurar as ocorrências' : entregavelDaConsulta?.tipo === 'RECORRENTE' ? 'Replanejar datas e periodicidade' : 'Editar planejamento do entregável'}>
          <IconeEngrenagem />
        </button>}
        {(!contextoEntregavel || contextoDoEntregavel?.tipo !== 'RECORRENTE') && podeCriarBase && <button type="button" disabled={!planejamentoDisponivel || !podeCriar || !podeCadastrarNesteContexto} title={!podeCriar || !podeCadastrarNesteContexto ? "É necessário entregável aberto e permissão para registrar" : "Criar ocorrência"} onClick={e => { abrirCadastro(e.currentTarget); }} data-pi-acao="primaria" className={PRINCIPAL}>＋ Nova ocorrência</button>}
      </div>
    </header>
    {somenteLeitura && <p className="text-xs text-foreground/65">Contrato somente para consulta.</p>}
    {!somenteLeitura && !podeCriarBase && <p className="text-xs text-foreground/65">Você não possui permissão para adicionar ou gerar ocorrências.</p>}
    {podeCriarBase && !planejamentoDisponivel && <p role="status" className="text-xs text-foreground/65">{entregaveisConsulta.erro || etapasConsulta.erro ? "Não foi possível consultar o planejamento." : "Consultando entregáveis disponíveis..."}</p>}
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
    </div>
    {modalFiltros && <ModalEtapa titulo="Mais filtros" contexto="Pesquisar ocorrências" compacto estadoContextual={estadoContextual} ocupado={false} focoRetorno={focoFiltros} onFechar={() => setModalFiltros(false)}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Combine os critérios para encontrar ocorrências. A pesquisa por texto continua disponível na lista.</p>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Data inicial
            <input type="date" disabled={!podeEditar} className={`${CAMPO} max-w-full`} value={dataInicial} onChange={e => setDataInicial(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Data final
            <input type="date" className={`${CAMPO} max-w-full`} min={dataInicial || undefined} value={dataFinal} onChange={e => setDataFinal(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Situação
            <select aria-label="Filtrar situação das ocorrências" className={CAMPO_SELECT} value={situacaoFiltro} onChange={e => setSituacaoFiltro(e.target.value as typeof situacaoFiltro)}>
              <option value="TODAS">Todas</option>{abaOcorrencias === 'ATIVAS' && <><option value="NAO_INICIADO">Não iniciadas</option><option value="EM_ANDAMENTO">Em andamento</option><option value="EM_REVISAO">Em revisão</option></>}
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
      : agenda.loading ? <div role="status" aria-label="Carregando ocorrências" className="min-h-[480px] space-y-3 rounded-xl border border-current/15 p-4 animate-pulse">
          <div className="h-10 w-1/2 rounded-lg bg-foreground/10" />
          <div className="grid grid-cols-7 gap-2">{Array.from({length: 28},(_,i) =>
            <div key={i} className="h-16 rounded-lg bg-foreground/5" />)}</div>
        </div>
      : agenda.erro ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 p-4 text-sm text-error-text"><span>{agenda.erro}</span><button type="button" className={BOTAO} onClick={() => { void agenda.atualizar(); }}>Tentar novamente</button></div>
      : registros.length === 0 && contextoEntregavel && contextoDoEntregavel?.tipo === 'RECORRENTE' && !agendaJaCriada && podeAgendar ?
        <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-current/25 bg-current/[0.025] p-6 text-center">
          <h4 className="text-sm font-semibold">Agenda ainda não gerada</h4>
          <p className="max-w-md text-sm text-foreground/65">As datas e a periodicidade já vêm do planejamento. Configure os requisitos antes de gerar as ocorrências.</p>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} onClick={e=>{setFocoRetorno(e.currentTarget);setEntregavelRecorrente(entregavelIdInicial);setRequisitosGeracao(requisitosPadrao());setConfirmarGeracao(true);}}>＋ Configurar e gerar ocorrências</button>
        </div>
      : registros.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed border-current/25 p-6 text-sm text-foreground/65">{historico ? 'Nenhuma ocorrência arquivada neste entregável ou contrato.' : 'Nenhuma ocorrência nesta situação corresponde aos filtros.'}</p>
      : modoVisualizacao === 'CALENDARIO' ? <>
          {entregavelDaConsulta?.tipo === 'RECORRENTE' && <ProgressoSerieRecorrente registros={registros} inicio={entregavelDaConsulta?.inicioPrevisto??null} fim={entregavelDaConsulta?.terminoPrevisto??null}/>}
          <CalendarioOcorrencias registros={registros} periodicidade={entregavelDaConsulta?.periodicidade ?? 'DIARIA'} aoAbrir={abrirDetalhe} />
        </>
      : <ul aria-label="Lista de ocorrências" className="grid gap-3">{registros.map(o => {
        const visual = estadoTemporal(o.status, o.periodoInicio || o.dataPrevista);
        const cor = o.substituidaEm ? {titulo:'Arquivada',borda:'border-amber-500/40',fundo:'bg-amber-500/[0.11]',texto:'text-amber-600 dark:text-amber-300',badge:'bg-amber-500/10'} : ESTADOS[visual] ?? ESTADOS.NAO_INICIADO;
        return <li key={o.id} data-ocorrencia-estado={estadoTemporal(o.status, o.periodoInicio || o.dataPrevista)} className="relative min-w-0"><button type="button" aria-label={`Ver detalhes da ocorrência ${tituloApresentacao(o, periodos[o.entregavelId])}`} onClick={e => abrirDetalhe(o, e.currentTarget)}
          className={`pi-ocorrencia-card group w-full min-w-0 space-y-3 rounded-xl border p-4 text-left outline-none transition-colors duration-200 hover:brightness-100 focus-visible:ring-2 focus-visible:ring-current/45 sm:p-5 ${cor.borda} ${cor.fundo} ${cor.texto}`}>
          <span className="flex flex-wrap items-start justify-between gap-3"><span className={`min-w-0 flex-1 truncate font-semibold ${cor.texto}`} title={tituloApresentacao(o, periodos[o.entregavelId])}>{tituloApresentacao(o, periodos[o.entregavelId])}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cor.borda} ${cor.badge} ${cor.texto}`}>{cor.titulo}</span></span>
          <span className="flex flex-wrap items-center gap-3 text-sm text-foreground/75">
            {(o.periodoInicio || o.dataPrevista) && <time dateTime={o.periodoInicio || o.dataPrevista || ''}>
              {dataBR(o.periodoInicio || o.dataPrevista)}{o.periodoFim && o.periodoFim !== o.periodoInicio ? ` – ${dataBR(o.periodoFim)}` : ''}
            </time>}
            {o.modoRegistro === 'QUANTITATIVO' && o.metaQuantidade != null && <strong className="text-base tabular-nums">{quantidadeApiParaBR(o.metaQuantidade)} {unidades[o.entregavelId] || 'unidades'}</strong>}
            {estaAtrasada(o) && <span className="rounded-full border border-amber-500/60 px-2 py-0.5 text-xs">Atrasada</span>}
          </span>
        </button>

        </li>;
      })}</ul>}
    {alertaElegibilidade && <ModalEtapa titulo="Nova ocorrência" estreito camada="edicao" contexto="Condições para o cadastro" estadoContextual={estadoAcaoEntregavel} onFechar={() => setAlertaElegibilidade(false)} ocupado={false}>
      <p className="text-sm text-foreground/80">{!podeCriarBase ? 'Você não possui a permissão Cadastrar ocorrências neste contrato.' : contextoEntregavel && contextoDoEntregavel?.tipo === 'RECORRENTE' ? 'Este entregável usa agenda recorrente. Gere ou replaneje os períodos pelo botão da agenda.' : 'Para cadastrar, o entregável precisa estar ativo, com etapa aberta e modalidade compatível. Confira o planejamento antes de continuar.'}</p>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {contextoEntregavel && podeEditarPlanejamento && contextoDoEntregavel && <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={e => {setAlertaElegibilidade(false); setPlanejamento({ id: entregavelIdInicial, editar: true, foco: e.currentTarget });}}>Editar planejamento</button>}
        <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={() => setAlertaElegibilidade(false)}>Entendi</button>
      </div>
    </ModalEtapa>}
    {confirmarGeracao && <ModalEtapa titulo="Gerar ocorrências recorrentes" cabecalhoUmaLinha compacto contexto="Confirmação" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { if (!ocupado) setConfirmarGeracao(false); }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/75">Confira o calendário do entregável e defina <strong>somente</strong> os requisitos que serão aplicados às novas ocorrências. Datas e periodicidade continuam no planejamento.</p>
        <div data-pi-superficie className="rounded-xl border border-brand-green/20 bg-background/35 p-3 text-sm">
          <p><strong>Entregável:</strong> {recorrenteSelecionado?.nome ?? 'Não informado'}</p>
          <p className="mt-1"><strong>Início previsto:</strong> {dataBR(recorrenteSelecionado?.inicioPrevisto ?? null)}</p>
          <p className="mt-1"><strong>Término previsto:</strong> {dataBR(recorrenteSelecionado?.terminoPrevisto ?? null)}</p>
          <p className="mt-1"><strong>Periodicidade:</strong> {recorrenteSelecionado?.periodicidade ?? 'Não informada'}</p>
        </div>
        {planejamentoCompleto && <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-semibold">Tipo de execução recorrente
            <select value={modoRecorrente} onChange={e=>setModoRecorrente(e.target.value as 'DESCRITIVO'|'QUANTITATIVO')} className={CAMPO_SELECT}>
              <option value="DESCRITIVO">Descritiva — sem quantidade</option><option value="QUANTITATIVO">Quantitativa — meta por ocorrência</option>
            </select>
          </label>
          {modoRecorrente==='QUANTITATIVO' && <label className="text-sm font-semibold">Meta por período
            <input type="text" inputMode="decimal" className={CAMPO} maxLength={18} value={metaRecorrente} onChange={e=>setMetaRecorrente(e.target.value)} placeholder="Ex.: 20" />
          </label>}
        </div>}
        {planejamentoCompleto && <FormularioRequisitosOcorrencia valor={requisitosGeracao} onChange={setRequisitosGeracao} compacto />}
        {(erro || !planejamentoCompleto) && <div role={erro ? 'alert' : 'status'} className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="text-foreground/85">{erro || 'Antes de gerar, defina o início, o término e a periodicidade deste entregável.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: false, foco: e.currentTarget })}>Abrir entregável</button>
            {podeEditarPlanejamento && <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: true, foco: e.currentTarget })}>Editar planejamento</button>}
          </div>
        </div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-green/15 pt-3">
          <button type="button" className={CANCELAR} disabled={ocupado} onClick={() => { setConfirmarGeracao(false); setErro(''); }}>Cancelar</button>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={ocupado || !planejamentoCompleto || modoRecorrente==='QUANTITATIVO' && !(Number(quantidadeBRParaApi(metaRecorrente) ?? 0)>0)} onClick={() => void gerarRecorrencias()}>{ocupado ? 'Gerando...' : 'Confirmar geração'}</button>
        </div>
      </div>
    </ModalEtapa>}
    {replanejar && <ModalEtapa titulo="Replanejar ocorrências" formularioHorizontal contexto="Agenda recorrente" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={()=>{setReplanejar(false);setImpacto(null);setErro('');}}>
      <form data-pi-formulario className="space-y-4" onSubmit={e=>{e.preventDefault();void calcularImpacto(false);}}>
        <p className="text-xs text-foreground/70">Ajuste a agenda e os parâmetros dos novos períodos. Registros existentes mantêm suas próprias metas e histórico.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Início das ocorrências<input required disabled={ocupado} type="date" className={CAMPO} value={plano.inicioFuturo} onChange={e=>{setPlano(p=>({...p,inicioFuturo:e.target.value}));setImpacto(null);}} /></label>
          <label className="block text-sm">Término das ocorrências<input required disabled={ocupado} type="date" className={CAMPO} value={plano.terminoPrevisto} onChange={e=>{setPlano(p=>({...p,terminoPrevisto:e.target.value}));setImpacto(null);}} /></label>
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm">Periodicidade
            <select disabled={ocupado} className={CAMPO_SELECT} value={plano.periodicidade} onChange={e=>{setPlano(p=>({...p,periodicidade:e.target.value}));setImpacto(null);}}>{['DIARIA','SEMANAL','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL'].map(v=><option key={v} value={v}>{({DIARIA:'Diária',SEMANAL:'Semanal',MENSAL:'Mensal',TRIMESTRAL:'Trimestral',SEMESTRAL:'Semestral',ANUAL:'Anual'} as Record<string,string>)[v]}</option>)}</select>
          </label>
          <label className="block min-w-0 text-sm">Unidade de medida
            <input className={CAMPO} maxLength={40} disabled={ocupado || !podeEditarPlanejamento} value={unidadeReplanejamento}
              onChange={e=>{setUnidadeReplanejamento(e.target.value);setImpacto(null);}} placeholder="Ex.: computadores" />
          </label>
          <label className="block min-w-0 text-sm">Medição de novos períodos
            <select className={CAMPO_SELECT} disabled={ocupado} value={modoNovoPeriodo} onChange={e=>{setModoNovoPeriodo(e.target.value as 'DESCRITIVO'|'QUANTITATIVO');setImpacto(null);}}>
              <option value="DESCRITIVO">Descritiva</option><option value="QUANTITATIVO">Quantitativa</option>
            </select>
          </label>
          {modoNovoPeriodo === 'QUANTITATIVO' && <label className="block min-w-0 text-sm">Meta prevista por nova ocorrência
            <input inputMode="decimal" className={CAMPO} disabled={ocupado} maxLength={20} value={metaNovoPeriodo}
              onChange={e=>{setMetaNovoPeriodo(e.target.value);setImpacto(null);}} placeholder="Ex.: 20" />
          </label>}
        </div>
        {erro && <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/5 p-3 text-sm text-error-text">{erro}</p>}
        {impacto && <section data-pi-superficie aria-label="Prévia do replanejamento" className="space-y-3 rounded-xl border p-3 text-sm">
          <h3 data-pi-titulo className="font-semibold">Prévia da alteração</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Mantidas</span><strong>{impacto.preservadas}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Serão arquivadas</span><strong>{impacto.substituir.length}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Novas</span><strong>{impacto.novas.length}</strong></div>
            <div className="rounded-lg border border-current/20 p-2"><span className="block text-xs text-foreground/60">Reativadas</span><strong>{impacto.reativar}</strong></div>
          </div>
          <p className="text-xs text-foreground/70">Ocorrências concluídas preservam suas datas. As outras ocorrências conflitantes serão arquivadas permanentemente. Períodos já ocupados por uma conclusão não serão duplicados.</p>
          {(impacto.substituir.length > 0 || impacto.novas.length > 0) && <ul className="max-h-36 space-y-1 overflow-y-auto text-xs">
            {[...impacto.substituir].sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(o=><li key={o.id} className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/20 px-3 py-2"><span>Será arquivada</span><time>{dataBR(o.inicio)}{o.inicio===o.fim?'':` — ${dataBR(o.fim)}`}</time></li>)}
            {[...impacto.novas].sort((a,b)=>a.inicio.localeCompare(b.inicio)).map(o=><li key={`${o.inicio}:${o.fim}`} className="flex items-center justify-between gap-3 rounded-lg border border-current/20 px-3 py-2"><span>Novo período</span><time>{dataBR(o.inicio)}{o.inicio===o.fim?'':` — ${dataBR(o.fim)}`}</time></li>)}
          </ul>}
        </section>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-current/20 pt-3">
          <button type="button" className={CANCELAR} disabled={ocupado} onClick={() => {setReplanejar(false);setImpacto(null);setErro('');}}>Cancelar</button>
          <button type="submit" data-pi-acao="contextual" disabled={ocupado} className="inline-flex min-h-10 items-center justify-center rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 disabled:opacity-50">Analisar alterações</button>
          {impacto && <button type="button" data-pi-acao="primaria" disabled={ocupado} className={PRINCIPAL} onClick={()=>void calcularImpacto(true)}>Confirmar replanejamento</button>}
        </div>
      </form>
    </ModalEtapa>}
    {modalCadastro && <ModalEtapa titulo="Nova ocorrência" cabecalhoUmaLinha compacto camada="edicao" estadoContextual="andamento" contexto={contextoEntregavel ? `Entregável: ${nomes[entregavelIdInicial] ?? 'selecionado'}` : "Ocorrências do contrato"} rotuloFechar="Fechar cadastro de ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setModalCadastro(false); setErro(''); }}>
      <form data-pi-formulario onSubmit={salvar} className="space-y-4 p-1">
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
        {form.entregavelId && <p role="note" className="rounded-lg border border-brand-green/25 bg-brand-green/[0.06] p-3 text-xs text-foreground/75">{tipoCadastroSelecionado === 'QUANTITATIVO' ? 'Registro por quantidade. Defina a meta na unidade de medida do entregável.' : 'Registro descritivo. Descreva o serviço e vincule as atividades realizadas.'}</p>}
        <label className="block text-sm font-medium">Título *<input className={CAMPO} required maxLength={50} placeholder="Ex.: Manutenção do laboratório A" value={form.titulo} onChange={e => setForm(v => ({ ...v, titulo: e.target.value }))}/></label>
        <p className="text-right text-[11px] text-foreground/60">{form.titulo.length}/50 caracteres</p>
        {form.modoRegistro === 'QUANTITATIVO' && <label className="block text-sm font-medium">Meta a executar{unidades[form.entregavelId] ? ` (${unidades[form.entregavelId]})` : ' (quantidade)'} *
          <input type="text" inputMode="decimal" maxLength={18} required className={CAMPO} value={form.metaQuantidade} onChange={e => setForm(v => ({ ...v, metaQuantidade: e.target.value }))} placeholder="Ex.: 20" />
        </label>}
        <fieldset className="space-y-3 rounded-xl border border-brand-green/20 bg-brand-green/[0.035] p-3">
          <legend className="px-1 text-sm font-semibold">Período da ocorrência (opcional)</legend>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-green" checked={dataUnica} onChange={e => setDataUnica(e.target.checked)}/> Ocorrência prevista para um único dia</label>
          <div className={`grid gap-3 ${dataUnica ? '' : 'sm:grid-cols-2'}`}>
            <label className="block text-sm">{dataUnica ? 'Data prevista' : 'Início previsto'}<input type="date" className={CAMPO} value={form.periodoInicio} onChange={e => setForm(v => ({ ...v, periodoInicio: e.target.value }))}/></label>
            {!dataUnica && <label className="block text-sm">Término das ocorrências<input type="date" min={form.periodoInicio || undefined} className={CAMPO} value={form.periodoFim} onChange={e => setForm(v => ({ ...v, periodoFim: e.target.value }))}/></label>}
          </div>
        </fieldset>
        <FormularioRequisitosOcorrencia valor={form} onChange={novo=>setForm(anterior=>({...anterior,...novo}))} />
        <label className="block text-sm">Observações<textarea rows={3} maxLength={200} placeholder="Descreva brevemente a ocorrência." className={CAMPO} value={form.observacoes} onChange={e => setForm(v => ({ ...v, observacoes: e.target.value }))}/></label><span className="block text-right text-[11px] text-foreground/60">{form.observacoes.length}/200</span>
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4"><button data-pi-acao="secundaria" type="button" className={BOTAO} disabled={ocupado} onClick={() => { setModalCadastro(false); setErro(''); }}>Cancelar</button>
          <button data-pi-acao="primaria" type="submit" className={PRINCIPAL} disabled={!podeCriar || ocupado || (form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null) || !form.titulo.trim() || !form.entregavelId || (form.modoRegistro === 'QUANTITATIVO' && Number(quantidadeBRParaApi(form.metaQuantidade) ?? 0) <= 0)}>{ocupado ? 'Salvando...' : 'Registrar ocorrência'}</button></div>
      </form>
    </ModalEtapa>}
    {detalhe && <ModalEtapa titulo={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])} cabecalhoUmaLinha etiquetaNoContexto compacto etiqueta={detalhe.substituidaEm ? 'Arquivada' : (ESTADOS[estadoTemporal(detalhe.status, detalhe.periodoInicio || detalhe.dataPrevista)] ?? ESTADOS.NAO_INICIADO).titulo} contexto="Detalhes da ocorrência" rotuloFechar="Fechar detalhes da ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setDetalhe(null); setEditando(false); setMostrarReabertura(false); setErro(''); aoFecharOcorrenciaSelecionada?.(); }} estadoContextual={estadoDoObjeto({objeto:'ocorrencia', status:estadoTemporal(detalhe.status, detalhe.periodoInicio || detalhe.dataPrevista), arquivado:Boolean(detalhe.substituidaEm)})}
      retornoEsquerda mostrarXComVoltar somenteIconeFechar
      acoes={<>
      {!editando && podeEditarDetalhe && <BotaoEditarModal rotulo="Editar ocorrência" disabled={ocupado} onClick={() => setEditando(true)} />}
      {!editando && !detalhe.substituidaEm && detalhe.status === 'NAO_INICIADO' && podeEditar &&
        <button type="button" disabled={ocupado} onClick={() => void transicionar('iniciar')}
          className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-lime-500/50 bg-lime-500/10 px-3 py-2 text-xs font-semibold text-lime-700 transition-colors hover:bg-lime-500/20 dark:text-lime-200 disabled:opacity-45">
          <span aria-hidden="true">▶</span> Iniciar ocorrência
        </button>}
      {!editando && !detalhe.substituidaEm && podeReabrir && ['CONCLUIDO','ENCERRADA'].includes(detalhe.status) &&
        <MenuAcoesObjeto rotulo="Reabrir" disabled={ocupado} acaoDireta={() => {setFocoReabertura(null);setMotivoReabertura('');setMostrarReabertura(true);}} />}
      {podeEditar && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && <MenuAcoesObjeto rotulo="Fechar" disabled={ocupado}>
          <BotaoAcaoModal intencao="solicitar-conclusao" disabled={ocupado || !podeSolicitarConclusao}
            title={semAtividadeVerificada ? 'Os requisitos configurados precisam estar atendidos para solicitar aprovação.' : undefined}
            onClick={() => void transicionar('solicitar-conclusao')}>Solicitar conclusão</BotaoAcaoModal>
          <BotaoAcaoModal intencao="solicitar-encerramento" disabled={ocupado || podeSolicitarConclusao || haAtividadesPendentes || !(detalhe.permiteEncerramentoExcepcional??true)}
            title={podeSolicitarConclusao ? 'A conclusão está disponível; o encerramento está desabilitado.' : haAtividadesPendentes ? 'Verifique ou arquive as atividades pendentes antes de solicitar encerramento.' : !detalhe.permiteEncerramentoExcepcional ? 'Encerramento excepcional desabilitado nesta ocorrência.' : undefined}
            onClick={() => { setMotivoEncerramento(''); setMostrarEncerramento(true); }}>⚑ Solicitar encerramento</BotaoAcaoModal>
        </MenuAcoesObjeto>}
      {!editando && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(detalhe.status) && <>
        {podeReabrir && <button type="button" className="rounded-lg border border-red-500/50 bg-red-600/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-600/25 disabled:opacity-40" disabled={ocupado} onClick={e => { setFocoReabertura(e.currentTarget); setMotivoReabertura(''); setMostrarReabertura(true); }} title="Cancelar a solicitação e devolver à revisão">✕ Cancelar</button>}
        {podeConcluir && <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 ${detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'border-green-600 bg-green-700' : 'border-green-600 bg-green-700'}`} disabled={ocupado} onClick={() => void transicionar(detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'aprovar-encerramento' : 'concluir')}>✓ Aprovar</button>}
      </>}
    </>}>
      {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
      {!editando && <div role="tablist" aria-label="Seções da ocorrência" className="mb-4 flex flex-wrap gap-2 rounded-xl border border-current/15 bg-current/[0.025] p-2">
        {([['DETALHES','Detalhes'],['ATIVIDADES','Atividades'],['EVIDENCIAS','Evidências'],['HISTORICO','Histórico']] as const).map(([id,rotulo])=><button key={id} role="tab" type="button" aria-selected={abaDetalhe===id} className={`min-h-9 rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-current ${abaDetalhe===id?'bg-current/10 text-foreground':'text-foreground/70 hover:bg-current/[0.06]'}`} onClick={()=>setAbaDetalhe(id)}>{rotulo}</button>)}
      </div>}
      {!editando && abaDetalhe==='DETALHES' ? <div data-pi-superficie className="grid gap-x-4 gap-y-3 rounded-xl border p-3 text-sm sm:grid-cols-2">
        <p><strong>Registro:</strong> {detalhe.origem === 'RECORRENTE' ? 'Recorrente por período' : (detalhe.modoRegistro === 'DESCRITIVO' || detalhe.origem === 'MANUAL_DESCRITIVA') ? 'Descritivo, sem quantidade' : 'Quantitativo por unidades'}</p>
        <p className="min-w-0 break-words [overflow-wrap:anywhere]"><strong>Entregável:</strong> {nomes[detalhe.entregavelId] ?? 'Vinculado ao contrato'}</p>
        {descricaoPeriodo(detalhe, periodos[detalhe.entregavelId]) && <p><strong>{descricaoPeriodo(detalhe, periodos[detalhe.entregavelId])}</strong></p>}

        <p><strong>Realizado:</strong> {dataBR(detalhe.dataRealizada)} {estaAtrasada(detalhe) && <span className="ml-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">Atrasado</span>}</p>

        <div className="min-w-0 space-y-3 sm:col-span-2" data-pi-resumo-ocorrencia>
          <section className="grid min-w-0 items-center gap-4 rounded-xl border border-current/20 bg-current/[0.025] p-3 sm:grid-cols-2 sm:p-4" aria-label="Progresso e requisitos da ocorrência">
            {detalhe.modoRegistro==='QUANTITATIVO' && detalhe.metaQuantidade!=null && <ResumoExecucaoOcorrencia ocorrencia={detalhe} unidade={unidades[detalhe.entregavelId]||'unidades'}/>}
            <ResumoRequisitosOcorrencia integrado minimoFotos={detalhe.minimoFotos} minimoRelatorios={detalhe.minimoRelatorios} minimoEvidenciasLivres={detalhe.minimoEvidenciasLivres} minimoAtividades={requisitosDe(detalhe).minimoAtividadesVerificadas}
              minimoEvidencias={requisitosDe(detalhe).minimoEvidenciasVerificadas}
              formato={requisitosDe(detalhe).evidenciaExigida} verificadas={detalhe.atividadesVerificadas ?? 0}
              fotos={detalhe.evidenciasFoto ?? 0} relatorios={detalhe.evidenciasRelatorio ?? 0}/>
          </section>
          {detalhe.modoRegistro==='QUANTITATIVO' && <ExecucaoOcorrencia contratoId={contratoId} ocorrencia={detalhe} unidade={unidades[detalhe.entregavelId]||'unidades'} podeRegistrar={podeRegistrarMedicao} podeCorrigir={podeCorrigirMedicao} podeBloquear={podeBloquearMedicao} podeExcluir={podeExcluirMedicao} onAtualizar={atualizarDetalheOcorrencia}/>}
        </div>
        <p className="min-w-0 max-h-32 overflow-y-auto whitespace-pre-wrap break-words [overflow-wrap:anywhere] sm:col-span-2"><strong>Observações:</strong> {detalhe.observacoes || 'Não informadas'}</p>

      </div> : !editando && abaDetalhe==='ATIVIDADES' ? <section className="space-y-4" aria-label="Atividades vinculadas à ocorrência">
        <h3 className="text-sm font-semibold">Atividades deste período</h3>
                <div><strong>Atividades vinculadas:</strong>{detalhe.atividades ? detalhe.atividades.length ? <ul className="mt-2 space-y-2">{detalhe.atividades.map(a=><li key={a.id}><button type="button" className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-current ${a.status === 'VERIFICADA' ? 'border-violet-500/55 bg-violet-500/10 text-violet-700 dark:text-violet-200' : a.status === 'ARQUIVADA' ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200' : 'border-amber-400/50 bg-amber-500/5 text-foreground'}`} onClick={e => abrirAtividade(a.id, e.currentTarget)}><span className="min-w-0 flex-1"><strong className="block truncate font-semibold" title={a.titulo}>{a.titulo}</strong><span className="mt-1 inline-block rounded-full border border-current/30 px-2 py-1 text-xs">{a.status === 'VERIFICADA' ? 'Verificada' : a.status === 'ARQUIVADA' ? 'Arquivada' : a.status === 'PENDENTE_CONCLUSAO' ? 'Pendente de conclusão' : 'Registrada'}</span></span><span aria-hidden="true" className="text-foreground/60">›</span></button></li>)}</ul> : <p>Nenhuma atividade vinculada.</p> : <p>Consulta de vínculos indisponível ou em carregamento.</p>}</div>
      </section> : !editando && abaDetalhe==='EVIDENCIAS' ? <EvidenciasOcorrencia contratoId={contratoId} ocorrencia={detalhe} podeVincular={podeVincularEvidencia} onAtualizar={atualizarDetalheOcorrencia}/> : !editando && abaDetalhe==='HISTORICO' ? <HistoricoOcorrencia contratoId={contratoId} ocorrenciaId={detalhe.id}/> : <form data-pi-formulario className="space-y-3" onSubmit={salvarEdicao}>

        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="block min-w-0 text-sm">Data realizada<input type="date" disabled={!podeEditar} className={`${CAMPO} tec08-data-hora [color-scheme:light] dark:[color-scheme:dark]`} value={formEdicao.dataRealizada} onChange={e => setFormEdicao(v => ({ ...v, dataRealizada: e.target.value }))}/></label>
          <div className="rounded-xl border border-current/15 bg-current/[0.025] p-3 text-xs text-foreground/65">O progresso físico é medido pelos lançamentos e atividades verificadas. A edição não substitui a aprovação.</div>
        </div>
        {detalhe.metaQuantidade != null && <label className="block text-sm">Meta planejada desta ocorrência
          <input type="text" inputMode="decimal" maxLength={18} disabled={!podeEditarMeta} className={CAMPO} value={formEdicao.metaQuantidade} onChange={e => setFormEdicao(v=>({...v,metaQuantidade:e.target.value}))}/>

        </label>}
        {detalhe.metaQuantidade != null && podeEditarMeta &&
          Number(quantidadeBRParaApi(formEdicao.metaQuantidade) ?? 0) < Number(detalhe.quantidadeRegistrada ?? detalhe.quantidadeExecutada ?? 0) &&
          <label className="block min-w-0 text-sm">Justificativa para reduzir a meta abaixo do executado
            <textarea className={CAMPO} value={justificativaMeta} minLength={15} maxLength={200} rows={2}
              onChange={e=>setJustificativaMeta(e.target.value)} placeholder="Explique o replanejamento e preserve o excedente registrado" required/>
            <span className="block text-right text-xs text-foreground/60">{justificativaMeta.length}/200</span>
          </label>}
        {detalhe.origem === 'MANUAL_QUANTITATIVA' && detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null && <label className="block text-sm">Quantidade realizada<input type="text" inputMode="decimal" maxLength={18} disabled={!podeEditar} className={CAMPO} value={formEdicao.quantidadeRealizada} onChange={e => setFormEdicao(v => ({ ...v, quantidadeRealizada: e.target.value }))}/></label>}
        {podeEditarExigencias?<FormularioRequisitosOcorrencia valor={formEdicao} onChange={novo=>setFormEdicao(anterior=>({...anterior,...novo}))} />
          : <p className="rounded-lg border border-current/20 p-3 text-xs text-foreground/70">Os mínimos de atividades e evidências exigem a permissão específica de editar requisitos da ocorrência.</p>}
        {detalhe.origem==='RECORRENTE' && <label className="block text-sm">Peso deste período (%)
          <input type="text" inputMode="decimal" maxLength={8} disabled={!podeEditarPeso} value={pesoPeriodoEdicao} onChange={e=>setPesoPeriodoEdicao(e.target.value)} placeholder="Peso igual se não configurado" className={CAMPO}/>
        </label>}
        <label className="block text-sm">Observações<textarea maxLength={Math.max(200,detalhe.observacoes?.length??0)} rows={3} disabled={!podeEditar} className={CAMPO} value={formEdicao.observacoes} onChange={e => setFormEdicao(v => ({ ...v, observacoes: e.target.value }))}/></label><span className="block text-right text-[11px] text-foreground/60">{formEdicao.observacoes.length}/200</span>
        <div className="flex flex-wrap justify-end gap-2"><button data-pi-acao="secundaria" className={BOTAO} type="button" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar edição</button><button data-pi-acao="primaria" className={PRINCIPAL} type="submit" disabled={ocupado || !podeEditarDetalhe}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>}
      {!editando && abaDetalhe==='ATIVIDADES' && <div className="mt-4 rounded-2xl border border-current/20 bg-current/[0.025] p-2">
        <button type="button" onClick={abrirVinculo} disabled={!podeVincularAtividade || ocupado}
          aria-label="Vincular atividade à ocorrência" title={!podeVincularAtividade ? 'Sem permissão ou ocorrência indisponível para novos vínculos' : 'Selecionar uma atividade registrada do mesmo entregável'}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-current/[0.07] focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-current/30 bg-current/[0.07] text-2xl font-medium transition group-hover:scale-105" aria-hidden="true">+</span>
          <span className="min-w-0 flex-1"><strong className="block text-sm">Vincular atividade</strong><span className="block text-xs text-foreground/65">Associe uma atividade existente a este período.</span></span>
          <span aria-hidden="true" className="text-lg text-foreground/45">›</span>
        </button>
      </div>}
    </ModalEtapa>}
    {detalhe && mostrarVincular && <ModalEtapa titulo="Vincular atividade" contexto={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])}
      estadoContextual={(ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).modal} camada="edicao" estreito alturaEstavel ocupado={ocupado}
      onFechar={() => { if (!ocupado) {setMostrarVincular(false); setErroVinculo('');} }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/70">Selecione uma atividade já registrada neste entregável. A vinculação não conclui a ocorrência nem duplica quantidades.</p>
        <div className="rounded-xl border border-current/20 bg-current/[0.025] p-3">
          <label className="mb-2 block text-xs font-semibold" htmlFor="atividade-vinculo-pesquisa">Pesquisar atividade</label>
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
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={ocupado || !atividadeParaVincular || !podeVincularAtividade} onClick={()=>void confirmarVinculo()}>{ocupado?'Vinculando...':'Confirmar vínculo'}</button>
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
    {detalhe && mostrarReabertura && <ModalEtapa titulo={detalhe.status === 'PENDENTE_CONCLUSAO' || detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'Cancelar solicitação' : 'Reabrir ocorrência'} contexto={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])} estreito camada="edicao"
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
            onClick={() => void transicionar('reabrir', motivoReabertura.trim())}>{['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(detalhe.status) ? 'Confirmar cancelamento' : 'Confirmar reabertura'}</button>
        </div>
      </div>
    </ModalEtapa>}
    {planejamento && (() => {
      const item = entregaveis.find(e => e.id === planejamento.id);
      return item ? <ModalDetalheEntregavel key={`${item.id}:${planejamento.editar}`} contratoId={contratoId} etapaId={item.etapaId} entregavelId={item.id} itemInicial={item}
        podeEditar={podeEditarPlanejamento} permissoes={acesso.dados?.permissoes} dentroModal iniciarEditando={planejamento.editar} secaoInicial="planejamento"
        focoRetorno={planejamento.foco} onFechar={() => { setPlanejamento(null); setErro(''); }} atualizar={async () => { await entregaveisConsulta.atualizar(); }} /> : null;
    })()}
    {atividadeSelecionada && <ModalEtapa cabecalhoUmaLinha titulo={atividadeDetalhe?.titulo ?? 'Detalhes da atividade'} contexto="Atividade vinculada à ocorrência"
      estadoContextual={atividadeDetalhe?.status === 'VERIFICADA' ? 'concluido' : atividadeDetalhe?.status === 'ARQUIVADA' ? 'arquivado' : atividadeDetalhe?.status === 'PENDENTE_CONCLUSAO' ? 'pendente' : 'andamento'}
      camada="aninhada" compacto ocupado={verificandoAtividade} focoRetorno={atividadeSelecionada.foco}
      onFechar={() => { setAtividadeSelecionada(null); setAtividadeDetalhe(null); setAtividadeErro(''); }}
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
      {!atividadeDetalhe ? !atividadeErro && <p role="status" className="text-sm text-foreground/70">Consultando atividade...</p> : <div className="space-y-4 text-sm">
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
        {detalhe && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','CONCLUIDO','ENCERRADA'].includes(detalhe.status) && <p className="text-xs text-foreground/65">A ocorrência está protegida: alterações nas atividades vinculadas foram bloqueadas.</p>}
      </div>}
    </ModalEtapa>}
    {acaoAtividadePendente && atividadeDetalhe && <ConfirmacaoSimples
      titulo={acaoAtividadePendente === 'desvincular' ? 'Desvincular atividade?' : acaoAtividadePendente === 'reabrir' ? 'Reabrir atividade?' : 'Cancelar solicitação?'}
      descricao={acaoAtividadePendente === 'desvincular' ? 'O vínculo com esta ocorrência será retirado; outras ocorrências e quantidades não serão alteradas.' : 'A decisão será auditada, com justificativa e preservação do histórico.'}
      confirmar={acaoAtividadePendente === 'desvincular' ? 'Desvincular' : acaoAtividadePendente === 'reabrir' ? 'Reabrir' : 'Confirmar cancelamento'}
      ocupado={verificandoAtividade} perigoso={acaoAtividadePendente !== 'reabrir'}
      estadoContextual={acaoAtividadePendente === 'reabrir' ? 'revisao' : 'normal'}
      justificativa={motivoAcaoAtividade} onJustificativaChange={acaoAtividadePendente === 'desvincular' ? undefined : setMotivoAcaoAtividade}
      onCancelar={() => {setAcaoAtividadePendente(null);setMotivoAcaoAtividade('');}}
      onConfirmar={() => void executarAcaoAtividadePendente()}/>}
  </section>;
}
