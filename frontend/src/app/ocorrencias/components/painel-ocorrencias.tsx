'use client';

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { z } from 'zod';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEtapas } from '@/hooks/use-etapas';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useOcorrencias, consultarConfiguracaoOcorrencias, type Ocorrencia, type StatusOcorrencia, type ImpactoAgenda } from '@/hooks/use-ocorrencias';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { IconeOcorrencias } from '@/app/components/icones-operacionais';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { IconeStatus } from '@/app/components/icones-status';
import { ModalDetalheEntregavel } from '@/app/contratos/components/modal-detalhe-entregavel';
import { consultarAtividade, transicionarAtividadeApi, type Atividade } from '@/hooks/use-atividades';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { CampoBuscaSugestoes } from '@/app/components/campo-busca-sugestoes';
import { useProgresso } from '@/hooks/use-progresso';
import { SeletorEntregavel } from './seletor-entregavel';
import { CalendarioOcorrencias } from './calendario-ocorrencias';
import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { IconeEngrenagem } from '@/app/components/icone-engrenagem';

const CAMPO = 'mt-1.5 w-full min-w-0 rounded-lg border border-brand-green/25 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition-colors focus-visible:border-brand-green focus-visible:ring-2 focus-visible:ring-brand-green/25 disabled:opacity-50';
const CAMPO_SELECT = `${CAMPO} pi-select pr-10`;
const BOTAO = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-brand-green/30 px-3 py-2 text-sm font-semibold text-brand-neon hover:bg-brand-green/10 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:cursor-not-allowed disabled:opacity-40';
const BOTAO_AGENDA = 'inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-40';
const CANCELAR = 'inline-flex min-h-10 items-center justify-center rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 focus-visible:outline-2 focus-visible:outline-red-400 dark:text-red-300 disabled:opacity-50';
const PRINCIPAL = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50';
const ESTADOS: Record<StatusOcorrencia, { titulo: string; borda: string; fundo: string; texto: string; badge: string; modal: 'nao-iniciado' | 'andamento' | 'concluido' | 'pendente' | 'revisao' | 'finalizado' }> = {
  NAO_INICIADO: { titulo: 'Não iniciada', borda: 'border-neutral-400/50', fundo: 'bg-neutral-400/[0.035]', texto: 'text-neutral-700 dark:text-neutral-100', badge: 'border-neutral-400/50 bg-neutral-400/10', modal: 'nao-iniciado' },
  EM_ANDAMENTO: { titulo: 'Em andamento', borda: 'border-[#65813b]/65', fundo: 'bg-[#556b2f]/[0.075]', texto: 'text-[#486129] dark:text-[#b8d28a]', badge: 'border-[#65813b]/65 bg-[#556b2f]/15', modal: 'andamento' },
  PENDENTE_CONCLUSAO: { titulo: 'Pendente de conclusão', borda: 'border-violet-400/55', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-amber-400/60 bg-amber-500/10', modal: 'pendente' },
  PENDENTE_ENCERRAMENTO: { titulo: 'Pendente de encerramento', borda: 'border-violet-500/55', fundo: 'bg-violet-500/[0.12]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-500/55 bg-violet-500/15', modal: 'pendente' },
  EM_REVISAO: { titulo: 'Em revisão', borda: 'border-teal-500/55', fundo: 'bg-teal-500/[0.045]', texto: 'text-teal-800 dark:text-teal-200', badge: 'border-teal-500/40 bg-teal-500/10', modal: 'revisao' },
  ENCERRADA: { titulo: 'Encerrada', borda: 'border-purple-500/65', fundo: 'bg-purple-500/[0.15]', texto: 'text-purple-700 dark:text-purple-300', badge: 'border-purple-500/65 bg-purple-500/20', modal: 'finalizado' },
  CONCLUIDO: { titulo: 'Concluída', borda: 'border-violet-400/45', fundo: 'bg-violet-500/[0.045]', texto: 'text-violet-700 dark:text-violet-300', badge: 'border-violet-400/40 bg-violet-500/10', modal: 'concluido' },
};
type Formulario = { modoRegistro: 'DESCRITIVO' | 'QUANTITATIVO'; entregavelId: string; titulo: string; periodoInicio: string; periodoFim: string; dataPrevista: string; metaQuantidade: string; quantidadeRealizada: string; observacoes: string };
const vazio = (): Formulario => ({ modoRegistro: 'DESCRITIVO', entregavelId: '', titulo: '', periodoInicio: '', periodoFim: '', dataPrevista: '', metaQuantidade: '', quantidadeRealizada: '', observacoes: '' });
// Zod valida o conteúdo; o desenho dos inputs é definido pelo CSS, não pelo Zod.
const esquemaCadastro = z.object({
  entregavelId: z.string().min(1, 'Selecione um entregável.'),
  titulo: z.string().trim().min(1, 'Informe o título da ocorrência.').max(255),
  modoRegistro: z.enum(['DESCRITIVO', 'QUANTITATIVO']),
  metaQuantidade: z.string(),
  periodoInicio: z.string(), periodoFim: z.string(), dataPrevista: z.string(),
  observacoes: z.string().max(3000), quantidadeRealizada: z.string(),
}).superRefine((dados, ctx) => {
  const meta = Number(dados.metaQuantidade.replace(',', '.'));
  if (dados.modoRegistro === 'QUANTITATIVO' && (!Number.isFinite(meta) || meta <= 0 || !/^\d+([.,]\d{1,3})?$/.test(dados.metaQuantidade))) {
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
export function PainelOcorrencias({ contratoId, somenteLeitura = false, embutido = false, estadoContextual = 'normal', entregavelIdInicial = '' }: { contratoId: string; somenteLeitura?: boolean; embutido?: boolean; estadoContextual?: EstadoContextual; entregavelIdInicial?: string }) {
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
  const [busca, setBusca] = useState('');
  const [modalFiltros, setModalFiltros] = useState(false);
  const [focoFiltros, setFocoFiltros] = useState<HTMLElement | null>(null);
  const [modalCadastro, setModalCadastro] = useState(false);
  const [dataUnica, setDataUnica] = useState(false);
  const [verificandoAtividade, setVerificandoAtividade] = useState(false);
  const [confirmarGeracao, setConfirmarGeracao] = useState(false);
  const [entregavelRecorrente, setEntregavelRecorrente] = useState(entregavelIdInicial);
  const [form, setForm] = useState<Formulario>(vazio);
  const [detalhe, setDetalhe] = useState<Ocorrencia | null>(null);
  const [editando, setEditando] = useState(false);
  const [formEdicao, setFormEdicao] = useState({ status: 'NAO_INICIADO' as StatusOcorrencia, dataRealizada: '', quantidadeRealizada: '', metaQuantidade: '', observacoes: '' });
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [focoRetorno, setFocoRetorno] = useState<HTMLElement | null>(null);
  const [planejamento, setPlanejamento] = useState<{ id: string; editar: boolean; foco: HTMLElement } | null>(null);
  const [atividadeSelecionada, setAtividadeSelecionada] = useState<{ id: string; foco: HTMLElement } | null>(null);
  const [atividadeDetalhe, setAtividadeDetalhe] = useState<Atividade | null>(null);
  const [atividadeErro, setAtividadeErro] = useState('');
  const cache = useRepositorioConsultasOpcional();
  const { dados: perfil } = useMeuPerfil();
  const acesso = useAcessoContrato(contratoId);
  const entregaveisConsulta = useEntregaveis(contratoId);
  const entregaveis = useMemo(() => (entregaveisConsulta.dados ?? []).filter(e => !e.arquivadoEm), [entregaveisConsulta.dados]);
  const etapasConsulta = useEtapas(contratoId);
  const etapasAbertas = new Set((etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm && e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const contextoDoEntregavel = entregaveis.find(e => e.id === entregavelIdInicial);
  // Também abre calendário quando o recorrente foi escolhido na consulta global.
  const entregavelDaConsulta = entregaveis.find(e => e.id === (contextoEntregavel ? entregavelIdInicial : entregavelFiltro));
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
  const permitir = (chave: 'criarOcorrencias' | 'editarOcorrencias' | 'concluirOcorrencias' | 'reabrirOcorrencias' | 'configurarAgendaOcorrencias' | 'editarExecucaoFisica') => autorizado && (administrador || Boolean(acesso.dados?.permissoes?.[chave]));
  const podeCriarBase = permitir('criarOcorrencias');
  const podeEditar = permitir('editarOcorrencias');
  const podeEditarPlanejamento = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.editarEntregaveis));
  const podeConcluir = permitir('concluirOcorrencias');
  const podeReabrir = permitir('reabrirOcorrencias');
  const podeVerificarAtividade = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.verificarAtividades));
  const podeSolicitarAtividade = autorizado && (administrador || Boolean(acesso.dados?.permissoes?.editarAtividades));
  const podeAgendar = permitir('configurarAgendaOcorrencias');
  const podeConfigurarSelecionado = entregavelDaConsulta?.tipo === 'RECORRENTE' ? podeAgendar : podeEditarPlanejamento;
  const podeEditarDetalhe = podeEditar && Boolean(detalhe && !detalhe.substituidaEm && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && abertos.some(e => e.id === detalhe.entregavelId));
  // A solicitação congela os registros vinculados. Todas as atividades ativas
  // precisam estar verificadas para evitar um bloqueio sem saída.
  const atividadesValidas = detalhe?.atividades?.filter(a => a.status !== 'ARQUIVADA') ?? [];
  const haAtividadesPendentes = atividadesValidas.some(a => a.status !== 'VERIFICADA');
  const semAtividadeVerificada = atividadesValidas.length === 0 || haAtividadesPendentes;
  const metaCumprida = detalhe?.metaQuantidade == null || Number(detalhe.quantidadeExecutada ?? 0) >= Number(detalhe.metaQuantidade);
  const entregavelContinuo = entregaveis.find(e => e.id === detalhe?.entregavelId);
  const periodoCumprido = entregavelContinuo?.tipo !== 'CONTINUO' ||
    !entregavelContinuo.terminoPrevisto || new Date().toISOString().slice(0,10) >= entregavelContinuo.terminoPrevisto;
  const podeSolicitarConclusao = !semAtividadeVerificada && metaCumprida && periodoCumprido;
  const podeCriar = podeCriarBase && entregaveisManuais.length > 0;
  const podeCadastrarNesteContexto = !contextoEntregavel || entregaveisManuais.some(e => e.id === entregavelIdInicial);
  const podeGerar = podeAgendar && entregaveisRecorrentes.length > 0;
  const registros = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (modoVisualizacao === 'CALENDARIO' ? true : ['NAO_INICIADO','EM_ANDAMENTO'].includes(o.status)) || abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!entregavelFiltro || o.entregavelId === entregavelFiltro) &&
    (!etapaFiltro || entregaveis.some(e => e.id === o.entregavelId && e.etapaId === etapaFiltro)) &&
    (abaOcorrencias !== 'ATIVAS' || !dataInicial || (o.dataPrevista || o.periodoInicio || '') >= dataInicial) &&
    (abaOcorrencias !== 'ATIVAS' || !dataFinal || (o.dataPrevista || o.periodoFim || '') <= dataFinal) &&
    (abaOcorrencias !== 'ATIVAS' || situacaoFiltro === 'TODAS' || o.status === situacaoFiltro) &&
    (!busca.trim() || o.titulo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').includes(busca.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR')))
  ).slice().sort((a,b) => (a.dataPrevista ?? a.periodoInicio ?? '9999').localeCompare(b.dataPrevista ?? b.periodoInicio ?? '9999')),
  [agenda.ocorrencias, entregavelFiltro, etapaFiltro, dataInicial, dataFinal, entregaveis, situacaoFiltro, busca, historico, abaOcorrencias, modoVisualizacao]);
  const sugestoesBusca = useMemo(() => agenda.ocorrencias.filter(o =>
    (historico ? Boolean(o.substituidaEm) : !o.substituidaEm) &&
    (abaOcorrencias === 'ARQUIVADAS' || abaOcorrencias === 'ATIVAS' && (modoVisualizacao === 'CALENDARIO' ? true : ['NAO_INICIADO', 'EM_ANDAMENTO'].includes(o.status)) ||
      abaOcorrencias === 'REVISAO' && o.status === 'EM_REVISAO' || abaOcorrencias === 'PENDENTE' && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(o.status) || abaOcorrencias === 'CONCLUIDAS' && resultadoFinalizacao('ocorrencia', o.status) !== null) &&
    (!contextoEntregavel || o.entregavelId === entregavelIdInicial)).map(o => o.titulo), [agenda.ocorrencias, historico, abaOcorrencias, contextoEntregavel, entregavelIdInicial, modoVisualizacao]);
  const concluidas = registros.filter(o => o.status === 'CONCLUIDO').length;
  const encerradas = registros.filter(o => o.status === 'ENCERRADA').length;
  const andamento = registros.filter(o => o.status === 'EM_ANDAMENTO').length;

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
  function abrirCadastro(gatilho: HTMLElement) {
    setDataUnica(false); setFocoRetorno(gatilho); setForm({ ...vazio(), entregavelId: entregaveisManuais.some(e=>e.id===entregavelFiltro) ? entregavelFiltro : '', modoRegistro: entregaveis.find(e => e.id === entregavelFiltro)?.tipo === 'QUANTITATIVO' ? 'QUANTITATIVO' : 'DESCRITIVO' }); setErro(''); setSucesso(''); setModalCadastro(true);
  }
  function abrirDetalhe(o: Ocorrencia, gatilho: HTMLElement, editar = false) {
    setFocoRetorno(gatilho); setDetalhe(o); setEditando(editar); setMostrarReabertura(false); setErro(''); setSucesso('');
    if (agenda.consultarDetalhe) void agenda.consultarDetalhe(o.id).then(novo=>setDetalhe(atual=>atual?.id===o.id?novo:atual)).catch(()=>setDetalhe(atual=>atual?.id===o.id?{...atual, atividades:undefined}:atual));
    setFormEdicao({ status: o.status, dataRealizada: o.dataRealizada ?? '', quantidadeRealizada: o.quantidadeRealizada ?? '', metaQuantidade: o.metaQuantidade ?? '', observacoes: o.observacoes ?? '' });
  }
  async function gerarRecorrencias() {
    const selecionado = entregaveisRecorrentes.find(e => e.id === entregavelRecorrente);
    if (!podeGerar || !selecionado || ocupado || !agendaConfiavel || agendaJaCriada) return;
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const geradas = await agenda.gerarOcorrenciasRecorrentes(selecionado.id);
      setSucesso(`${geradas} ocorrência(s) recorrente(s) gerada(s). Períodos existentes preservados.`);
      setConfirmarGeracao(false);
    } catch (falha) { setErro(explicarFalhaDePeriodo(falha instanceof Error ? falha.message : 'Não foi possível gerar os períodos.')); }
    finally { setOcupado(false); }
  }
  function iniciarReplanejamento(id: string, gatilho: HTMLElement) {
    const selecionado = entregaveis.find(e => e.id === id);
    if (!selecionado || !agendaConfiavel || !podeAgendar) return;
    setFocoRetorno(gatilho); setEntregavelRecorrente(id); 
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
    setOcupado(true); setErro('');
    try {
      const r = await agenda.replanejar(entregavelRecorrente,{...plano,...(confirmar && impacto?{confirmacao:impacto.confirmacao}:{})});
      if(r.aplicado){setReplanejar(false);setImpacto(null);setSucesso('Agenda replanejada. Conclusões preservadas; versões conflitantes arquivadas.');void Promise.all([agenda.atualizar(),entregaveisConsulta.atualizar(),progresso.atualizar()]);}else setImpacto(r);
    } catch(f){setImpacto(null);setErro(explicarFalhaDePeriodo(f instanceof Error ? f.message : 'Não foi possível replanejar os períodos.'));} finally {setOcupado(false);}
  }
  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    const resultado = esquemaCadastro.safeParse(form);
    if (!resultado.success) { setErro(resultado.error.issues[0]?.message ?? 'Revise os campos da ocorrência.'); return; }
    if (!podeCriar || !entregaveisDoFormulario.some(e => e.id === form.entregavelId)) { setErro('Selecione um entregável autorizado para este tipo de ocorrência.'); return; }
    if (form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null) { setErro('Concilie a quantidade declarada antes de registrar ocorrências medidas, para evitar dupla contagem.'); return; }
    if (form.modoRegistro === 'QUANTITATIVO' && !(Number(form.metaQuantidade) > 0)) { setErro('Informe uma meta maior que zero para esta ocorrência por quantidade.'); return; }
    if (!dataUnica && form.periodoInicio && form.periodoFim && form.periodoInicio > form.periodoFim) { setErro('A data final deve ser igual ou posterior à inicial.'); return; }
    setOcupado(true);
    try {
      await agenda.criarOcorrenciaManual({
        entregavelId: form.entregavelId, titulo: form.titulo.trim(), modoRegistro: form.modoRegistro,
        ...(form.periodoInicio ? { periodoInicio: form.periodoInicio } : {}),
        ...(form.periodoFim || dataUnica && form.periodoInicio ? { periodoFim: dataUnica ? form.periodoInicio : form.periodoFim } : {}),
        ...(form.periodoFim || form.periodoInicio ? { dataPrevista: dataUnica ? form.periodoInicio : (form.periodoFim || form.periodoInicio) } : {}),
        ...(form.modoRegistro === 'QUANTITATIVO' && form.metaQuantidade ? { metaQuantidade: form.metaQuantidade.replace(',', '.') } : {}),
        ...(form.observacoes.trim() ? { observacoes: form.observacoes.trim() } : {}),
      });
      setModalCadastro(false); setSucesso('Ocorrência registrada com sucesso.'); setForm(vazio());
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível registrar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  async function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault(); setErro('');
    if (!detalhe || !podeEditarDetalhe) return;
    setOcupado(true);
    try {
      await agenda.editarOcorrencia(detalhe.id, {
        dataRealizada: formEdicao.dataRealizada || null,
        ...(detalhe.metaQuantidade != null ? { metaQuantidade: formEdicao.metaQuantidade.replace(',', '.') || null } : {}),
        ...(detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null ? { quantidadeRealizada: formEdicao.quantidadeRealizada.replace(',', '.') || null } : {}),
        observacoes: formEdicao.observacoes.trim() || null,
      });
      setDetalhe(null); setEditando(false); setSucesso('Ocorrência atualizada com sucesso.');
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível atualizar a ocorrência.'); }
    finally { setOcupado(false); }
  }
  async function transicionar(acao: 'solicitar-conclusao' | 'concluir' | 'reabrir' | 'solicitar-encerramento' | 'aprovar-encerramento', justificativa?: string) {
    if (!detalhe || ocupado) return;
    setOcupado(true); setErro('');
    try {
      await agenda.transicionarOcorrencia(detalhe.id, acao, justificativa);
      setSucesso('Situação da ocorrência atualizada.');
      setDetalhe(null); setMostrarReabertura(false); setMotivoReabertura(''); setMostrarEncerramento(false); setMotivoEncerramento('');
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
        {(contextoEntregavel || Boolean(entregavelFiltro)) && <button type="button" disabled={!podeConfigurarSelecionado} data-pi-configurar-ocorrencias
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-current hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current disabled:cursor-not-allowed disabled:opacity-35"
          onClick={e => {
            if (!podeConfigurarSelecionado) return;
            if (entregavelDaConsulta?.tipo === 'RECORRENTE') {
              if (!podeAgendar) { setErro('Sem permissão para replanejar a agenda recorrente.'); return; }
              const selecionado = contextoEntregavel ? entregavelIdInicial : entregavelFiltro;
              if (agenda.ocorrencias.some(o => o.entregavelId === selecionado && o.origem === 'RECORRENTE' && !o.substituidaEm)) iniciarReplanejamento(selecionado,e.currentTarget);
              else setPlanejamento({ id: selecionado, editar: true, foco: e.currentTarget });
            } else setPlanejamento({id:contextoEntregavel ? entregavelIdInicial : entregavelFiltro,editar:true,foco:e.currentTarget});
          }} aria-label="Configurar ocorrências" title={!podeConfigurarSelecionado ? 'Sem permissão para configurar as ocorrências' : entregavelDaConsulta?.tipo === 'RECORRENTE' ? 'Replanejar datas e periodicidade' : 'Editar planejamento do entregável'}>
          <IconeEngrenagem />
        </button>}
        {(!contextoEntregavel || contextoDoEntregavel?.tipo !== 'RECORRENTE') && podeCriarBase && <button type="button" disabled={!planejamentoDisponivel} onClick={e => { if (podeCriar && podeCadastrarNesteContexto) abrirCadastro(e.currentTarget); else setAlertaElegibilidade(true); }} data-pi-acao="primaria" className={PRINCIPAL}>＋ Nova ocorrência</button>}
      </div>
    </header>
    {contextoEntregavel && contextoDoEntregavel?.tipo === 'RECORRENTE' && !agendaJaCriada && agendaConfiavel && planejamentoDisponivel && podeAgendar &&
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-brand-green/35 bg-brand-green/[0.035] px-4 py-5 text-center">
        <button type="button" className="inline-flex items-center gap-2 text-sm font-bold text-brand-neon underline underline-offset-4 transition hover:brightness-125 focus-visible:outline-2 focus-visible:outline-brand-neon" onClick={e => {setFocoRetorno(e.currentTarget);setEntregavelRecorrente(entregavelIdInicial);setConfirmarGeracao(true);}}>＋ Gerar ocorrências</button>
        <p className="max-w-md text-xs text-foreground/65">Confirme a criação dos períodos planejados. Nenhuma ocorrência será gerada antes da confirmação.</p>
      </div>}
    {podeCriarBase && planejamentoDisponivel && !podeCriar && !podeGerar && <p data-pi-superficie role="status" className="rounded-lg border p-3 text-sm text-foreground/70">Para registrar ocorrências, crie ou reabra um entregável. Rotinas recorrentes usam a agenda; outros entregáveis podem ter registros descritivos ou quantitativos.</p>}
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
            <input type="date" className={`${CAMPO} max-w-full`} value={dataInicial} onChange={e => setDataInicial(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Data final
            <input type="date" className={`${CAMPO} max-w-full`} min={dataInicial || undefined} value={dataFinal} onChange={e => setDataFinal(e.target.value)} />
          </label>
          <label className="block min-w-0 text-xs font-semibold text-foreground/80">Situação
            <select aria-label="Filtrar situação das ocorrências" className={CAMPO_SELECT} value={situacaoFiltro} onChange={e => setSituacaoFiltro(e.target.value as typeof situacaoFiltro)}>
              <option value="TODAS">Todas</option>{abaOcorrencias === 'ATIVAS' && <><option value="NAO_INICIADO">Não iniciadas</option><option value="EM_ANDAMENTO">Em andamento</option></>}
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
      : agenda.loading ? <p role="status" className="rounded-xl border border-brand-green/20 p-5 text-sm">Carregando ocorrências...</p>
      : agenda.erro ? <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 p-4 text-sm text-error-text"><span>{agenda.erro}</span><button type="button" className={BOTAO} onClick={() => { void agenda.atualizar(); }}>Tentar novamente</button></div>
      : registros.length === 0 ? <p data-pi-superficie className="rounded-xl border border-dashed border-brand-green/25 p-6 text-sm text-foreground/65">{historico ? 'Nenhuma ocorrência arquivada neste entregável ou contrato.' : 'Nenhuma ocorrência nesta situação corresponde aos filtros.'}</p>
      : modoVisualizacao === 'CALENDARIO' ? <CalendarioOcorrencias registros={registros} periodicidade={entregavelDaConsulta?.periodicidade ?? 'DIARIA'} aoAbrir={abrirDetalhe} />
      : <ul aria-label="Lista de ocorrências" className="grid gap-3">{registros.map(o => {
        const cor = o.substituidaEm ? {titulo:'Arquivada',borda:'border-amber-500/40',fundo:'bg-amber-500/[0.11]',texto:'text-amber-600 dark:text-amber-300',badge:'bg-amber-500/10'} : ESTADOS[o.status] ?? ESTADOS.NAO_INICIADO;
        return <li key={o.id} data-ocorrencia-estado={o.status} className="relative min-w-0"><button type="button" aria-label={`Ver detalhes da ocorrência ${tituloApresentacao(o, periodos[o.entregavelId])}`} onClick={e => abrirDetalhe(o, e.currentTarget)}
          className={`pi-ocorrencia-card group w-full min-w-0 space-y-3 rounded-xl border p-4 text-left outline-none transition-colors duration-200 hover:brightness-100 focus-visible:ring-2 focus-visible:ring-current/45 sm:p-5 ${cor.borda} ${cor.fundo} ${cor.texto}`}>
          <span className="flex flex-wrap items-start justify-between gap-3"><span className={`min-w-0 flex-1 break-words font-semibold ${cor.texto}`}>{tituloApresentacao(o, periodos[o.entregavelId])}</span><span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cor.borda} ${cor.badge} ${cor.texto}`}>{cor.titulo}</span></span>
          <span className="flex flex-wrap items-center gap-3 text-sm text-foreground/75">
            {(o.periodoInicio || o.dataPrevista) && <time dateTime={o.periodoInicio || o.dataPrevista || ''}>
              {dataBR(o.periodoInicio || o.dataPrevista)}{o.periodoFim && o.periodoFim !== o.periodoInicio ? ` – ${dataBR(o.periodoFim)}` : ''}
            </time>}
            {o.modoRegistro === 'QUANTITATIVO' && o.metaQuantidade != null && <strong className="text-base tabular-nums">{o.metaQuantidade} {unidades[o.entregavelId] || 'unidades'}</strong>}
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
    {confirmarGeracao && <ModalEtapa titulo="Gerar ocorrências recorrentes" compacto contexto="Confirmação" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { if (!ocupado) setConfirmarGeracao(false); }}>
      <div className="space-y-4">
        <p className="text-sm text-foreground/80">Criar períodos faltantes sem alterar os já registrados.</p>
        <div data-pi-superficie className="rounded-xl border border-brand-green/20 bg-background/35 p-3 text-sm">
          <p><strong>Entregável:</strong> {recorrenteSelecionado?.nome ?? 'Não informado'}</p>
          <p className="mt-1"><strong>Início previsto:</strong> {dataBR(recorrenteSelecionado?.inicioPrevisto ?? null)}</p>
          <p className="mt-1"><strong>Término previsto:</strong> {dataBR(recorrenteSelecionado?.terminoPrevisto ?? null)}</p>
          <p className="mt-1"><strong>Periodicidade:</strong> {recorrenteSelecionado?.periodicidade ?? 'Não informada'}</p>
        </div>
        {(erro || !planejamentoCompleto) && <div role={erro ? 'alert' : 'status'} className="space-y-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          <p className="text-foreground/85">{erro || 'Antes de gerar, defina o início, o término e a periodicidade deste entregável.'}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTAO} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: false, foco: e.currentTarget })}>Abrir entregável</button>
            {podeEditarPlanejamento && <button type="button" data-pi-acao="contextual" className={BOTAO_AGENDA} onClick={e => setPlanejamento({ id: entregavelRecorrente, editar: true, foco: e.currentTarget })}>Editar planejamento</button>}
          </div>
        </div>}
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-green/15 pt-3">
          <button type="button" className={CANCELAR} disabled={ocupado} onClick={() => { setConfirmarGeracao(false); setErro(''); }}>Cancelar</button>
          <button type="button" data-pi-acao="primaria" className={PRINCIPAL} disabled={ocupado || !planejamentoCompleto} onClick={() => void gerarRecorrencias()}>{ocupado ? 'Gerando...' : 'Confirmar geração'}</button>
        </div>
      </div>
    </ModalEtapa>}
    {replanejar && <ModalEtapa titulo="Replanejar ocorrências" estreito contexto="Agenda recorrente" estadoContextual={estadoAcaoEntregavel} ocupado={ocupado} focoRetorno={focoRetorno} onFechar={()=>{setReplanejar(false);setImpacto(null);setErro('');}}>
      <form data-pi-formulario className="space-y-4" onSubmit={e=>{e.preventDefault();void calcularImpacto(false);}}>
        <p className="text-sm text-foreground/75">Defina o novo período e a periodicidade das ocorrências, dentro dos limites do entregável. Ocorrências concluídas permanecem com suas datas originais; registros conflitantes não concluídos serão arquivados sem reativação.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Início das ocorrências<input required disabled={ocupado} type="date" className={CAMPO} value={plano.inicioFuturo} onChange={e=>{setPlano(p=>({...p,inicioFuturo:e.target.value}));setImpacto(null);}} /></label>
          <label className="block text-sm">Término das ocorrências<input required disabled={ocupado} type="date" className={CAMPO} value={plano.terminoPrevisto} onChange={e=>{setPlano(p=>({...p,terminoPrevisto:e.target.value}));setImpacto(null);}} /></label>
        </div>
        <label className="block text-sm">Periodicidade<select disabled={ocupado} className={CAMPO_SELECT} value={plano.periodicidade} onChange={e=>{setPlano(p=>({...p,periodicidade:e.target.value}));setImpacto(null);}}>{['DIARIA','SEMANAL','MENSAL','TRIMESTRAL','SEMESTRAL','ANUAL'].map(v=><option key={v} value={v}>{({DIARIA:'Diária',SEMANAL:'Semanal',MENSAL:'Mensal',TRIMESTRAL:'Trimestral',SEMESTRAL:'Semestral',ANUAL:'Anual'} as Record<string,string>)[v]}</option>)}</select></label>
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
          <button type="submit" data-pi-acao="contextual" disabled={ocupado} className={BOTAO_AGENDA}>Analisar alterações</button>
          {impacto && <button type="button" data-pi-acao="primaria" disabled={ocupado} className={PRINCIPAL} onClick={()=>void calcularImpacto(true)}>Confirmar replanejamento</button>}
        </div>
      </form>
    </ModalEtapa>}
    {modalCadastro && <ModalEtapa titulo="Nova ocorrência" compacto camada="edicao" estadoContextual="normal" contexto={contextoEntregavel ? `Entregável: ${nomes[entregavelIdInicial] ?? 'selecionado'}` : "Ocorrências do contrato"} rotuloFechar="Fechar cadastro de ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setModalCadastro(false); setErro(''); }}>
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
        <label className="block text-sm font-medium">Título *<input className={CAMPO} required maxLength={255} placeholder="Ex.: Manutenção do laboratório A" value={form.titulo} onChange={e => setForm(v => ({ ...v, titulo: e.target.value }))}/></label>
        {form.modoRegistro === 'QUANTITATIVO' && <label className="block text-sm font-medium">Meta a executar{unidades[form.entregavelId] ? ` (${unidades[form.entregavelId]})` : ' (quantidade)'} *
          <input type="text" inputMode="decimal" maxLength={18} required className={CAMPO} value={form.metaQuantidade} onChange={e => setForm(v => ({ ...v, metaQuantidade: e.target.value }))} placeholder="Ex.: 20" />
          <span className="mt-1 block text-xs text-foreground/65">Exemplo: meta de 20 computadores. As atividades registrarão as parcelas efetivamente realizadas. A unidade de medida é definida no entregável.</span>
        </label>}
        <fieldset className="space-y-3 rounded-xl border border-brand-green/20 bg-brand-green/[0.035] p-3">
          <legend className="px-1 text-sm font-semibold">Período da ocorrência (opcional)</legend>
          <p className="text-xs text-foreground/65">O término define o prazo desta ocorrência.</p>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-green" checked={dataUnica} onChange={e => setDataUnica(e.target.checked)}/> Ocorrência prevista para um único dia</label>
          <div className={`grid gap-3 ${dataUnica ? '' : 'sm:grid-cols-2'}`}>
            <label className="block text-sm">{dataUnica ? 'Data prevista' : 'Início previsto'}<input type="date" className={CAMPO} value={form.periodoInicio} onChange={e => setForm(v => ({ ...v, periodoInicio: e.target.value }))}/></label>
            {!dataUnica && <label className="block text-sm">Término das ocorrências<input type="date" min={form.periodoInicio || undefined} className={CAMPO} value={form.periodoFim} onChange={e => setForm(v => ({ ...v, periodoFim: e.target.value }))}/></label>}
          </div>
        </fieldset>
        <label className="block text-sm">Observações<textarea rows={3} maxLength={3000} placeholder="Descreva a obrigação ou os detalhes do serviço." className={CAMPO} value={form.observacoes} onChange={e => setForm(v => ({ ...v, observacoes: e.target.value }))}/></label>
        <div className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4"><button data-pi-acao="secundaria" type="button" className={BOTAO} disabled={ocupado} onClick={() => { setModalCadastro(false); setErro(''); }}>Cancelar</button>
          <button data-pi-acao="primaria" type="submit" className={PRINCIPAL} disabled={!podeCriar || ocupado || (form.modoRegistro === 'QUANTITATIVO' && quantidadeDireta !== null) || !form.titulo.trim() || !form.entregavelId || (form.modoRegistro === 'QUANTITATIVO' && Number(form.metaQuantidade) <= 0)}>{ocupado ? 'Salvando...' : 'Registrar ocorrência'}</button></div>
      </form>
    </ModalEtapa>}
    {detalhe && <ModalEtapa titulo={tituloApresentacao(detalhe, periodos[detalhe.entregavelId])} compacto etiqueta={detalhe.substituidaEm ? 'Arquivada' : (ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).titulo} contexto="Detalhes da ocorrência" rotuloFechar="Fechar detalhes da ocorrência" ocupado={ocupado} focoRetorno={focoRetorno} onFechar={() => { setDetalhe(null); setEditando(false); setMostrarReabertura(false); setErro(''); }} estadoContextual={detalhe.substituidaEm ? 'arquivado' : (ESTADOS[detalhe.status] ?? ESTADOS.NAO_INICIADO).modal}
      retornoEsquerda mostrarXComVoltar somenteIconeFechar
      acoes={<>
      {podeEditar && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && <MenuAcoesObjeto rotulo="Fechar" disabled={ocupado}>
          <button type="button" disabled={ocupado || !podeSolicitarConclusao}
            title={semAtividadeVerificada ? 'É necessária ao menos uma atividade verificada, sem outras pendentes.' : undefined}
            className="rounded-lg border border-violet-500/45 bg-violet-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-400/30 disabled:bg-slate-500/15 disabled:text-foreground/45"
            onClick={() => void transicionar('solicitar-conclusao')}>✓ Solicitar conclusão</button>
          <button type="button" disabled={ocupado || podeSolicitarConclusao || haAtividadesPendentes}
            title={podeSolicitarConclusao ? 'A conclusão está disponível; o encerramento está desabilitado.' : haAtividadesPendentes ? 'Verifique ou arquive as atividades pendentes antes de solicitar encerramento.' : undefined}
            className="rounded-lg border border-purple-500/50 bg-purple-700 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:border-slate-400/30 disabled:bg-slate-500/15 disabled:text-foreground/45"
            onClick={() => { setMotivoEncerramento(''); setMostrarEncerramento(true); }}>⚑ Solicitar encerramento</button>
        </MenuAcoesObjeto>}
      {!editando && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO'].includes(detalhe.status) && <>
        {podeReabrir && <button type="button" className="rounded-lg border border-red-500/50 bg-red-600/15 px-3 py-2 text-sm font-semibold text-red-200 transition hover:bg-red-600/25 disabled:opacity-40" disabled={ocupado} onClick={e => { setFocoReabertura(e.currentTarget); setMotivoReabertura(''); setMostrarReabertura(true); }} title="Cancelar a solicitação e devolver à revisão">✕ Cancelar</button>}
        {podeConcluir && <button type="button" className={`rounded-lg border px-3 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40 ${detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'border-purple-500 bg-purple-700' : 'border-violet-500 bg-violet-700'}`} disabled={ocupado} onClick={() => void transicionar(detalhe.status === 'PENDENTE_ENCERRAMENTO' ? 'aprovar-encerramento' : 'concluir')}>✓ Aprovar</button>}
      </>}
      {!editando && podeEditarDetalhe && <button type="button" aria-label="Editar ocorrência"  title="Editar ocorrência" disabled={ocupado} onClick={() => setEditando(true)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border-0 bg-transparent text-current transition hover:bg-current/10 focus-visible:outline-2 focus-visible:outline-current"><IconeEngrenagem /></button>}
    </>}>
      {erro && <p role="alert" className="text-sm text-error-text">{erro}</p>}
      {!editando && semAtividadeVerificada && ['NAO_INICIADO','EM_ANDAMENTO','EM_REVISAO'].includes(detalhe.status) && <p role="note" className="text-xs text-foreground/65">Para solicitar conclusão, vincule ao menos uma atividade e verifique todas as atividades vinculadas.</p>}
      {!editando ? <div data-pi-superficie className="grid gap-x-4 gap-y-3 rounded-xl border p-3 text-sm sm:grid-cols-2">
        <p><strong>Registro:</strong> {detalhe.origem === 'RECORRENTE' ? 'Recorrente por período' : (detalhe.modoRegistro === 'DESCRITIVO' || detalhe.origem === 'MANUAL_DESCRITIVA') ? 'Descritivo, sem quantidade' : 'Quantitativo por unidades'}</p>
        <p><strong>Entregável:</strong> {nomes[detalhe.entregavelId] ?? 'Vinculado ao contrato'}</p>
        {descricaoPeriodo(detalhe, periodos[detalhe.entregavelId]) && <p><strong>{descricaoPeriodo(detalhe, periodos[detalhe.entregavelId])}</strong></p>}
        <p><strong>Período:</strong> {dataBR(detalhe.periodoInicio || detalhe.dataPrevista)}{detalhe.periodoFim && detalhe.periodoFim !== detalhe.periodoInicio ? ` – ${dataBR(detalhe.periodoFim)}` : ''}</p>
        <p><strong>Realizado:</strong> {dataBR(detalhe.dataRealizada)} {estaAtrasada(detalhe) && <span className="ml-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600 dark:text-amber-300">Atrasado</span>}</p>
        {detalhe.origem === 'MANUAL_QUANTITATIVA' && detalhe.modoRegistro !== 'DESCRITIVO' && <div className="grid gap-2 sm:grid-cols-3"><div className="rounded-lg border p-3"><span className="text-xs text-foreground/70">Meta</span><p className="font-semibold">{detalhe.metaQuantidade != null ? `${detalhe.metaQuantidade} ${unidades[detalhe.entregavelId] || 'unidades'}` : 'Não definida'}</p></div><div className="rounded-lg border p-3"><span className="text-xs text-foreground/70">Executado nas atividades</span><p className="font-semibold">{detalhe.quantidadeExecutada ?? detalhe.quantidadeRealizada ?? '—'} {unidades[detalhe.entregavelId] || 'unidades'}</p></div><div className="rounded-lg border p-3"><span className="text-xs text-foreground/70">Aprovado para avanço físico</span><p className="font-semibold">{detalhe.quantidadeAprovada ?? '—'} {unidades[detalhe.entregavelId] || 'unidades'}</p></div></div>}
        <p className="whitespace-pre-wrap break-words"><strong>Observações:</strong> {detalhe.observacoes || 'Não informadas'}</p>
        <div><strong>Atividades vinculadas:</strong>{detalhe.atividades ? detalhe.atividades.length ? <ul className="mt-2 space-y-2">{detalhe.atividades.map(a=><li key={a.id}><button type="button" className={`flex w-full flex-wrap items-center justify-between gap-3 rounded-xl border p-3 text-left text-sm transition-colors hover:brightness-110 focus-visible:outline-2 focus-visible:outline-current ${a.status === 'VERIFICADA' ? 'border-violet-500/55 bg-violet-500/10 text-violet-700 dark:text-violet-200' : a.status === 'ARQUIVADA' ? 'border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-200' : 'border-amber-400/50 bg-amber-500/5 text-foreground'}`} onClick={e => abrirAtividade(a.id, e.currentTarget)}><span className="font-semibold">{a.titulo}</span><span className="rounded-full border border-current/30 px-2 py-1 text-xs">{a.status === 'VERIFICADA' ? 'Verificada' : a.status === 'ARQUIVADA' ? 'Arquivada' : 'Registrada'}</span></button></li>)}</ul> : <p>Nenhuma atividade vinculada.</p> : <p>Consulta de vínculos indisponível ou em carregamento.</p>}</div>
      </div> : <form data-pi-formulario className="space-y-3" onSubmit={salvarEdicao}>

        <label className="block text-sm">Data realizada<input type="date" className={CAMPO} value={formEdicao.dataRealizada} onChange={e => setFormEdicao(v => ({ ...v, dataRealizada: e.target.value }))}/></label>
        {detalhe.metaQuantidade != null && <label className="block text-sm">Meta planejada desta ocorrência
          <input type="text" inputMode="decimal" className={CAMPO} value={formEdicao.metaQuantidade} onChange={e => setFormEdicao(v=>({...v,metaQuantidade:e.target.value}))}/>
          <span className="mt-1 block text-xs text-foreground/65">Somente pessoas com permissão de edição podem alterar esta meta. Não pode ser inferior ao já executado.</span>
        </label>}
        {detalhe.origem === 'MANUAL_QUANTITATIVA' && detalhe.modoRegistro !== 'DESCRITIVO' && detalhe.metaQuantidade == null && <label className="block text-sm">Quantidade realizada<input type="text" inputMode="decimal" className={CAMPO} value={formEdicao.quantidadeRealizada} onChange={e => setFormEdicao(v => ({ ...v, quantidadeRealizada: e.target.value }))}/></label>}
        <label className="block text-sm">Observações<textarea maxLength={3000} rows={3} className={CAMPO} value={formEdicao.observacoes} onChange={e => setFormEdicao(v => ({ ...v, observacoes: e.target.value }))}/></label>
        <div className="flex flex-wrap justify-end gap-2"><button data-pi-acao="secundaria" className={BOTAO} type="button" disabled={ocupado} onClick={() => setEditando(false)}>Cancelar edição</button><button data-pi-acao="primaria" className={PRINCIPAL} type="submit" disabled={ocupado || !podeEditarDetalhe}>{ocupado ? 'Salvando...' : 'Salvar alterações'}</button></div>
      </form>}
      {!editando && !detalhe.substituidaEm && <footer className="mt-4 flex flex-wrap items-center justify-end gap-2 border-t border-current/20 pt-3" aria-label="Ações da ocorrência">

        {podeReabrir && ['CONCLUIDO','ENCERRADA'].includes(detalhe.status) && <button type="button" className="rounded-lg border border-emerald-500/50 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500" disabled={ocupado} onClick={e => {setFocoReabertura(e.currentTarget);setMotivoReabertura('');setMostrarReabertura(true);}}>⟳ Reabrir</button>}

      </footer>}
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
        podeEditar={podeEditarPlanejamento} permissoes={acesso.dados?.permissoes} dentroModal iniciarEditando={planejamento.editar}
        focoRetorno={planejamento.foco} onFechar={() => { setPlanejamento(null); setErro(''); }} atualizar={async () => { await entregaveisConsulta.atualizar(); }} /> : null;
    })()}
    {atividadeSelecionada && <ModalEtapa titulo={atividadeDetalhe?.titulo ?? 'Detalhes da atividade'} contexto="Atividade vinculada à ocorrência"
      estadoContextual={atividadeDetalhe?.status === 'VERIFICADA' ? 'concluido' : atividadeDetalhe?.status === 'ARQUIVADA' ? 'arquivado' : 'pendente'}
      camada="aninhada" compacto ocupado={verificandoAtividade} focoRetorno={atividadeSelecionada.foco}
      onFechar={() => { setAtividadeSelecionada(null); setAtividadeDetalhe(null); setAtividadeErro(''); }}
      acoes={(atividadeDetalhe?.status === 'REGISTRADA' ? podeSolicitarAtividade : atividadeDetalhe?.status === 'PENDENTE_CONCLUSAO' && podeVerificarAtividade) && detalhe && !['PENDENTE_CONCLUSAO', 'PENDENTE_ENCERRAMENTO', 'CONCLUIDO', 'ENCERRADA'].includes(detalhe.status)
        ? <button type="button" data-pi-acao="primaria" className="inline-flex h-9 items-center gap-2 rounded-lg border border-violet-500/65 bg-violet-600 px-3 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45"
          disabled={verificandoAtividade} onClick={() => void verificarAtividadeVinculada()}>✓ {verificandoAtividade ? 'Processando...' : atividadeDetalhe?.status === 'REGISTRADA' ? 'Solicitar conclusão' : 'Aprovar'}</button> : undefined}>
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
        {atividadeDetalhe.observacoes && <div data-pi-superficie className="rounded-xl border p-3"><h4 className="text-xs font-semibold uppercase text-foreground/70">Observações</h4><p className="mt-2 whitespace-pre-wrap break-words">{atividadeDetalhe.observacoes}</p></div>}
        {atividadeDetalhe.status === 'PENDENTE_CONCLUSAO' && !podeVerificarAtividade && <p className="text-xs text-foreground/65">A aprovação exige permissão de verificar atividades neste contrato.</p>}
        {detalhe && ['PENDENTE_CONCLUSAO','PENDENTE_ENCERRAMENTO','CONCLUIDO','ENCERRADA'].includes(detalhe.status) && <p className="text-xs text-foreground/65">A ocorrência está protegida: alterações nas atividades vinculadas foram bloqueadas.</p>}
      </div>}
    </ModalEtapa>}
  </section>;
}
