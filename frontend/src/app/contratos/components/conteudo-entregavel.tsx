'use client';
import { BotaoDesvincularMeta } from '@/app/components/botao-desvincular-meta';
import { BotaoExcluirModal, BotaoAcaoModal } from '@/app/components/botoes-modal';
import {ContadoresVinculos} from '@/app/components/contadores-vinculos';
import {itensVinculosEvidencia} from '@/lib/vinculos-evidencia';

import { MenuAcoesObjeto } from '@/app/components/menu-acoes-objeto';
import { AbasRolaveis } from '@/app/components/abas-rolaveis';
import { resultadoFinalizacao } from '@/lib/finalizados';
import { IconeStatus } from '@/app/components/icones-status';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { dataPlanejada, ROTULOS_PERIODICIDADE, ROTULOS_TIPO, type Entregavel, type ResumoDocumentalEntregavel } from '@/lib/entregaveis';
import { EditorVinculosEvidencia, type VinculosCadastroEvidencia } from './editor-vinculos-evidencia';
import { PainelComprovacaoEvidencia } from './painel-comprovacao-evidencia';
import { listarEvidenciasArquivadas, alterarArquivoEvidencia, criarEvidenciaEsperada, enviarComprovante, consultarEvidencia, reabrirEvidencia, excluirEvidenciaArquivada, CLASSE_STATUS, ROTULO_STATUS, categoriaVisivelEvidencia, validarDetalheEvidencia, type StatusComprovante, type DetalheEvidencia, type RascunhoEnvioEvidencia, aceitarArquivoEvidencia, arquivoCompativelEvidencia } from '@/lib/comprovantes';
import { useEstadoCalendario, hojeCalendario } from './estado-calendario';
import { PainelContinuo } from './painel-continuo';
import { CalendarioRegistros } from './calendario-registros';
import { ModalEtapa, type NavegacaoCadastroRegistro } from './modal-etapa';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
import { HistoricoEntregavel } from './historico-entregavel';
import { AtividadesVinculadas } from './atividades-vinculadas';
import { IconeEvidencia } from './icone-evidencia';
import { estadoVisualEvidencia } from '@/lib/estado-visual-evidencia';
import { estadoDoObjeto } from '@/lib/identidade-operacional';
import { nomeArquivoLegivel } from '@/lib/nome-arquivo';
import { rotuloCodigoPublico } from '@/lib/codigos-publicos';
import { toastSucesso, toastAviso } from '@/app/components/toast-notificacoes';
import { ExecucoesEntregavel, type CadastroExecucao, type OrigemExecucao, type RetornoCadastroRegistro } from './execucoes-entregavel';
import { ModalCadastroAtividade } from '@/app/atividades/components/modal-cadastro-atividade';
import { CartaoAtividade } from '@/app/atividades/components/cartao-atividade';
import { consultarAtividade, type Atividade } from '@/hooks/use-atividades';
import { sincronizarContrato } from '@/lib/sincronizar-contrato';
import { sincronizarEvidenciaCompartilhada, EVENTO_REGISTROS_COMPARTILHADOS } from '@/lib/sincronizar-evidencia-compartilhada';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import type { PermissoesContrato } from '@/lib/contratos';

import { PainelOcorrencias as PainelOcorrenciasEntregavel } from '@/app/ocorrencias/components/painel-ocorrencias';

type Campo = [nome: string, valor: string | null | undefined];
function Quadro({ campos }: { campos: Campo[] }) {
  return <section data-pi-informacoes-neutras className="min-w-0 pi-quadro-info">
    <dl className="pi-grade-informacoes-contrato grid min-w-0 sm:grid-cols-2 text-sm">
      {campos.map(([nome, valor]) => <div key={nome} className={`min-w-0 ${['Descrição','Observações','Critério operacional'].includes(nome) ? 'col-span-full border-t border-current/15 pt-3' : ''}`}><dt className="text-xs text-foreground/60">{nome}</dt>
        <dd className="mt-0.5 whitespace-pre-wrap break-words text-sm">{valor?.trim() || 'Não informado'}</dd></div>)}
    </dl>
  </section>;
}
export function ConteudoEntregavel({ item, resumoInicial, podeEditarEsperada = false, podeCriarEvidencia,
  podeArquivarEvidencia, podeReativarEvidencia = false, podeReabrirEvidencia = false, podeExcluirEvidenciaArquivada = false, podeAlterarObrigatoriedade = false, podeEnviarComprovantes = false, podeVerHistorico = false, bloqueadoPorPai = false, paiArquivado = false, paiConcluido = false, contextoModal = false, regularizacaoDocumental = false, somenteLeituraExecucao = false, permissoesExecucao, aoAtualizarEsperada,
  registrarVoltaEvidencia, registrarVoltaEdicao, interno = false, origemRegistro, evidenciaAvulsa, focoAvulso, aoFecharAvulso, aoCriarEvidencia, cadastroSomenteDocumental=false, acaoDesvincularMeta, navegacaoExterna }:  {
  navegacaoExterna?:NavegacaoCadastroRegistro; acaoDesvincularMeta?:()=>void; cadastroSomenteDocumental?:boolean; aoCriarEvidencia?:(id:string)=>void; evidenciaAvulsa?: DetalheEvidencia; focoAvulso?: HTMLElement|null; aoFecharAvulso?:()=>void; origemRegistro?: OrigemExecucao; interno?: boolean; participacao?: number | null;
  item: Entregavel; resumoInicial?: ResumoDocumentalEntregavel; podeEditarEsperada?: boolean;
  podeCriarEvidencia?: boolean; podeArquivarEvidencia?: boolean; podeReativarEvidencia?: boolean; podeReabrirEvidencia?: boolean; podeExcluirEvidenciaArquivada?: boolean; podeAlterarObrigatoriedade?: boolean;
  podeEnviarComprovantes?: boolean; podeVerHistorico?: boolean; bloqueadoPorPai?: boolean; paiArquivado?: boolean; paiConcluido?: boolean; paiEmRevisao?: boolean; contextoModal?: boolean; regularizacaoDocumental?: boolean; somenteLeituraExecucao?:boolean; permissoesExecucao?:PermissoesContrato;
  aoAtualizarEsperada?: (cacheAtualizado?: boolean) => void;
  registrarVoltaEvidencia?: (voltar: (() => void) | null) => void;
  registrarVoltaEdicao?: (voltar: (() => void) | null) => void;
}) {
  const [evidenciaId, setEvidenciaId] = useState<string | null>(evidenciaAvulsa?.id??null);
  // Uma listagem válida não garante que o detalhe da evidência seja íntegro.
  // O cabeçalho só libera edição após a consulta do painel individual.
  const [integridadeDetalhe, setIntegridadeDetalhe] = useState<{ id: string; valida: boolean } | null>(null);
  const registrarIntegridadeDetalhe = useCallback((id: string, valida: boolean) => {
    setIntegridadeDetalhe(anterior => anterior?.id === id && anterior.valida === valida ? anterior : { id, valida });
  }, []);
  const [edicaoAberta, setEdicaoAberta] = useState(false);
  const voltarEdicaoRef = useRef<(() => void) | null>(null);
  // Um history.back() do editor retorna primeiro à evidência, não à etapa.
  const ignorarRetornoEditor = useRef(false);
  const registrarEditor = useCallback((voltar: (() => void) | null) => {
    if (!voltar && voltarEdicaoRef.current && window.history.state?.__edicaoEvidencia)
      ignorarRetornoEditor.current = true;
    voltarEdicaoRef.current = voltar; setEdicaoAberta(Boolean(voltar)); registrarVoltaEdicao?.(voltar);
  }, [registrarVoltaEdicao]);
  const [versaoEstado, setVersaoEstado] = useState(0);
  useEffect(() => {
    const atualizar = () => setVersaoEstado(v => v + 1);
    window.addEventListener(EVENTO_REGISTROS_COMPARTILHADOS, atualizar);
    return () => window.removeEventListener(EVENTO_REGISTROS_COMPARTILHADOS, atualizar);
  }, []);
  const [ocultasLocais, setOcultasLocais] = useState<string[]>([]);
  const evidenciasAtivas = item.evidenciasEsperadas.filter(e => !ocultasLocais.includes(e.id));
  // Estado persistido do entregável prevalece sobre qualquer permissão de envio.
  const concluidoSemReabertura = ['CONCLUIDO', 'CONCLUIDO_PARCIALMENTE', 'FINALIZADO', 'PENDENTE_CONCLUSAO', 'PENDENTE_CONCLUSAO_PARCIAL', 'PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '') && !item.reabertoEm;
  const documentosBloqueados = ['CONCLUIDO','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(item.statusExecucao ?? '') && !item.reabertoEm;
  const regularizacaoAtiva = regularizacaoDocumental && item.statusExecucao === 'CONCLUIDO_PARCIALMENTE';
  const comprovantesHabilitados = podeEnviarComprovantes && (!bloqueadoPorPai || regularizacaoAtiva) && !paiArquivado && !paiConcluido && !item.arquivadoEm && !documentosBloqueados;
  const planejamentoHabilitado = !bloqueadoPorPai && !paiArquivado && !paiConcluido && !item.arquivadoEm && !concluidoSemReabertura;
  const cadastroDocumentalHabilitado = planejamentoHabilitado || (regularizacaoAtiva && !paiArquivado && !paiConcluido && !item.arquivadoEm && (podeCriarEvidencia ?? podeEditarEsperada));
  const [historicoExpandido, setHistoricoExpandido] = useState(false);
  const chaveEvidencias = `${item.contratoId}:${item.id}:${item.evidenciasEsperadas.map(e => e.id).join(',')}:${versaoEstado}`;
  const [consultaStatus, setConsultaStatus] = useState<{ chave: string; status: Record<string, { status: StatusComprovante; arquivo: string | null; reabertoEm?: string | null; vinculos: ReturnType<typeof itensVinculosEvidencia> }> }>({ chave: '', status: {} });
  const statusInicialCarregado = item.evidenciasEsperadas.length === 0 ||
    consultaStatus.chave === chaveEvidencias;
  const [detalheConfirmado,setDetalheConfirmado] = useState<{chave:string;detalhe:DetalheEvidencia}|null>(()=>evidenciaAvulsa?{chave:chaveEvidencias,detalhe:evidenciaAvulsa}:null);
  const [evidenciaAbertaId,setEvidenciaAbertaId]=useState<string|null>(evidenciaAvulsa?.id??null);
  const [falhaAberturaEvidencia,setFalhaAberturaEvidencia]=useState<string|null>(null);
  useEffect(()=>{
    if(!evidenciaId||evidenciaAbertaId===evidenciaId||falhaAberturaEvidencia===evidenciaId)return;
    const abortador=new AbortController();
    void consultarEvidencia(item.contratoId,item.id,evidenciaId,abortador.signal).then(d=>{
      validarDetalheEvidencia(d);
      if(d.id!==evidenciaId||d.contratoId!==item.contratoId||d.entregavelId!==item.id)throw new Error('Evidência indisponível.');
      if(!abortador.signal.aborted){setDetalheConfirmado({chave:chaveEvidencias,detalhe:d});setEvidenciaAbertaId(evidenciaId);}
    }).catch(()=>{if(!abortador.signal.aborted)setFalhaAberturaEvidencia(evidenciaId);});
    return ()=>abortador.abort();
  },[evidenciaId,evidenciaAbertaId,falhaAberturaEvidencia,item.contratoId,item.id,chaveEvidencias]);
  const registrarDetalheAtualizado = useCallback((detalhe:DetalheEvidencia) => {
    setDetalheConfirmado({chave:chaveEvidencias,detalhe});
  },[chaveEvidencias]);
  const confirmado = detalheConfirmado?.chave === chaveEvidencias && detalheConfirmado.detalhe.id === evidenciaId ? detalheConfirmado.detalhe : null;
  const temStatusAnterior = consultaStatus.chave.startsWith(`${item.contratoId}:${item.id}:`);
  const estadoEvidencias = { ...(statusInicialCarregado || temStatusAnterior ? consultaStatus.status : {}), ...(confirmado ? {[confirmado.id]:{status:confirmado.status,arquivo:confirmado.versoes[0]?.nomeOriginal ?? null,reabertoEm:confirmado.reabertoEm,vinculos:itensVinculosEvidencia(confirmado)}} : {}) };

  const [focoRetornoEvidencia, setFocoRetornoEvidencia] = useState<HTMLElement | null>(focoAvulso??null);
  useEffect(() => {
    let ativo = true;
    // Máximo de dez registros por entregável. Uma consulta sem sucesso não vira
    // falsamente 'aguardando envio'; o status fica indisponível.
    // A chave inclui a lista de IDs, sem depender da identidade instável do array da API.
    const ids = chaveEvidencias.split(':')[2]?.split(',').filter(Boolean) ?? [];
    if (!ids.length || item.tipo==='CONTINUO') return;
    void Promise.allSettled(ids.map(id => consultarEvidencia(item.contratoId, item.id, id)))
      .then(resultados => { if (!ativo) return;
        const mapa: Record<string, { status: StatusComprovante; arquivo: string | null; reabertoEm?: string | null; vinculos: ReturnType<typeof itensVinculosEvidencia> }> = {};
        resultados.forEach((resultado, indice) => {
          const detalhe = resultado.status === 'fulfilled' ? resultado.value : null;
          // Respostas HTTP podem estar malformadas apesar da tipagem estática.
          // Um erro num registro não pode derrubar o checklist inteiro nem
          // transformar situação desconhecida em comprovação verificada.
          if (detalhe && detalhe.id === ids[indice] &&
            detalhe.contratoId === item.contratoId && detalhe.entregavelId === item.id &&
            Array.isArray(detalhe.versoes) &&
            ['SEM_ENVIO', 'PENDENTE_VERIFICACAO', 'VERIFICADA', 'REJEITADA'].includes(detalhe.status))
            mapa[ids[indice]] = { status: detalhe.status, arquivo: detalhe.versoes[0]?.nomeOriginal ?? null, reabertoEm: detalhe.reabertoEm, vinculos:itensVinculosEvidencia(detalhe) };
        });
        setConsultaStatus({ chave: chaveEvidencias, status: mapa });
      });
    return () => { ativo = false; };
  }, [chaveEvidencias, item.contratoId, item.id]);
  const atualizarEstadoEvidencias = () => setVersaoEstado(numero => numero + 1);
  const [confirmarReabertura, setConfirmarReabertura] = useState<string | null>(null);
  const [motivoEvidencia, setMotivoEvidencia] = useState('');
  const [confirmarArquivamento, setConfirmarArquivamento] = useState<string | null>(null);
  const [arquivandoItem, setArquivandoItem] = useState(false);
  async function executarReaberturaEvidencia() {
    const id = confirmarReabertura;
    if (!id || arquivandoItem || item.regularizacaoDocumentalSolicitada || (bloqueadoPorPai && !regularizacaoAtiva) || !podeReabrirEvidencia) return;
    setArquivandoItem(true); setErroArquivo('');
    try {
      await reabrirEvidencia(item.contratoId, item.id, id, motivoEvidencia.trim());
      setConfirmarReabertura(null); setMotivoEvidencia('');
      toastSucesso('A evidência foi encaminhada para nova verificação.', 'Evidência reaberta');
      // A decisão já foi persistida. Uma falha de consulta não desfaz a reabertura.
      const atualizado = await consultarEvidencia(item.contratoId, item.id, id).then(detalhe => {
        validarDetalheEvidencia(detalhe);
        return detalhe.id === id && detalhe.contratoId === item.contratoId && detalhe.entregavelId === item.id ? detalhe : undefined;
      }).catch(() => undefined);
      atualizarEvidenciaIntegrada(atualizado);
    } catch (erro) { setErroArquivo(erro instanceof Error ? erro.message : 'Não foi possível reabrir a evidência.'); }
    finally { setArquivandoItem(false); }
  }
  async function arquivarEvidenciaDireta() {
    const id = confirmarArquivamento;
    if (!id || arquivandoItem) return;
    setArquivandoItem(true); setErroArquivo('');
    try {
      await alterarArquivoEvidencia(item.contratoId, item.id, id, 'arquivar');
      setConfirmarArquivamento(null);
      setOcultasLocais(atuais => [...new Set([...atuais, id])]);
      // A lista local muda imediatamente; o refresh não esconde/recria o modal.
      if (evidenciaId === id) voltarAoEntregavel();
      toastAviso('Evidência arquivada.');
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
      void listarEvidenciasArquivadas(item.contratoId, item.id).then(setArquivadas).catch(() => {});
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível arquivar a evidência.'); }
    finally { setArquivandoItem(false); }
  }
  const estadoProprioEntregavel = estadoDoObjeto({objeto:'entregavel',status:item.statusExecucao,arquivado:Boolean(item.arquivadoEm),reaberto:Boolean(item.reabertoEm),pendenteConclusao:Boolean(item.regularizacaoDocumentalSolicitada)});
  const classeAbaAtiva = 'pi-aba-entregavel-ativa';
  const hoje=hojeCalendario();
  const calendario=useEstadoCalendario(item.tipo==='CONTINUO'?(item.inicioPrevisto&&hoje<item.inicioPrevisto?item.inicioPrevisto:item.terminoPrevisto&&hoje>item.terminoPrevisto?item.terminoPrevisto:hoje):undefined);
  const [secaoSelecionada, setSecaoSelecionada] = useState<'ocorrencias' | 'atividades' | 'evidencias' | 'execucoes'>(contextoModal ? (item.tipo==='UNICO'?'atividades':'ocorrencias') : 'evidencias');
  const [listaAberta,setListaAberta]=useState<'ocorrencias'|'atividades'|'evidencias'|'execucoes'|null>(null);
  const [listaExecucoes,setListaExecucoes]=useState(false);
  const [ocorrenciasVisitadas, setOcorrenciasVisitadas] = useState(contextoModal && item.tipo!=='UNICO');
  const [abaChecklist, setAbaChecklist] = useState<'ativas' | 'pendentes' | 'revisao' | 'concluidas' | 'arquivadas'>('ativas');
  const abrirArquivo = abaChecklist === 'arquivadas';
  const [arquivadas, setArquivadas] = useState<Array<{ id: string; codigoPublico?: number; tipoEvidencia: string; obrigatoria: boolean; arquivadoEm: string | null }>>([]);
  const selecionadaBase = (abrirArquivo ? arquivadas.find(e => e.id === evidenciaId) : undefined) ?? item.evidenciasEsperadas.find(e => e.id === evidenciaId) ?? arquivadas.find(e => e.id === evidenciaId) ?? (confirmado?.id===evidenciaId?confirmado:undefined) ?? (evidenciaAvulsa?.id===evidenciaId?evidenciaAvulsa:undefined);
  const selecionada = selecionadaBase && confirmado?.id === selecionadaBase.id
    ? { ...selecionadaBase, tipoEvidencia: confirmado.tipoEvidencia, obrigatoria: confirmado.obrigatoria, arquivadoEm: confirmado.arquivadoEm ?? null }
    : selecionadaBase;
  const [criandoEvidencia, setCriandoEvidencia] = useState(false);
  const [dataAcompanhamento,setDataAcompanhamento]=useState('');
  const [contribuicaoCadastro,setContribuicaoCadastro]=useState<CadastroExecucao>({});
  const [vinculosCadastro,setVinculosCadastro]=useState<VinculosCadastroEvidencia>({ocorrencias:[],atividades:[]});
  const [navegacaoRegistro,setNavegacaoRegistro]=useState<(RetornoCadastroRegistro & { ativa: OrigemExecucao; gatilho: HTMLElement })|null>(null);
  const [cadastroAtividade,setCadastroAtividade]=useState<{dados:CadastroExecucao;gatilho:HTMLElement}|null>(null);
  const [cadastroOcorrencia,setCadastroOcorrencia]=useState<{gatilho:HTMLElement;metaQuantidade?:string;dataInicial?:string}|null>(null);
  const [detalheOcorrencia,setDetalheOcorrencia]=useState<string|null>(null);
  const [detalheAtividade,setDetalheAtividade]=useState<Atividade|null>(null);
  const [erroExecucao,setErroExecucao]=useState('');
  const cacheExecucao=useRepositorioConsultasOpcional();
  const versaoDetalheExecucao=useRef(0);
  const atualizarExecucaoIntegrada=()=>{
    if(cacheExecucao)sincronizarContrato(cacheExecucao,item.contratoId);
    window.dispatchEvent(new CustomEvent('pi:estrutura-operacional-atualizada',{detail:{contratoId:item.contratoId,cacheAtualizado:Boolean(cacheExecucao)}}));
    setVersaoEstado(v=>v+1);aoAtualizarEsperada?.(Boolean(cacheExecucao));
  };
  function atualizarEvidenciaIntegrada(detalhe?: DetalheEvidencia) {
    if (detalhe && detalhe.id === evidenciaId && detalhe.contratoId === item.contratoId && detalhe.entregavelId === item.id) {
      setDetalheConfirmado({chave: `${item.contratoId}:${item.id}:${item.evidenciasEsperadas.map(e => e.id).join(',')}:${versaoEstado + 1}`, detalhe});
      registrarIntegridadeDetalhe(detalhe.id, true);
    }
    atualizarExecucaoIntegrada();
  }
  function cadastrarOrigem(origem:OrigemExecucao,dados:CadastroExecucao,gatilho:HTMLElement,navegacao?:RetornoCadastroRegistro){
    if(item.tipo==='CONTINUO'&&!dados.dataInicial){const dia=calendario.dia;dados={...dados,dataInicial:item.inicioPrevisto&&dia<item.inicioPrevisto?item.inicioPrevisto:item.terminoPrevisto&&dia>item.terminoPrevisto?item.terminoPrevisto:dia};}
    setErroExecucao('');
    setNavegacaoRegistro(navegacao?{...navegacao,ativa:origem,gatilho}:null);
    if(origem==='EVIDENCIA'){setDataAcompanhamento(item.tipo==='CONTINUO'?dados.dataInicial??calendario.dia:'');setContribuicaoCadastro(regularizacaoAtiva||cadastroSomenteDocumental?{}:dados);setVinculosCadastro({ocorrencias:!regularizacaoAtiva&&!cadastroSomenteDocumental&&dados.ocorrenciaId&&dados.origemQuantidade!=='COMPROVACAO'&&!dados.comprovaExecucaoId?[dados.ocorrenciaId]:[],atividades:[]});abrirCadastro();}
    else if(origem==='ATIVIDADE')setCadastroAtividade({dados,gatilho});
    else if(origem==='OCORRENCIA')setCadastroOcorrencia({gatilho,metaQuantidade:dados.metaQuantidade,dataInicial:dados.dataInicial});
  }
  function abrirOrigem(origem:OrigemExecucao,id:string,gatilho:HTMLElement){
    const v=++versaoDetalheExecucao.current;setErroExecucao('');
    if(origem==='EVIDENCIA')abrirEvidencia(gatilho,id);
    else if(origem==='OCORRENCIA')setDetalheOcorrencia(id);
    else if(origem==='ATIVIDADE')void consultarAtividade(item.contratoId,id).then(a=>{if(versaoDetalheExecucao.current===v)setDetalheAtividade(a);}).catch(e=>{if(versaoDetalheExecucao.current===v)setErroExecucao(e instanceof Error?e.message:'Não foi possível abrir a atividade.');});
  }
  useEffect(()=>()=>{versaoDetalheExecucao.current++;},[]);
  const [novoTipo, setNovoTipo] = useState('');
  const [novaDescricao, setNovaDescricao] = useState('');
  const [novaObrigatoria, setNovaObrigatoria] = useState(true);
  const [novoArquivo, setNovoArquivo] = useState<File | null>(null);
  const [novaEvidenciaCriadaId, setNovaEvidenciaCriadaId] = useState<string | null>(null);
  const [erroCadastro, setErroCadastro] = useState('');
  const [salvandoNova, setSalvandoNova] = useState(false);
  const historicoCadastro = useRef<string | null>(null);
  const sequenciaCadastro = useRef(0);
  function fecharCadastro(forcar = false, encerrarAvulso = true) {
    if (salvandoNova && !forcar) return;
    setCriandoEvidencia(false); setDataAcompanhamento(''); setContribuicaoCadastro({}); setVinculosCadastro({ocorrencias:[],atividades:[]});
    setNovoArquivo(null); setNovoTipo(''); setNovaDescricao(''); setNovaObrigatoria(true);
    setNovaEvidenciaCriadaId(null); setErroCadastro('');
    registrarVoltaEvidencia?.(null);
    const marcador = historicoCadastro.current;
    historicoCadastro.current = null;
    if (marcador && window.history.state?.__cadastroEvidencia === marcador) {
      const estado = { ...window.history.state };
      delete estado.__cadastroEvidencia;
      window.history.replaceState(estado, '', window.location.href);
    }
    setNavegacaoRegistro(null);
    if(encerrarAvulso)aoFecharAvulso?.();
  }
  function trocarOrigemRegistro(origem:OrigemExecucao) {
    const nav=navegacaoRegistro;
    if(!nav||!nav.opcoes[origem]||nav.ativa===origem)return;
    if(criandoEvidencia)fecharCadastro(true,false);
    setCadastroAtividade(null);setCadastroOcorrencia(null);
    if(origem==='MANUAL'){setNavegacaoRegistro(null);nav.voltarManual();return;}
    cadastrarOrigem(origem,{},nav.gatilho,nav);
  }
  const navegacaoDoRegistro: NavegacaoCadastroRegistro|undefined = navegacaoExterna??(navegacaoRegistro ? {ativa:navegacaoRegistro.ativa,opcoes:navegacaoRegistro.opcoes,selecionar:trocarOrigemRegistro}:undefined);
  function abrirCadastro() {
    if (criandoEvidencia) { fecharCadastro(); return; }
    const marcador = `cadastro-evidencia:${item.id}:${++sequenciaCadastro.current}`;
    const anterior = window.history.state;
    window.history.pushState({ ...(anterior && typeof anterior === 'object' ? anterior : {}), __cadastroEvidencia: marcador }, '', window.location.href);
    historicoCadastro.current = marcador;
    setErroCadastro(''); setNovaEvidenciaCriadaId(null); setCriandoEvidencia(true);
    registrarVoltaEvidencia?.(fecharCadastro);
  }
  useEffect(()=>()=>{const marcador=historicoCadastro.current;if(marcador&&window.history.state?.__cadastroEvidencia===marcador){const estado={...window.history.state};delete estado.__cadastroEvidencia;window.history.replaceState(estado,'',window.location.href);}},[]);
  useEffect(() => {
    function aoVoltarCadastro() {
      const marcador = historicoCadastro.current;
      if (!marcador || window.history.state?.__cadastroEvidencia === marcador) return;
      historicoCadastro.current = null;
      setCriandoEvidencia(false); setDataAcompanhamento(''); setContribuicaoCadastro({}); setVinculosCadastro({ocorrencias:[],atividades:[]});setNavegacaoRegistro(null);
      registrarVoltaEvidencia?.(null);
      aoFecharAvulso?.();
    }
    window.addEventListener('popstate', aoVoltarCadastro);
    return () => window.removeEventListener('popstate', aoVoltarCadastro);
  }, [registrarVoltaEvidencia, aoFecharAvulso]);
  async function adicionarEvidencia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (salvandoNova || !cadastroDocumentalHabilitado || !(podeCriarEvidencia ?? podeEditarEsperada)) return;
    if (novoArquivo && !comprovantesHabilitados) {setErroCadastro('Seu perfil ou a situação do entregável não permite anexar arquivos.');return;}
    if ([contribuicaoCadastro.percentual,contribuicaoCadastro.quantidade].some(v=>v!==undefined&&(!v.trim()||!Number.isFinite(Number(v.replace(',','.')))||Number(v.replace(',','.'))<=0)) || Number(contribuicaoCadastro.percentual?.replace(',','.'))>100) {setErroCadastro('Informe uma contribuição válida e positiva.');return;}
    if (novoArquivo && !arquivoCompativelEvidencia(novoTipo, novoArquivo)) { setErroCadastro('O arquivo não corresponde ao tipo Foto ou Relatório selecionado.'); return; }
    if (!novaEvidenciaCriadaId && novoTipo.trim().length > 50) { setErroCadastro('O tipo deve ter no máximo 50 caracteres.'); return; }
    setErroCadastro(''); setSalvandoNova(true);
    let id = novaEvidenciaCriadaId;
    const rascunho: RascunhoEnvioEvidencia = {};
    if (contribuicaoCadastro.quantidade) {
      rascunho.quantidadeExecutada=contribuicaoCadastro.quantidade.replace(',','.');
      rascunho.origemQuantidade=contribuicaoCadastro.origemQuantidade??'NOVA_EXECUCAO';
      rascunho.referenciaExecucao=contribuicaoCadastro.referenciaExecucao??crypto.randomUUID();
      if(contribuicaoCadastro.ocorrenciaId&&contribuicaoCadastro.ocorrenciaId!=='direta')rascunho.ocorrenciaQuantidadeId=contribuicaoCadastro.ocorrenciaId;
    }
    if(contribuicaoCadastro.percentual)rascunho.percentualExecucao=contribuicaoCadastro.percentual.replace(',','.');
    if(contribuicaoCadastro.comprovaExecucaoId)rascunho.comprovaExecucaoId=contribuicaoCadastro.comprovaExecucaoId;
    if((rascunho.percentualExecucao||rascunho.comprovaExecucaoId)&&contribuicaoCadastro.ocorrenciaId)rascunho.ocorrenciaExecucaoId=contribuicaoCadastro.ocorrenciaId;
    if(vinculosCadastro.ocorrencias.length)rascunho.ocorrenciasVinculadas=vinculosCadastro.ocorrencias.join(',');
    if(vinculosCadastro.atividades.length)rascunho.atividadesVinculadas=vinculosCadastro.atividades.join(',');
    if(vinculosCadastro.destinos?.length)rascunho.destinosCompartilhados=JSON.stringify(vinculosCadastro.destinos.map(d=>({...d,ocorrenciaId:d.quantidadeExecutada||d.percentualExecucao?d.ocorrenciaId:undefined})));
    try {
      if (!id) {
        const criada = await criarEvidenciaEsperada(item.contratoId, item.id, {
          tipoEvidencia: novoTipo.trim(), descricao: novaDescricao.trim() || null,
          ...(item.tipo==='CONTINUO'&&dataAcompanhamento?{dataAcompanhamento}:{}),
          obrigatoria: regularizacaoAtiva || cadastroSomenteDocumental ? false : podeAlterarObrigatoriedade ? novaObrigatoria : true,
          ...(!regularizacaoAtiva && !cadastroSomenteDocumental && Object.keys(rascunho).length?{rascunhoEnvio:rascunho}:{}),
        });
        id = criada.id;
        setNovaEvidenciaCriadaId(id);
        aoCriarEvidencia?.(id);
        // O cadastro já foi confirmado no banco; uma falha no upload não deve duplicá-lo.
      }
      if (novoArquivo && comprovantesHabilitados) {
        const enviado=await enviarComprovante(item.contratoId, item.id, id, novoArquivo, '');
        if(enviado?.grupoCompartilhadoId||vinculosCadastro.destinos?.length)sincronizarEvidenciaCompartilhada(cacheExecucao,item.contratoId);
      }
      setSalvandoNova(false); fecharCadastro(true); setNovoTipo(''); setNovaDescricao(''); setNovaObrigatoria(true);
      setNovoArquivo(null); setNovaEvidenciaCriadaId(null);
      if(vinculosCadastro.destinos?.length&&!novoArquivo)sincronizarEvidenciaCompartilhada(cacheExecucao,item.contratoId);
      atualizarExecucaoIntegrada();
    } catch (erro) {
      const mensagem=erro instanceof Error ? erro.message : 'Não foi possível adicionar a evidência.';
      if(id){
        // Metadados e declaração já persistidos. A recuperação ocorre no item existente.
        fecharCadastro(true,false);
        atualizarExecucaoIntegrada();
        if(vinculosCadastro.destinos?.length)sincronizarEvidenciaCompartilhada(cacheExecucao,item.contratoId);
        toastAviso(`Evidência cadastrada. O arquivo não foi enviado: ${mensagem}`);
        setEvidenciaId(id);
      }else setErroCadastro(mensagem);
    } finally { setSalvandoNova(false); }
  }
  const [erroArquivo, setErroArquivo] = useState('');
  const [ocupadoArquivo, setOcupadoArquivo] = useState(false);
  const [confirmarReativacao, setConfirmarReativacao] = useState<string | null>(null);
  const [confirmarExclusao, setConfirmarExclusao] = useState<string | null>(null);
  async function alternarArquivo() {
    if (abrirArquivo) { setEvidenciaId(null); setEvidenciaAbertaId(null); setFalhaAberturaEvidencia(null); setAbaChecklist('ativas'); return; }
    setErroArquivo('');
    try { const lista = await listarEvidenciasArquivadas(item.contratoId, item.id); setEvidenciaId(null); setEvidenciaAbertaId(null); setFalhaAberturaEvidencia(null); setArquivadas(lista); setAbaChecklist('arquivadas'); }
    catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Não foi possível consultar evidências arquivadas.'); }
  }
  async function reativar() {
    const id = confirmarReativacao;
    if (!id || ocupadoArquivo || !podeReativarEvidencia || bloqueadoPorPai) return;
    setOcupadoArquivo(true); setErroArquivo('');
    try {
      await alterarArquivoEvidencia(item.contratoId, item.id, id, 'reativar', motivoEvidencia.trim());
      // O item volta às ativas, mas permanece nesta aba de arquivadas.
      // Nenhum detalhe é aberto automaticamente após a atualização.
      if (evidenciaId === id) voltarAoEntregavel();
      setConfirmarReativacao(null); setMotivoEvidencia('');
      setArquivadas(anterior => anterior.filter(e => e.id !== id));
      setOcultasLocais(atuais => atuais.filter(valor => valor !== id));
      toastSucesso('Evidência reativada.');
      atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
    } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha na reativação.'); }
    finally { setOcupadoArquivo(false); }
  }
  // O painel de detalhe tem rolagem própria. Substituir sua árvore por um detalhe
  // pequeno reduz o scrollHeight e faz o navegador voltar o scrollTop para zero.
  // Capturamos a posição ANTES dessa troca e restauramos no commit do React,
  // antes da pintura, sem scrollIntoView e sem alterar a rolagem do contrato.
  const origem = useRef<{ area: HTMLElement | null; topo: number; esquerda: number;
    paginaY: number; paginaX: number; botao: HTMLElement; evidenciaId: string } | null>(null);
  const restaurarAoVoltar = useRef(false);
  const historicoEvidencia = useRef<string | null>(null);
  const sequenciaEvidencia = useRef(0);
  // Cada nivel de detalhe usa uma entrada própria no histórico; o botão voltar
  // do navegador retorna uma evidência ao entregável, sem fechar o modal-pai.
  useEffect(() => {
    const voltarHistorico = () => {
      const marcador = historicoEvidencia.current;
      if (!marcador) return;
      // As entradas aninhadas do editor herdam __modalEvidencia. O primeiro
      // Voltar fecha o editor; o segundo deve fechar a evidência, mesmo se
      // o roteador clonou o marcador para uma entrada intermediária.
      if (ignorarRetornoEditor.current) { ignorarRetornoEditor.current = false; return; }
      if (window.history.state?.__modalEvidencia === marcador) return;
      historicoEvidencia.current = null;
      restaurarAoVoltar.current = true;
      registrarVoltaEvidencia?.(null);

      setEvidenciaId(null); setEvidenciaAbertaId(null); setFalhaAberturaEvidencia(null);
    };
    window.addEventListener('popstate', voltarHistorico);
    return () => window.removeEventListener('popstate', voltarHistorico);
  }, [registrarVoltaEvidencia]);
  function abrirEvidencia(gatilho: HTMLElement, id: string) {
    if (evidenciaId) return; // Evita duplo clique duplicar o histórico e gerar duas camadas.
    const area = gatilho.closest<HTMLElement>('.overflow-y-auto');
    origem.current = { area, topo: area?.scrollTop ?? 0, esquerda: area?.scrollLeft ?? 0,
      paginaY: window.scrollY, paginaX: window.scrollX, botao: gatilho, evidenciaId: id };
    restaurarAoVoltar.current = false;
    ignorarRetornoEditor.current = false;
    setFocoRetornoEvidencia(gatilho);
    // Os controles inline são liberados individualmente após validar o detalhe.

    setIntegridadeDetalhe(null);
    const marcador = `evidencia:${item.id}:${id}:${++sequenciaEvidencia.current}`;
    const estado = window.history.state;
    window.history.pushState({ ...(estado && typeof estado === 'object' ? estado : {}), __modalEvidencia: marcador }, '', window.location.href);
    historicoEvidencia.current = marcador;
    registrarVoltaEvidencia?.(voltarAoEntregavel);
    setEvidenciaId(id);
  }
  function voltarAoEntregavel() {
    restaurarAoVoltar.current = true;
    registrarVoltaEvidencia?.(null);
    setEvidenciaId(null); setEvidenciaAbertaId(null); setFalhaAberturaEvidencia(null);

    setIntegridadeDetalhe(null);
    const marcador = historicoEvidencia.current;
    historicoEvidencia.current = null;
    ignorarRetornoEditor.current = false;
    // Mantém a rota: fechar/substituir uma evidência não pode navegar
    // o iframe nem o modal do contrato para trás no histórico.
    if (marcador && window.history.state?.__modalEvidencia === marcador) {
      const estado = { ...window.history.state };
      delete estado.__modalEvidencia;
      window.history.replaceState(estado, '', window.location.href);
    }
    aoFecharAvulso?.();
  }
  useLayoutEffect(() => {
    if (evidenciaId !== null || !restaurarAoVoltar.current) return;
    restaurarAoVoltar.current = false;
    const anterior = origem.current;
    origem.current = null;
    if (!anterior) return;
    if (anterior.area?.isConnected) {
      anterior.area.scrollTop = anterior.topo;
      anterior.area.scrollLeft = anterior.esquerda;
    } else if (window.scrollY !== anterior.paginaY || window.scrollX !== anterior.paginaX) {
      // Compatibilidade com a página completa (sem painel modal externo).
      window.scrollTo({ left: anterior.paginaX, top: anterior.paginaY, behavior: 'instant' });
    }
    // O botão original geralmente permanece montado sob a camada aninhada.
    // Localizamos pelo identificador estável para restaurar o foco,
    // dentro do mesmo painel, antes de restaurar o foco sem deslocar a rolagem.
    const raiz = anterior.area?.isConnected ? anterior.area : document;
    const botaoAtual = Array.from(raiz.querySelectorAll<HTMLButtonElement>('[data-evidencia-esperada-id]'))
      .find((botao) => botao.dataset.evidenciaEsperadaId === anterior.evidenciaId);
    if (botaoAtual?.isConnected) botaoAtual.focus({ preventScroll: true });
    else if (anterior.botao.isConnected) anterior.botao.focus({ preventScroll: true });
  }, [evidenciaId]);
  const campos: Campo[] = [
    ['Identificador', rotuloCodigoPublico(item.codigoPublico)], ['Código', item.codigo], ['Tipo', ROTULOS_TIPO[item.tipo]],
    ['Início previsto', dataPlanejada(item.inicioPrevisto)], ['Término previsto', dataPlanejada(item.terminoPrevisto)],
    ['Responsável cadastral', item.responsavel ? `${item.responsavel.nome || 'Nome não informado'} — ${item.responsavel.email}` : item.responsavelId ? 'Responsável atribuído' : null],
    ...(item.tipo === 'QUANTITATIVO' ? [
      ['Quantidade prevista', item.quantidadePrevista], ['Unidade de medida', item.unidadeMedida],
    ] as Campo[] : []),
    ...(item.tipo === 'RECORRENTE' ? [
      ['Periodicidade', item.periodicidade ? ROTULOS_PERIODICIDADE[item.periodicidade] : null],
      ['Configuração de recorrência', item.configuracaoPeriodicidade ? item.configuracaoPeriodicidade.modoRegistro === 'QUANTITATIVO' ? 'Quantitativa' : item.configuracaoPeriodicidade.modoRegistro === 'DESCRITIVO' ? 'Descritiva' : 'Definida na agenda' : null],
    ] as Campo[] : []),
    ['Peso operacional', item.peso === null ? null : `${Number(item.peso).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`],
    ['Descrição', item.descricao], ['Observações', item.observacoes],
    ...(item.criterioConclusao?.trim() ? [['Critério operacional', item.criterioConclusao]] as Campo[] : []),
  ];
  const evidenciaNaAba = (id: string): boolean => {
    const status = estadoEvidencias[id];
    if (abaChecklist === 'concluidas') return resultadoFinalizacao('evidencia', status?.status) === 'concluido';
    if (abaChecklist === 'revisao') return Boolean(status?.status === 'REJEITADA' || (status?.reabertoEm && status?.status !== 'VERIFICADA'));
    if (abaChecklist === 'pendentes') return Boolean(status && status.status !== 'VERIFICADA' && status.status !== 'REJEITADA' && !status.reabertoEm);
    return !status || status.status !== 'VERIFICADA'; // Ativas: pendentes e em revisão; verificadas têm sua própria aba.
  };
  const calendarioRegistros = <CalendarioRegistros calendario={calendario} contratoId={item.contratoId} entregavelId={item.id} contexto={secaoSelecionada} permissoes={somenteLeituraExecucao?undefined:permissoesExecucao} abrir={(id,origem)=>{if(secaoSelecionada==='evidencias'&&origem)abrirEvidencia(origem,id);}} abrirOcorrencia={setDetalheOcorrencia} abrirExecucao={(origem,id,gatilho)=>origem==='MANUAL'?setListaExecucoes(true):abrirOrigem(origem,id,gatilho)} />;
  return <><div data-pi-entregavel data-tec08-contexto-operacional data-tec08-estado={estadoProprioEntregavel} className="min-w-0 space-y-3">
    {interno && item.tipo!=='CONTINUO' ? <div className="space-y-2"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-foreground/70"><span>{dataPlanejada(item.inicioPrevisto)} — {dataPlanejada(item.terminoPrevisto)}</span></div></div> : null }
    <details open={!interno || undefined} data-pi-ficha-neutra className="pi-identificacao-contrato pi-informacoes-expansiveis"><summary className="text-sm font-semibold text-foreground">Informações do entregável</summary><Quadro campos={campos}/>
    {podeVerHistorico && <details data-pi-historico-neutro onToggle={evento => setHistoricoExpandido(evento.currentTarget.open)} className="pi-historico-compacto mt-3">
      <summary data-tec08-titulo-historico className="pi-historico-gatilho cursor-pointer text-sm font-semibold text-foreground/75">Histórico do entregável</summary>
      {historicoExpandido && <HistoricoEntregavel contratoId={item.contratoId} entregavelId={item.id} versao={versaoEstado} ocultarTitulo />}
    </details>}
    </details>
    {item.tipo==='CONTINUO'&&!origemRegistro?<PainelContinuo item={item} calendario={calendario} somenteLeitura={somenteLeituraExecucao||!planejamentoHabilitado} permissoes={somenteLeituraExecucao?undefined:permissoesExecucao} podeEvidencia={Boolean(cadastroDocumentalHabilitado&&(podeCriarEvidencia??podeEditarEsperada)&&(!regularizacaoAtiva||podeAlterarObrigatoriedade)&&(!somenteLeituraExecucao||regularizacaoAtiva)&&item.evidenciasEsperadas.filter(e=>e.dataAcompanhamento===calendario.dia).length<10)} onCadastro={cadastrarOrigem} onAbrir={(id,gatilho)=>{if(gatilho)abrirEvidencia(gatilho,id);}} onOcorrencia={setDetalheOcorrencia} onAtualizar={atualizarExecucaoIntegrada}/>:<div className="pi-workspace-entregavel"><aside className="pi-workspace-execucao" aria-label="Resumo da execução"><ExecucoesEntregavel navegacaoExterna={navegacaoExterna} somenteOrigem={aoCriarEvidencia?'EVIDENCIA':undefined} key={`${item.id}:${origemRegistro??''}`} origemRegistro={origemRegistro} focoCadastroAvulso={focoAvulso} aoFecharCadastroAvulso={aoFecharAvulso} item={item} aba="geral" somenteLeitura={somenteLeituraExecucao||!planejamentoHabilitado} podeEvidencia={Boolean(cadastroDocumentalHabilitado&&(podeCriarEvidencia??podeEditarEsperada)&&item.evidenciasEsperadas.filter(e=>!e.dataAcompanhamento).length<10)} regularizacaoDocumental={regularizacaoAtiva} podeEnviar={comprovantesHabilitados} onCadastro={cadastrarOrigem} onAbrir={abrirOrigem} onAtualizar={atualizarExecucaoIntegrada} onGeral={()=>setListaExecucoes(true)} onOcorrencias={()=>{if(aoFecharAvulso){aoFecharAvulso();return;}setOcorrenciasVisitadas(true);setSecaoSelecionada('ocorrencias');setListaAberta('ocorrencias');}}/></aside><div className="pi-workspace-registros min-w-0">
    <nav aria-label="Seções do entregável" className="flex min-w-0 items-center justify-start">
      <div role="tablist" aria-label="Conteúdo do entregável" className="pi-navegacao-registros inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border-b border-current/15 p-1">
        {<button type="button" role="tab" id={`secao-ocorrencias-${item.id}`} aria-controls={`conteudo-ocorrencias-${item.id}`}
          aria-selected={secaoSelecionada === 'ocorrencias'} onClick={() => { setOcorrenciasVisitadas(true); setSecaoSelecionada('ocorrencias'); }}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 ${secaoSelecionada === 'ocorrencias' ? classeAbaAtiva : 'text-foreground/70 hover:bg-foreground/5'}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="10" cy="10" r="6"/><path d="m14 14 6 6m-8-10-2 2"/></svg> Ocorrências
        </button>}

        <button type="button" role="tab" id={`secao-atividades-${item.id}`} aria-controls={`conteudo-atividades-${item.id}`}
          aria-selected={secaoSelecionada === 'atividades'} onClick={() => setSecaoSelecionada('atividades')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 ${secaoSelecionada === 'atividades' ? classeAbaAtiva : 'text-foreground/70 hover:bg-foreground/5'}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 6h11M9 12h11M9 18h11M4 6.5l1 1 2-2M4 12.5l1 1 2-2M4 18.5l1 1 2-2"/>
          </svg> Atividades
        </button>

        <button type="button" role="tab" id={`secao-evidencias-${item.id}`} aria-controls={`conteudo-evidencias-${item.id}`}
          aria-selected={secaoSelecionada === 'evidencias'} onClick={() => setSecaoSelecionada('evidencias')}
          className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors duration-200 ${secaoSelecionada === 'evidencias' ? classeAbaAtiva : 'text-foreground/70 hover:bg-foreground/5'}`}>
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10.5" cy="10.5" r="6.25"/><path d="m15 15 5 5m-12-10 2 2 3-3"/>
          </svg> Evidências
        </button>

        <button type="button" role="tab" id={`secao-execucoes-${item.id}`} aria-controls={`conteudo-execucoes-${item.id}`} aria-selected={secaoSelecionada==='execucoes'} onClick={()=>setSecaoSelecionada('execucoes')} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${secaoSelecionada==='execucoes'?classeAbaAtiva:'text-foreground/70 hover:bg-foreground/5'}`}><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5m0 14h16M8 15l4-5 4 2 4-7"/></svg> Execuções</button>
      </div>
    </nav>
    <aside className="pi-workspace-calendario" aria-label="Calendário do entregável">{item.tipo==='RECORRENTE' && secaoSelecionada==='ocorrencias' ?
      <PainelOcorrenciasEntregavel key={`${item.id}:agenda-inicial`} contratoId={item.contratoId} entregavelIdInicial={item.id}
        estadoContextual={estadoProprioEntregavel} somenteLeitura={somenteLeituraExecucao || !planejamentoHabilitado} calendarioInicial={calendarioRegistros} /> : calendarioRegistros}</aside>
    {erroExecucao&&<p role="alert" className="text-error-text">{erroExecucao}</p>}
    <div className="pi-ver-registros"><button type="button" onClick={()=>{if(secaoSelecionada==='execucoes')setListaExecucoes(true);else {setOcorrenciasVisitadas(true);setListaAberta(secaoSelecionada);}}}>Ver {secaoSelecionada==='ocorrencias'?'ocorrências':secaoSelecionada==='atividades'?'atividades':secaoSelecionada==='evidencias'?'evidências':'execuções'} <span aria-hidden="true">›</span></button></div>
    {listaExecucoes&&createPortal(<ModalEtapa titulo="Registros de execução" contexto={item.nome} camada="aninhada" larguraDetalhe consultaRegistros ocupado={false} onFechar={()=>setListaExecucoes(false)}><div role="tabpanel" id={`conteudo-${secaoSelecionada}-${item.id}`} aria-labelledby={`secao-${secaoSelecionada}-${item.id}`}>
      <ExecucoesEntregavel key={`${item.id}:historico`} item={item} aba="execucoes" somenteLeitura={somenteLeituraExecucao||!planejamentoHabilitado} podeEvidencia={Boolean(cadastroDocumentalHabilitado&&(podeCriarEvidencia??podeEditarEsperada)&&item.evidenciasEsperadas.filter(e=>!e.dataAcompanhamento).length<10)} regularizacaoDocumental={regularizacaoAtiva} podeEnviar={comprovantesHabilitados} onCadastro={cadastrarOrigem} onAbrir={abrirOrigem} onAtualizar={atualizarExecucaoIntegrada} onGeral={()=>setSecaoSelecionada('execucoes')} onOcorrencias={()=>{setOcorrenciasVisitadas(true);setSecaoSelecionada('ocorrencias');}}/>
      {erroExecucao&&<p role="alert" className="text-error-text">{erroExecucao}</p>}
    </div></ModalEtapa>,document.body)}
    {listaAberta==='ocorrencias' && ocorrenciasVisitadas && createPortal(<ModalEtapa titulo="Registros de ocorrências" contexto={item.nome} camada="aninhada" larguraDetalhe consultaRegistros ocupado={false} onFechar={()=>setListaAberta(null)}><div id={`conteudo-ocorrencias-${item.id}`} role="tabpanel" aria-labelledby={`secao-ocorrencias-${item.id}`} className="min-w-0">
      <PainelOcorrenciasEntregavel key={item.id} contratoId={item.contratoId} entregavelIdInicial={item.id}
        estadoContextual={estadoProprioEntregavel} regularizacaoDocumental={regularizacaoAtiva && !item.regularizacaoDocumentalSolicitada}
        somenteLeitura={bloqueadoPorPai || paiArquivado || paiConcluido || Boolean(item.arquivadoEm)} ocultarCadastro={contextoModal} calendarioExterno embutido />
    </div></ModalEtapa>,document.body)}
    {listaAberta === 'evidencias' && createPortal(<ModalEtapa titulo="Evidências" contexto={item.nome} camada="aninhada" larguraDetalhe consultaRegistros ocupado={false} onFechar={()=>{setListaAberta(null);}}><div id={`conteudo-evidencias-${item.id}`} role="tabpanel" aria-labelledby={`secao-evidencias-${item.id}`} className="min-w-0">
    <section data-pi-lista-evidencias className={`min-h-[min(34dvh,300px)] space-y-3 rounded-xl border p-3 sm:p-4 ${item.arquivadoEm ? 'border-amber-500/45 bg-amber-500/[0.04]' : item.statusExecucao === 'CONCLUIDO' ? 'border-violet-400/40 bg-violet-500/[0.04]' : item.reabertoEm ? 'border-teal-700/40 bg-teal-700/[0.04]' : 'border-current/20 bg-background'}`}>
      <header className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-semibold" data-tec08-titulo-secao-evidencias>Evidências</h2>
        {!contextoModal && abaChecklist === 'ativas' && cadastroDocumentalHabilitado && (podeCriarEvidencia ?? podeEditarEsperada) && <button type="button" aria-expanded={criandoEvidencia} disabled={item.evidenciasEsperadas.length >= 10 && !criandoEvidencia}
          onClick={abrirCadastro} data-tec08-acao-criar
          className="inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green hover:brightness-110">
          <span className="mr-1.5 inline-flex align-middle"><svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 9h8M12 13v5M9.5 15.5h5"/></svg></span>{criandoEvidencia ? 'Cancelar cadastro' : item.evidenciasEsperadas.length >= 10 ? 'Limite de evidências' : 'Nova evidência'}
        </button>}
        </div>
      {!abrirArquivo && (() => {
        const obrigatorias = evidenciasAtivas.filter(e => e.obrigatoria);
        const opcionais = evidenciasAtivas.filter(e => !e.obrigatoria);
        const resumoValido = resumoInicial?.total === evidenciasAtivas.length && resumoInicial.verificadasTotal !== undefined;
        const verificadas = statusInicialCarregado ? obrigatorias.filter(e => estadoEvidencias[e.id]?.status === 'VERIFICADA').length : resumoValido ? resumoInicial!.verificadas : 0;
        const opcionaisVerificadas = statusInicialCarregado ? opcionais.filter(e => estadoEvidencias[e.id]?.status === 'VERIFICADA').length : resumoValido ? (resumoInicial!.verificadasTotal! - resumoInicial!.verificadas) : 0;
        const contagemDisponivel = statusInicialCarregado || resumoValido;
        return <><p className="min-h-4 text-xs tabular-nums text-foreground/65">{contagemDisponivel ? `${verificadas}/${obrigatorias.length} evidências obrigatórias` : "Consultando evidências…"}</p>
          {contagemDisponivel && opcionais.length > 0 && <p className="text-xs tabular-nums text-foreground/60">{opcionaisVerificadas}/{opcionais.length} opcionais verificadas · não bloqueiam a conclusão</p>}
          <div className="flex h-1.5 max-w-64 gap-0.5 overflow-hidden rounded-full" role="img"
            aria-label={contagemDisponivel ? `${verificadas} de ${obrigatorias.length} evidências obrigatórias verificadas` : 'Consultando comprovação das evidências obrigatórias'}>
            {Array.from({ length: obrigatorias.length }, (_, index) => <span key={index}
              className={`min-w-0 flex-1 rounded-sm ${index < verificadas ? 'bg-violet-500' : 'bg-violet-500/20'}`} />)}
          </div></>;
      })()}
      </header>
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 sm:flex-nowrap">
        <AbasRolaveis className="min-w-0 flex-1"><div role="tablist" aria-label="Consultar evidências" className={`inline-flex items-center gap-1 rounded-xl border p-1 ${item.arquivadoEm ? 'border-amber-500/40' : item.statusExecucao === 'CONCLUIDO' ? 'border-violet-400/35' : item.reabertoEm ? 'border-teal-700/35' : 'border-current/20'}`}>
          <button type="button" role="tab" aria-selected={abaChecklist === 'ativas'} onClick={() => setAbaChecklist('ativas')}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-none ${abaChecklist === 'ativas' ? classeAbaAtiva : 'text-foreground/65 hover:text-foreground'}`}> <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="ativas"/>Ativas</span></button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'revisao'} onClick={() => setAbaChecklist('revisao')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'revisao' ? classeAbaAtiva : 'text-foreground/65 hover:bg-teal-700/10'}`}> <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="revisao"/>Em revisão</span></button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'pendentes'} onClick={() => setAbaChecklist('pendentes')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'pendentes' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}> <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="pendentes"/>Pendentes de verificação</span></button>
          <button type="button" role="tab" aria-selected={abaChecklist === 'concluidas'}
            aria-label="Evidências finalizadas" title="Evidências verificadas" onClick={() => setAbaChecklist('concluidas')}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-none ${abaChecklist === 'concluidas' ? classeAbaAtiva : 'text-foreground/65 hover:bg-violet-500/10'}`}>
            <span className="inline-flex items-center gap-1.5"><IconeStatus tipo="concluidas"/>Finalizadas</span>
          </button>
          {<button type="button" role="tab" aria-selected={abrirArquivo}
            aria-label="Evidências arquivadas" title="Evidências arquivadas" disabled={criandoEvidencia} onClick={() => void alternarArquivo()}
            className={`inline-flex h-8 w-9 items-center justify-center rounded-lg transition-colors ${abrirArquivo ? 'bg-amber-500/20 text-amber-200' : 'text-foreground/65 hover:bg-foreground/10 hover:text-foreground'}`}>
            <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v12h14V8M9 13h6"/></svg>
          </button>}
        </div></AbasRolaveis>
      </div>
      {!abrirArquivo && <>

      {!statusInicialCarregado && !temStatusAnterior && evidenciasAtivas.length > 0 ? <p role="status" className="min-h-14 text-sm text-foreground/60">Consultando evidências...</p> :
        evidenciasAtivas.length === 0 || !evidenciasAtivas.some(e => evidenciaNaAba(e.id)) ?
          <p className="text-sm text-foreground/65">{abaChecklist === 'concluidas' ? 'Nenhuma evidência verificada.' : abaChecklist === 'revisao' ? 'Nenhuma evidência em revisão.' : 'Nenhuma evidência pendente.'}</p> :
        <div className="space-y-4">{([true, false] as const).map(obrigatoria => {
          const grupo = evidenciasAtivas.filter(e => e.obrigatoria === obrigatoria &&
            evidenciaNaAba(e.id));
          if (!grupo.length) return null;
          return <div key={String(obrigatoria)} className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              {obrigatoria ? `Obrigatórias (${grupo.length})` : `Opcionais (${grupo.length})`}
            </h3>
            <ul aria-label={obrigatoria ? 'Evidências obrigatórias' : 'Evidências opcionais'} className="space-y-2">
              {grupo.map(e => <li key={e.id} data-evidencia-estado={estadoVisualEvidencia(estadoEvidencias[e.id]?.status, estadoEvidencias[e.id]?.reabertoEm, Boolean(e.arquivadoEm))} data-tec08-card-evidencia data-tec08-item-clicavel tabIndex={0} aria-label={`Abrir detalhes da evidência ${e.tipoEvidencia}`} onKeyDown={evento => { if (evento.target !== evento.currentTarget) return; if (evento.key === "Enter" || evento.key === " ") { evento.preventDefault(); abrirEvidencia(evento.currentTarget, e.id); } }} onClick={(evento) => { const alvo = evento.target; const elemento = alvo instanceof Element ? alvo : alvo instanceof Node ? alvo.parentElement : null; const acao = elemento?.closest('button,a,input,textarea,select,[role="dialog"]'); if (acao && evento.currentTarget.contains(acao)) return; abrirEvidencia(evento.currentTarget, e.id); }} className={`group relative min-w-0 cursor-pointer rounded-xl border pb-14 transition-opacity duration-150 ${e.arquivadoEm ? 'border-amber-500/60 bg-amber-500/[0.10] text-amber-100' : estadoEvidencias[e.id]?.reabertoEm ? 'border-teal-700/60 bg-teal-900/[0.10] text-teal-100' : estadoEvidencias[e.id]?.status === 'VERIFICADA' ? 'border-violet-500/60 bg-violet-500/[0.06] hover:border-violet-400 focus-within:border-violet-400' : 'border-brand-green/25 bg-background hover:border-brand-green/50 focus-within:border-brand-neon'}`}>
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 px-3 py-2.5">
                  {estadoEvidencias[e.id]?.status === 'VERIFICADA' ? <span aria-label="Evidência com comprovação documental verificada" title="Verificada"
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-violet-400/65 bg-violet-500/20 text-violet-200">
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                    </svg>
                  </span> : <IconeEvidencia nome={estadoEvidencias[e.id]?.arquivo} tipo={e.tipoEvidencia} />}
                  <div className="min-w-0 flex-1 text-left">
                    <button type="button" data-evidencia-esperada-id={e.id}
                      onClick={evento => abrirEvidencia(evento.currentTarget, e.id)}
                      aria-label={`Ver detalhes da evidência esperada ${e.tipoEvidencia}`}
                      data-tec08-titulo-evidencia className={`block w-full appearance-none border-0 bg-transparent p-0 text-left break-words text-sm font-semibold focus-visible:outline-2 before:absolute before:inset-0 before:z-[1] before:rounded-xl before:content-[''] ${estadoEvidencias[e.id]?.status === 'VERIFICADA'
                      ? 'text-violet-800 dark:text-violet-200'
                      : 'text-brand-neon'}`}>
                      {estadoEvidencias[e.id]?.arquivo ? nomeArquivoLegivel(estadoEvidencias[e.id]?.arquivo ?? '') : e.tipoEvidencia}
                    </button>
                    {(estadoEvidencias[e.id]?.arquivo || e.descricao) && <span className="mt-0.5 block truncate text-xs text-foreground/60">
                      {estadoEvidencias[e.id]?.arquivo ? (categoriaVisivelEvidencia(e.tipoEvidencia, estadoEvidencias[e.id]?.arquivo ?? '') ?? e.tipoEvidencia) : e.descricao}
                    </span>}
                  </div>
                  <ContadoresVinculos itens={estadoEvidencias[e.id]?.vinculos??itensVinculosEvidencia()}/>
                  <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2 pl-11 sm:pl-0">
                    <span className={`rounded-full border px-2 py-1 text-[11px] ${estadoEvidencias[e.id]?.reabertoEm ? 'border-teal-600/55 bg-teal-900/20 text-teal-200' : estadoEvidencias[e.id]?.status === 'VERIFICADA' ? 'border-violet-400/45 bg-violet-500/15 text-violet-100' : estadoEvidencias[e.id] ? CLASSE_STATUS[estadoEvidencias[e.id].status] : 'border-foreground/20 text-foreground/60'}`}
                      aria-label={`Status da evidência ${e.tipoEvidencia}`}>
                      {estadoEvidencias[e.id]?.reabertoEm ? 'Em revisão' : estadoEvidencias[e.id] ? ROTULO_STATUS[estadoEvidencias[e.id].status] : 'Status indisponível'}
                    </span>
                    {false && estadoEvidencias[e.id]?.reabertoEm && estadoEvidencias[e.id]?.status !== 'VERIFICADA' &&
                      <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[11px] text-emerald-200">Em revisão</span>}

                  </div>
                </div>

              </li>)}</ul>
          </div>;
        })}</div>}</>}
      {erroArquivo && <p role="alert" className="text-sm text-error-text">{erroArquivo}</p>}
      {abrirArquivo && <div role="tabpanel" aria-label="Evidências arquivadas" className="min-h-36 space-y-2">
        {arquivadas.length === 0 ? <p className="text-sm text-foreground/70">Nenhuma evidência arquivada.</p> :
          <ul className="space-y-2">{arquivadas.map(e => <li key={e.id} tabIndex={0} aria-label={`Abrir detalhes da evidência arquivada ${e.tipoEvidencia}`} onKeyDown={evento => { if (evento.target !== evento.currentTarget) return; if (evento.key === 'Enter' || evento.key === ' ') { evento.preventDefault(); abrirEvidencia(evento.currentTarget, e.id); } }} onClick={evento => { const alvo = evento.target; const elemento = alvo instanceof Element ? alvo : alvo instanceof Node ? alvo.parentElement : null; const acao = elemento?.closest('button,a,input,textarea,select'); if (acao && evento.currentTarget.contains(acao)) return; abrirEvidencia(evento.currentTarget, e.id); }} className="relative flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/50 bg-amber-50 dark:bg-[#261d0d] p-3 text-sm text-foreground">
            <button type="button" data-evidencia-esperada-id={e.id} onClick={ev => abrirEvidencia(ev.currentTarget, e.id)} className="min-w-0 flex-1 text-left focus-visible:outline-2 focus-visible:outline-amber-300 before:absolute before:inset-0 before:z-[1] before:rounded-lg before:content-['']">
              <span className="block font-mono text-xs text-foreground/60">{rotuloCodigoPublico(e.codigoPublico)} · {e.obrigatoria ? 'Obrigatória' : 'Opcional'}</span>
              {e.tipoEvidencia}{!e.arquivadoEm && paiArquivado ? ' · somente leitura por arquivamento do pai' : ''}
            </button>

          </li>)}</ul>}
      </div>}
    </section>
    </div></ModalEtapa>,document.body)}
    {listaAberta === 'atividades' && createPortal(<ModalEtapa titulo="Atividades" contexto={item.nome} camada="aninhada" larguraDetalhe consultaRegistros ocupado={false} onFechar={()=>setListaAberta(null)}><div id={`conteudo-atividades-${item.id}`} role="tabpanel" aria-labelledby={`secao-atividades-${item.id}`} className="min-w-0">
      <AtividadesVinculadas contratoId={item.contratoId} entregavelId={item.id} estadoContextual={estadoProprioEntregavel} somenteLeitura={bloqueadoPorPai || paiArquivado || paiConcluido || Boolean(item.arquivadoEm)} ocultarAcessoDiario={contextoModal} />
    </div></ModalEtapa>,document.body)}
    </div></div>}

  </div>
      {criandoEvidencia && createPortal(<ModalEtapa titulo={navegacaoDoRegistro?"Novo registro":"Nova evidência"} contexto="Comprovação documental" alturaEstavel ocupado={salvandoNova} navegacaoCadastro={navegacaoDoRegistro}
        camada={navegacaoDoRegistro?"edicao":"evidencia"} larguraFormulario="atividade" formularioHorizontal estadoContextual="normal" textoFechar="Fechar ×" rotuloFechar="Fechar cadastro de evidência" onFechar={() => fecharCadastro()}>
        <form data-tec08-formulario-contextual data-tec08-criacao="true" aria-label="Cadastrar evidência esperada" onSubmit={e => void adicionarEvidencia(e)}
        className="pi-form-evidencia pi-form-atividade space-y-3 text-sm">
        <div className="pi-evidencia-cadastro-grade"><div className="pi-evidencia-dados min-w-0 space-y-3">
        <div className="space-y-3">
        {item.tipo==='CONTINUO'&&<label className="block space-y-1">Data de acompanhamento<input required type="date" className="block rounded-lg border border-current/25 bg-transparent p-2" min={item.inicioPrevisto??undefined} max={item.terminoPrevisto??undefined} value={dataAcompanhamento} onChange={e=>setDataAcompanhamento(e.target.value)}/></label>}
        <div className="space-y-1">
          <label htmlFor={`tipo-novo-${item.id}`} className="block">Tipo de evidência</label>
          <select id={`tipo-novo-${item.id}`} required value={novoTipo} onChange={e => { setNovoTipo(e.target.value); setNovoArquivo(null); setVinculosCadastro(v=>({...v,destinos:[]})); }}
            className="block w-56 max-w-full rounded-lg border border-current/25 bg-transparent p-2 text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon">
            <option value="">Selecione o tipo</option>
            <option value="Foto">Foto</option>
            <option value="Relatório">Relatório</option>
          </select>
        </div>
        <label className="block space-y-1">Orientações (opcional)
          <textarea value={novaDescricao} maxLength={65} onChange={e => setNovaDescricao(e.target.value)}
            rows={2} className="pi-orientacoes-curtas block w-full rounded-lg border border-current/25 bg-transparent p-2" /><span className="block text-right text-xs text-foreground/55">{novaDescricao.length}/65</span></label></div>
        {comprovantesHabilitados && <div className="space-y-2">
          <label htmlFor={`arquivo-inicial-${item.id}`} className="block font-medium">Comprovante inicial (opcional)</label>
          <input id={`arquivo-inicial-${item.id}`} type="file" accept={aceitarArquivoEvidencia(novoTipo)}
            className="sr-only" onChange={evento => setNovoArquivo(evento.target.files?.[0] ?? null)} />
          <div className="flex min-w-0 flex-wrap items-center gap-3 border-b border-current/15 pb-2">
            <label htmlFor={`arquivo-inicial-${item.id}`} className="cursor-pointer rounded-lg border border-brand-green/40 px-3 py-2 text-sm font-medium hover:bg-brand-green/10"><span className="inline-flex items-center gap-2"><svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 11l-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-2-2l7-7"/></svg>Selecionar arquivo</span></label>
            <span className="min-w-0 flex-1 break-all text-xs text-foreground/70" aria-live="polite">{novoArquivo?.name ?? 'Nenhum arquivo selecionado'}{novoArquivo&&` · ${(novoArquivo.size/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})} KB`}</span>{novoArquivo&&<button type="button" onClick={()=>{setNovoArquivo(null);const campo=document.getElementById(`arquivo-inicial-${item.id}`) as HTMLInputElement|null;if(campo)campo.value='';}} className="rounded-md px-2 py-1 text-xs hover:bg-current/10" aria-label="Remover arquivo selecionado">Remover</button>}
          </div>
        </div>}
        {!cacheExecucao&&contribuicaoCadastro.percentual!==undefined&&<label className="block text-sm font-medium">Percentual de execução declarado (%)<input required inputMode="decimal" className="mt-1 block w-40 max-w-full rounded-lg border border-current/25 bg-transparent p-2" value={contribuicaoCadastro.percentual} onChange={e=>setContribuicaoCadastro(v=>({...v,percentual:e.target.value}))}/></label>}
        {!cacheExecucao&&contribuicaoCadastro.quantidade!==undefined&&<label className="block text-sm font-medium">Quantidade executada ({item.unidadeMedida??'unidades'})<input required inputMode="decimal" className="mt-1 block w-40 max-w-full rounded-lg border border-current/25 bg-transparent p-2" value={contribuicaoCadastro.quantidade} onChange={e=>setContribuicaoCadastro(v=>({...v,quantidade:e.target.value}))}/></label>}
        {(contribuicaoCadastro.comprovaExecucaoId||contribuicaoCadastro.origemQuantidade==='COMPROVACAO')&&<p className="text-xs text-foreground/70">Comprova uma execução existente, sem acrescentar progresso.</p>}
        {regularizacaoAtiva || cadastroSomenteDocumental ? <p className="text-xs text-foreground/70">Evidência complementar (opcional), sem contribuição de execução.</p> : podeAlterarObrigatoriedade ? <label className="flex items-center gap-2"><input type="checkbox" checked={novaObrigatoria}
          onChange={e => setNovaObrigatoria(e.target.checked)} /> Obrigatória</label> :
          <p className="text-xs text-foreground/65">Obrigatória por padrão. Somente usuários autorizados podem alterar essa condição.</p>}
        </div>{!regularizacaoAtiva&&!cadastroSomenteDocumental&&cacheExecucao&&comprovantesHabilitados&&<EditorVinculosEvidencia item={item} tipoEvidencia={novoTipo} dados={contribuicaoCadastro} onChange={setContribuicaoCadastro} vinculos={vinculosCadastro} onVinculos={setVinculosCadastro}/>}</div>
        {erroCadastro && <p role="alert" className="text-error-text">{erroCadastro}</p>}
        <div className="pi-rodape-formulario flex flex-wrap justify-end gap-2 border-t border-current/15 pt-3"><button type="button" disabled={salvandoNova} onClick={()=>fecharCadastro()} className="rounded-lg border border-current/25 px-3 py-2 text-sm">Cancelar</button><button type="submit" disabled={salvandoNova || (!novoTipo.trim() && !novaEvidenciaCriadaId)}
          className="rounded-lg bg-brand-green px-4 py-2 font-semibold text-on-brand-green disabled:opacity-50">
          {salvandoNova ? 'Salvando...' : novaEvidenciaCriadaId ? 'Reenviar comprovante' : novoArquivo ? 'Cadastrar e anexar' : navegacaoDoRegistro ? 'Cadastrar' : 'Cadastrar evidência'}</button></div>
        </form>
      </ModalEtapa>, document.body)}
  {cadastroAtividade&&<ModalCadastroAtividade contratoId={item.contratoId} entregavelId={item.id} origem={cadastroAtividade.gatilho} navegacaoCadastro={navegacaoDoRegistro} execucaoInicial={cadastroAtividade.dados} estadoContextual={estadoProprioEntregavel} onFechar={()=>{setCadastroAtividade(null);setNavegacaoRegistro(null);aoFecharAvulso?.();}} onSalvo={atualizarExecucaoIntegrada}/>}
  {cadastroOcorrencia&&createPortal(<PainelOcorrenciasEntregavel contratoId={item.contratoId} entregavelIdInicial={item.id} somenteDetalhe navegacaoCadastro={navegacaoDoRegistro} cadastroInicial={cadastroOcorrencia} aoFecharCadastro={()=>{setCadastroOcorrencia(null);setNavegacaoRegistro(null);atualizarExecucaoIntegrada();aoFecharAvulso?.();}} estadoContextual={estadoProprioEntregavel}/>,document.body)}
  {detalheOcorrencia&&createPortal(<PainelOcorrenciasEntregavel contratoId={item.contratoId} entregavelIdInicial={item.id} somenteDetalhe abrirOcorrenciaId={detalheOcorrencia} somenteLeitura={somenteLeituraExecucao} aoFecharOcorrenciaSelecionada={()=>{setDetalheOcorrencia(null);atualizarExecucaoIntegrada();}} estadoContextual={estadoProprioEntregavel}/>,document.body)}
  {detalheAtividade&&<div hidden><CartaoAtividade contratoId={item.contratoId} atividade={detalheAtividade} permissoes={somenteLeituraExecucao?undefined:permissoesExecucao} abrirDetalhesInicialmente dentroEntregavel aoFecharDetalhe={()=>setDetalheAtividade(null)} onAtualizada={()=>{atualizarExecucaoIntegrada();void consultarAtividade(item.contratoId,detalheAtividade.id).then(setDetalheAtividade).catch(()=>{});}}/></div>}
  {evidenciaId&&falhaAberturaEvidencia===evidenciaId&&createPortal(<ModalEtapa titulo="Evidência indisponível" ocupado={false} camada="evidencia" larguraFormulario="registro-manual" focoRetorno={focoRetornoEvidencia} onFechar={voltarAoEntregavel}><p role="alert">Não foi possível consultar a evidência.</p><button type="button" className="mt-3 rounded-lg border border-current/20 px-3 py-2 text-sm hover:bg-current/5" onClick={()=>setFalhaAberturaEvidencia(null)}>Tentar novamente</button></ModalEtapa>,document.body)}
  {evidenciaId&&evidenciaAbertaId!==evidenciaId&&falhaAberturaEvidencia!==evidenciaId&&createPortal(<span role="status" className="sr-only">Consultando evidência.</span>,document.body)}
  {selecionada && evidenciaAbertaId===evidenciaId && createPortal(<ModalEtapa titulo={selecionada.tipoEvidencia} codigoPublico={selecionada.codigoPublico} contexto={`Evidência esperada · ${selecionada.obrigatoria ? 'Obrigatória' : 'Opcional'}`}
    camada="evidencia" larguraFormulario="evidencia" estadoContextual={estadoVisualEvidencia(estadoEvidencias[selecionada.id]?.status,estadoEvidencias[selecionada.id]?.reabertoEm,Boolean(selecionada.arquivadoEm))} ocupado={false} focoRetorno={focoRetornoEvidencia}
    textoFechar="Fechar ×" somenteIconeFechar bloqueadoPorSubmodal={edicaoAberta}
    acoes={<>
      <MenuAcoesObjeto rotulo={selecionada.arquivadoEm ? 'Reativar' : estadoEvidencias[selecionada.id]?.status === 'VERIFICADA' ? 'Reabrir' : 'Fechar'}
        acaoDireta={selecionada.arquivadoEm && podeReativarEvidencia && !bloqueadoPorPai ? () => {setErroArquivo('');setConfirmarReativacao(selecionada.id);}
          : !selecionada.arquivadoEm && (planejamentoHabilitado || regularizacaoAtiva) && podeReabrirEvidencia && estadoEvidencias[selecionada.id]?.status === 'VERIFICADA' && (!bloqueadoPorPai || regularizacaoAtiva) && !paiArquivado
            ? () => setConfirmarReabertura(selecionada.id) : undefined}>
      {selecionada.arquivadoEm && podeReativarEvidencia && !bloqueadoPorPai &&
        <BotaoAcaoModal intencao="reativar" disabled={ocupadoArquivo} onClick={() => {setErroArquivo('');setConfirmarReativacao(selecionada.id);}}>⟳ Reativar</BotaoAcaoModal>}
      {!selecionada.arquivadoEm && (planejamentoHabilitado || regularizacaoAtiva) && podeReabrirEvidencia && estadoEvidencias[selecionada.id]?.status === 'VERIFICADA' && (!bloqueadoPorPai || regularizacaoAtiva) && !paiArquivado &&
        <BotaoAcaoModal intencao="reabrir" disabled={arquivandoItem} onClick={() => setConfirmarReabertura(selecionada.id)}>Reabrir</BotaoAcaoModal>}
      {!selecionada.arquivadoEm && planejamentoHabilitado && podeArquivarEvidencia && estadoEvidencias[selecionada.id]?.status !== 'VERIFICADA' && !bloqueadoPorPai && !paiArquivado &&
        <BotaoAcaoModal intencao="arquivar" disabled={ocupadoArquivo} onClick={() => {setErroArquivo('');setConfirmarArquivamento(selecionada.id);}}>Arquivar</BotaoAcaoModal>}
      </MenuAcoesObjeto>
      {acaoDesvincularMeta && evidenciaAvulsa?.id===selecionada.id && confirmado?.id===selecionada.id && integridadeDetalhe?.valida && !selecionada.arquivadoEm && confirmado.status!=='VERIFICADA' && <BotaoDesvincularMeta onClick={acaoDesvincularMeta}/>}
      {selecionada.arquivadoEm && podeExcluirEvidenciaArquivada && !bloqueadoPorPai &&
        <BotaoExcluirModal rotulo="Excluir evidência arquivada" disabled={ocupadoArquivo} onClick={() => {setErroArquivo('');setConfirmarExclusao(selecionada.id);}}/>}
    </>}
    rotuloFechar="Fechar evidência"
    onFechar={() => {
      // O editor pode já estar desmontado após confirmar o comprovante.
      // Nunca deixar o botão Fechar sem ação por estado de edição defasado.
      if (edicaoAberta && document.querySelector('[data-tec08-camada="edicao"]') && voltarEdicaoRef.current) voltarEdicaoRef.current();
      else voltarAoEntregavel();
    }}>
    <section aria-label="Detalhe da evidência esperada" className="min-w-0 space-y-4">
      <PainelComprovacaoEvidencia key={`${item.contratoId}:${item.id}:${selecionada.id}`}
        contratoId={item.contratoId} entregavelId={item.id}
        esperadaId={selecionada.id} onDetalheAtualizado={registrarDetalheAtualizado} onIntegridadeDetalhe={registrarIntegridadeDetalhe} podeEditar={(planejamentoHabilitado || regularizacaoAtiva && confirmado?.podeEditarMetadadosComplementares === true) && podeEditarEsperada && integridadeDetalhe?.id === selecionada.id && integridadeDetalhe.valida && confirmado?.contextoPermiteAlterar !== false && !selecionada.arquivadoEm && estadoEvidencias[selecionada.id]?.status !== 'VERIFICADA'}
        podeArquivar={planejamentoHabilitado && (podeArquivarEvidencia ?? podeEditarEsperada) && !selecionada.arquivadoEm} ocultarArquivamento
        podeAlterarObrigatoriedade={planejamentoHabilitado && podeAlterarObrigatoriedade && integridadeDetalhe?.id === selecionada.id && integridadeDetalhe.valida && confirmado?.contextoPermiteAlterar !== false && !selecionada.arquivadoEm && estadoEvidencias[selecionada.id]?.status !== 'VERIFICADA'}
        revisaoConsulta={versaoEstado} detalheConfirmado={confirmado} anexacaoDireta
        podeEnviar={comprovantesHabilitados && !selecionada.arquivadoEm && estadoEvidencias[selecionada.id]?.status !== 'VERIFICADA'}
        registrarVoltaEdicao={registrarEditor} cancelamentoNoCabecalho
        onComprovanteAlterado={atualizarEvidenciaIntegrada}
        onArquivada={() => { voltarAoEntregavel(); atualizarEstadoEvidencias(); aoAtualizarEsperada?.(); }}
        onPlanejamentoAlterado={atualizarEvidenciaIntegrada} />
    </section>
  </ModalEtapa>, document.body)}
  {confirmarExclusao && createPortal(<div className="relative z-[160]" onKeyDown={e => e.stopPropagation()}>
    <ConfirmacaoSimples pendencias={erroArquivo ? [erroArquivo] : []} titulo="Excluir evidência arquivada?" perigoso ocupado={ocupadoArquivo}
      descricao="Excluir definitivamente esta evidência de teste, todos os comprovantes e todos os arquivos enviados? Não é possível desfazer."
      confirmar="Excluir definitivamente" onCancelar={() => setConfirmarExclusao(null)} onConfirmar={() => void (async () => {
        const id = confirmarExclusao;
        if (!id || ocupadoArquivo || !podeExcluirEvidenciaArquivada) return;
        setOcupadoArquivo(true); setErroArquivo('');
        try {
          await excluirEvidenciaArquivada(item.contratoId, item.id, id);
          setArquivadas(lista => lista.filter(e => e.id !== id));
          if (evidenciaId === id) voltarAoEntregavel();
          setConfirmarExclusao(null);
          toastSucesso('Evidência excluída com sucesso.');
          atualizarEstadoEvidencias(); aoAtualizarEsperada?.();
        } catch (e) { setErroArquivo(e instanceof Error ? e.message : 'Falha ao excluir evidência.'); }
        finally { setOcupadoArquivo(false); }
      })()} />
  </div>, document.body)}
  {confirmarReativacao && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples pendencias={erroArquivo ? [erroArquivo] : []} titulo="Reativar evidência?"
      descricao="A evidência voltará ao checklist ativo deste entregável. A alteração será registrada na rastreabilidade e nenhum detalhe será aberto automaticamente."
      confirmar="Confirmar reativação" ocupado={ocupadoArquivo} justificativa={motivoEvidencia} onJustificativaChange={setMotivoEvidencia}
      onCancelar={() => { setConfirmarReativacao(null); setMotivoEvidencia(''); }} onConfirmar={() => void reativar()} />
  </div>, document.body)}
  {confirmarReabertura && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples pendencias={erroArquivo ? [erroArquivo] : []} titulo="Reabrir evidência verificada?"
      descricao="A evidência voltará a Pendente de verificação. O comprovante existente e o histórico serão preservados."
      confirmar="Reabrir evidência" ocupado={arquivandoItem} justificativa={motivoEvidencia} onJustificativaChange={setMotivoEvidencia}
      onCancelar={() => { setConfirmarReabertura(null); setMotivoEvidencia(''); }} onConfirmar={() => void executarReaberturaEvidencia()} />
  </div>, document.body)}
  {confirmarArquivamento && createPortal(<div className="relative z-[160]">
    <ConfirmacaoSimples pendencias={erroArquivo ? [erroArquivo] : []} titulo="Arquivar evidência?"
      descricao={`Esta evidência sairá do planejamento ativo, mas os comprovantes e o histórico continuarão preservados. Deseja arquivar “${item.evidenciasEsperadas.find(e => e.id === confirmarArquivamento)?.tipoEvidencia ?? 'esta evidência'}”?`}
      confirmar="Confirmar arquivamento" perigoso ocupado={arquivandoItem}
      onCancelar={() => setConfirmarArquivamento(null)} onConfirmar={() => void arquivarEvidenciaDireta()} />
  </div>, document.body)}
  </>;
}
