'use client';
import { CampoDataCivil } from '@/app/components/campo-data-civil';

import { useEffect, useId, useRef, useState } from 'react';
import { SeletorOrdenacao } from './seletor-ordenacao-contratos';
import { TIPOS_ATIVIDADE } from '@/lib/validacao-atividade';
import { agruparDiario } from '@/lib/diario-atividades';
import { createPortal } from 'react-dom';
import { ModalEtapa } from './modal-etapa';
import type { EstadoContextual } from '@/lib/estado-visivel-contrato';
import { useRepositorioConsultasOpcional } from '@/app/components/provedor-consultas';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { useEtapas } from '@/hooks/use-etapas';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import { useAtividades, type FiltroEstadoAtividade, type OrdemDiario, type FiltroPresenca } from '@/hooks/use-atividades';
import type { Entregavel } from '@/lib/entregaveis';
import { CartaoAtividade, statusVisualEntregavel, type EstadoVisualEntregavel } from '@/app/atividades/components/cartao-atividade';
import { ModalCadastroAtividade } from '@/app/atividades/components/modal-cadastro-atividade';
import { ProgressoAtividadeCompartilhada } from '@/app/atividades/components/progresso-atividade-compartilhada';
import { SeletorEntregavel } from '@/app/ocorrencias/components/seletor-entregavel';

type Filtro = { dataInicio: string; dataFim: string; etapaId: string; entregavelId: string; status: FiltroEstadoAtividade; tipo:string; ocorrenciaId:string; responsavel:string; comEvidencias:FiltroPresenca; comExecucao:FiltroPresenca };
const vazio = (): Filtro => ({ dataInicio: '', dataFim: '', etapaId: '', entregavelId: '', status: 'TODAS_ATUAIS', tipo:'', ocorrenciaId:'', responsavel:'', comEvidencias:'', comExecucao:'' });
const campo = 'pi-diario-campo min-w-0 w-full rounded-md border px-3 py-2 text-xs text-foreground focus-visible:outline-2 focus-visible:outline-current';

/** Diário de um contrato ou de um entregável: consulta com filtros imediatos e paginação no backend. */
function ListaAtividadesVinculadas({ contratoId, entregavelId, somenteLeitura = false, estadoContextual, visivel = true, ocultarCadastro = false, listaCompacta=false, onAbrirEntregavel,onAbrirOcorrencia }: { contratoId: string; entregavelId?: string; somenteLeitura?: boolean; estadoContextual?: EstadoContextual; visivel?: boolean; ocultarCadastro?:boolean; listaCompacta?:boolean; onAbrirEntregavel?:(id:string,origem?:HTMLElement)=>void; onAbrirOcorrencia?:(id:string)=>void }) {
  const [filtros, setFiltros] = useState<Filtro>(vazio);
  const [edicaoFiltros,setEdicaoFiltros]=useState(vazio);
  const [pagina, setPagina] = useState(1);
  const idFiltros=useId();
  const [painelFiltros,setPainelFiltros] = useState<'periodo'|'adicionais'|null>(null);
  const raizFiltros=useRef<HTMLDivElement>(null);
  const [gatilhoFiltro,setGatilhoFiltro]=useState<HTMLButtonElement|null>(null);
  if(!visivel && painelFiltros!==null) setPainelFiltros(null);
  const [busca, setBusca] = useState('');
  const [buscaEfetiva,setBuscaEfetiva] = useState('');
  const [responsavelEfetivo,setResponsavelEfetivo] = useState('');
  useEffect(()=>{const timer=setTimeout(()=>{setResponsavelEfetivo(filtros.responsavel.trim());setPagina(1);},250);return()=>clearTimeout(timer);},[filtros.responsavel]);
  const [ordem,setOrdem] = useState<OrdemDiario>('recentes');
  useEffect(()=>{const timer=setTimeout(()=>{setBuscaEfetiva(busca.trim());setPagina(1);},250);return()=>clearTimeout(timer);},[busca]);
  const [cadastroAberto, setCadastroAberto] = useState(false);
  const [avisoCadastro, setAvisoCadastro] = useState(false);
  const [gatilhoCadastro, setGatilhoCadastro] = useState<HTMLElement | null>(null);
  const fixo = Boolean(entregavelId);
  const etapasConsulta = useEtapas(contratoId, visivel);
  const agenda = useOcorrencias(contratoId, visivel);
  const entregaveisConsulta = useEntregaveis(contratoId, visivel);
  const etapas = (etapasConsulta.dados ?? []).filter(e => !e.arquivadoEm);
  const estadoPorEntregavel: Record<string, EstadoVisualEntregavel> = Object.fromEntries(
    (entregaveisConsulta.dados ?? []).map((item: Entregavel) => [item.id, statusVisualEntregavel(item)]));
  const estadoPai = estadoContextual ?? (entregavelId ? estadoPorEntregavel[entregavelId] ?? 'normal' : 'normal');

  const etapasPorId = Object.fromEntries((etapasConsulta.dados??[]).map(e=>[e.id,e.nome]));
  const quantidadeFiltrosAdicionais = [filtros.tipo,filtros.etapaId,filtros.entregavelId,filtros.ocorrenciaId,filtros.responsavel,filtros.comEvidencias,filtros.comExecucao].filter(Boolean).length;
  const intervaloInvalido = Boolean(filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim);
  const { atividades, total, contagens, loading, atualizando, erro, atualizar } = useAtividades(contratoId, {
    dataInicio: !intervaloInvalido ? filtros.dataInicio : undefined,
    dataFim: !intervaloInvalido ? filtros.dataFim : undefined,
    etapaId: !fixo && !intervaloInvalido ? filtros.etapaId : undefined,
    entregavelId: entregavelId || (!intervaloInvalido ? filtros.entregavelId : ''),
    status: intervaloInvalido ? undefined : filtros.status,
    page: pagina, limit: 10, busca:buscaEfetiva, tipo:filtros.tipo, ordem, diario:true, habilitada:visivel&&!intervaloInvalido, ocorrenciaId:filtros.ocorrenciaId, responsavel:responsavelEfetivo, comEvidencias:filtros.comEvidencias, comExecucao:filtros.comExecucao,
  });
  const totalPaginas = Math.max(1, Math.ceil(total / 10));
  if(!loading&&!atualizando&&!erro&&!intervaloInvalido&&pagina>totalPaginas) setPagina(totalPaginas);
  const acesso = useAcessoContrato(contratoId);
  const permissoes = acesso.erro ? undefined : acesso.dados?.permissoes;
  const podeRegistrar = Boolean(permissoes?.registrarAtividades && !acesso.erro && !somenteLeitura);
  const alvoCadastro = entregavelId || filtros.entregavelId;
  const entregavelAlvo = (entregaveisConsulta.dados ?? []).find(e => e.id === alvoCadastro);
  const etapaAlvo = (etapasConsulta.dados ?? []).find(e => e.id === entregavelAlvo?.etapaId);
  const abertoParaRegistro = (e:Entregavel) => !e.arquivadoEm && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??'');
  const selecionadoAberto = Boolean(entregavelAlvo && abertoParaRegistro(entregavelAlvo) &&
    etapaAlvo && !etapaAlvo.arquivadoEm && etapaAlvo.status !== 'CONCLUIDA' && etapaAlvo.status !== 'ENCERRADA');
  // Etapa e entregavel sao FILTROS da listagem, nao pre-requisitos para cadastrar.
  // Uma atividade pode vincular entregaveis de etapas diferentes no mesmo contrato.
  const etapasAbertas = new Set(etapas.filter(e => e.status !== 'CONCLUIDA' && e.status !== 'ENCERRADA').map(e => e.id));
  const haEntregavelElegivel = (entregaveisConsulta.dados ?? []).some(e => abertoParaRegistro(e) && etapasAbertas.has(e.etapaId));
  const consultaPlanejamentoPronta = visivel && !entregaveisConsulta.atualizando && !etapasConsulta.atualizando && !entregaveisConsulta.carregando && !etapasConsulta.carregando && !entregaveisConsulta.erro && !etapasConsulta.erro;
  const podeAbrirCadastro = consultaPlanejamentoPronta && (fixo ? selecionadoAberto : haEntregavelElegivel);
  const permissoesDaLista = somenteLeitura ? { ...permissoes, editarAtividades: false,
    verificarAtividades: false, reabrirAtividades: false, arquivarAtividades: false,
    reativarAtividades: false, excluirAtividadesArquivadas: false } : permissoes;
  const contagem = (status: string) => contagens?.find(c => c.status === status)?.total ?? 0;
  const totalAtuais = contagem('REGISTRADA') + contagem('PENDENTE_CONCLUSAO') + contagem('VERIFICADA');
  const limpar = () => { setFiltros(vazio()); setBusca(''); setBuscaEfetiva(''); setResponsavelEfetivo(''); setPagina(1); setOrdem('recentes'); setPainelFiltros(null); };
  const temFiltros = Boolean(busca || filtros.status !== 'TODAS_ATUAIS' || quantidadeFiltrosAdicionais || filtros.dataInicio || filtros.dataFim || ordem !== 'recentes');
  const dataCurta = (valor: string) => valor.split('-').reverse().join('/');
  const periodoRotulo = filtros.dataInicio || filtros.dataFim ? `${filtros.dataInicio?dataCurta(filtros.dataInicio):'Início'} – ${filtros.dataFim?dataCurta(filtros.dataFim):'Sem limite'}` : 'Período';
  return <section aria-label={fixo ? 'Atividades vinculadas ao entregável' : 'Atividades do contrato'}
    aria-busy={loading} data-pi-diario data-pi-painel-contextual data-tec08-atividades-contrato data-tec08-contexto-operacional data-tec08-estado={estadoPai} className="pi-consulta-estavel min-w-0 space-y-3">
    {!listaCompacta&&<div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 data-pi-titulo data-tec08-titulo-secao-atividades className="text-lg font-semibold">{fixo ? 'Atividades vinculadas' : 'Diário de atividades'}</h3>
        </div>
      <div className="flex flex-wrap items-center gap-2">
      {!ocultarCadastro && <button type="button" disabled={!podeRegistrar || !podeAbrirCadastro} title={!podeRegistrar?'Sem permissão para criar atividade':!podeAbrirCadastro?'É necessário um entregável aberto em uma etapa ativa':'Criar atividade'} onClick={e => { setGatilhoCadastro(e.currentTarget); setCadastroAberto(true); }} className="inline-flex min-h-9 items-center gap-2 rounded-lg bg-brand-green px-3 py-2 text-xs font-semibold text-on-brand-green hover:brightness-105 disabled:cursor-not-allowed disabled:!border-slate-500/30 disabled:!bg-slate-500/15 disabled:!text-foreground/40" data-pi-acao="primaria" aria-label="Nova atividade neste contexto">
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v14H4zM7 9h10M7 13h6"/><path d="M17 14v6M14 17h6"/></svg> Nova atividade
      </button>}
      </div>
    </div>}
    {avisoCadastro && createPortal(<ModalEtapa titulo="Nova atividade" contexto="Requisitos para registro" estadoContextual="normal" ocupado={false} focoRetorno={gatilhoCadastro} onFechar={() => setAvisoCadastro(false)}>
      <p className="text-sm text-foreground/80">{!podeRegistrar ? 'Você não possui permissão para registrar atividades neste contrato.' : 'Para registrar, é necessário pelo menos um entregável aberto e uma etapa ativa no contrato.'}</p>
      <div className="mt-4 flex justify-end"><button type="button" className="rounded-lg border border-current/25 px-4 py-2 text-sm font-semibold" onClick={() => setAvisoCadastro(false)}>Entendi</button></div>
    </ModalEtapa>, document.body)}

    {podeRegistrar && (Boolean(entregaveisConsulta.erro) || Boolean(etapasConsulta.erro)) && <p role="alert" className="text-sm text-error-text">Não foi possível conferir os entregáveis e as etapas para cadastro.</p>}
    {!listaCompacta&&contagens && <dl aria-label="Situação das atividades nos filtros atuais" className="pi-diario-resumo">
      {([['Atividades registradas',totalAtuais,'neutro'],['Em aberto',contagem('REGISTRADA'),'aberto'],['Verificadas',contagem('VERIFICADA'),'verificada'],['Pendentes de conclusão',contagem('PENDENTE_CONCLUSAO'),'pendente']] as const).map(([rotulo,total,tom])=><div key={rotulo} className="min-w-0"><dt className="text-xs text-foreground/65">{rotulo}</dt><dd data-tom={tom} className="mt-1 text-2xl font-semibold leading-none tabular-nums">{total}</dd></div>)}
    </dl>}
    <div ref={raizFiltros} className="pi-diario-ferramentas pi-diario-ferramentas-compactas" data-pi-filtros-diario>
      <label className="min-w-0"><span className="sr-only">Pesquisar atividade</span><input type="search" maxLength={120} placeholder="Pesquisar atividade..." value={busca} onChange={e=>setBusca(e.target.value)} className={campo}/></label>
      <label className="min-w-0"><span className="sr-only">Situação das atividades</span><select aria-label="Situação das atividades" value={filtros.status} onChange={e=>{setPagina(1);setFiltros(v=>({...v,status:e.target.value as FiltroEstadoAtividade}));}} className="pi-diario-campo pi-diario-status-compacto"><option value="TODAS_ATUAIS">Todos os status</option><option value="ATIVAS">Ativas</option><option value="PENDENTE_CONCLUSAO">Pendentes de conclusão</option><option value="VERIFICADA">Finalizadas</option><option value="ARQUIVADA">Arquivadas</option></select></label>
      <button type="button" aria-expanded={painelFiltros==='periodo'} aria-controls={`${idFiltros}-periodo`} className="pi-diario-filtro-botao pi-filtros-sem-borda pi-diario-periodo-compacto" onClick={e=>{setGatilhoFiltro(e.currentTarget);setEdicaoFiltros(filtros);setPainelFiltros(p=>p==='periodo'?null:'periodo');}}><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16"/></svg><span className="truncate" title={periodoRotulo}>{periodoRotulo}</span></button>
      <button type="button" aria-expanded={painelFiltros==='adicionais'} aria-controls={`${idFiltros}-adicionais`} className="pi-diario-filtro-botao pi-filtros-sem-borda" onClick={e=>{setGatilhoFiltro(e.currentTarget);setEdicaoFiltros(filtros);setPainelFiltros(p=>p==='adicionais'?null:'adicionais');}}><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10m-7 6h4"/></svg>Filtros{quantidadeFiltrosAdicionais>0?` (${quantidadeFiltrosAdicionais})`:''}</button>

    </div>
    {painelFiltros&&createPortal(<ModalEtapa titulo={painelFiltros==='periodo'?'Período das atividades':'Filtros de atividades'} contexto="Consulta de registros" estadoContextual="normal" larguraFormulario="registro" camada="edicao" ocupado={false} focoRetorno={gatilhoFiltro} onFechar={()=>setPainelFiltros(null)}><div className="pi-filtros-modal">
    <div id={`${idFiltros}-periodo`} hidden={painelFiltros!=='periodo'} data-pi-filtros-diario className="pi-diario-filtros-expandidos">
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Data inicial
        <CampoDataCivil aria-label="Data inicial" className={campo} value={edicaoFiltros.dataInicio} onChange={e => { setEdicaoFiltros(v => ({ ...v, dataInicio: e.target.value })); }} />
      </label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Data final
        <CampoDataCivil aria-label="Data final" className={campo} value={edicaoFiltros.dataFim} onChange={e => { setEdicaoFiltros(v => ({ ...v, dataFim: e.target.value })); }} />
      </label>
    </div>
    <div id={`${idFiltros}-adicionais`} hidden={painelFiltros!=='adicionais'} data-pi-filtros-diario className="pi-diario-filtros-expandidos">
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Tipo de atividade<select value={edicaoFiltros.tipo} onChange={e=>{setEdicaoFiltros(v=>({...v,tipo:e.target.value}));}} className={campo}><option value="">Todos os tipos</option>{TIPOS_ATIVIDADE.map(t=><option key={t}>{t}</option>)}</select></label>
      {!fixo&&<><SeletorEntregavel rotulo="Etapa" itens={etapas} valor={edicaoFiltros.etapaId} onChange={id => { setEdicaoFiltros(v => ({ ...v, etapaId: id, entregavelId: '', ocorrenciaId: '' })); }} opcaoTodos rotuloTodos="Todas as etapas" placeholder="Digite ou selecione uma etapa..." />
      <SeletorEntregavel rotulo="Entregável" itens={(entregaveisConsulta.dados??[]).filter(e=>!e.arquivadoEm&&(!edicaoFiltros.etapaId||e.etapaId===edicaoFiltros.etapaId))} valor={edicaoFiltros.entregavelId} onChange={id => { setEdicaoFiltros(v => ({ ...v, entregavelId: id, ocorrenciaId: '' })); }} opcaoTodos placeholder="Digite ou selecione um entregável..." /></>}
      <SeletorEntregavel rotulo="Ocorrência" itens={agenda.ocorrencias.filter(o=>(fixo?o.entregavelId===entregavelId:!edicaoFiltros.entregavelId||o.entregavelId===edicaoFiltros.entregavelId)&&(!edicaoFiltros.etapaId||(entregaveisConsulta.dados??[]).some(e=>e.id===o.entregavelId&&e.etapaId===edicaoFiltros.etapaId))).map(o=>({id:o.id,nome:o.titulo}))} valor={edicaoFiltros.ocorrenciaId} onChange={id=>{setEdicaoFiltros(v=>({...v,ocorrenciaId:id}));}} opcaoTodos rotuloTodos="Todas as ocorrências" placeholder="Localizar ocorrência..."/>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Responsável<input className={campo} value={edicaoFiltros.responsavel} maxLength={120} onChange={e=>{setEdicaoFiltros(v=>({...v,responsavel:e.target.value}));}} placeholder="Nome do responsável"/></label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Comprovantes vinculados<select className={campo} value={edicaoFiltros.comEvidencias} onChange={e=>{setEdicaoFiltros(v=>({...v,comEvidencias:e.target.value as FiltroPresenca}));}}><option value="">Todos</option><option value="sim">Com comprovantes</option><option value="nao">Sem comprovantes</option></select></label>
      <label className="min-w-0 space-y-1 text-xs font-medium text-foreground/85">Contribuição física<select className={campo} value={edicaoFiltros.comExecucao} onChange={e=>{setEdicaoFiltros(v=>({...v,comExecucao:e.target.value as FiltroPresenca}));}}><option value="">Todas</option><option value="sim">Com contribuição declarada</option><option value="nao">Sem contribuição adicional</option></select></label>
    </div>
    {painelFiltros==='periodo'&&edicaoFiltros.dataInicio&&edicaoFiltros.dataFim&&edicaoFiltros.dataInicio>edicaoFiltros.dataFim&&<p role="alert" className="text-xs text-error-text">A data inicial não pode ser posterior à data final.</p>}
    <div className="flex justify-end gap-2 pt-2"><button type="button" className="pi-link-contextual" onClick={()=>setEdicaoFiltros(v=>({...v,...(painelFiltros==='periodo'?{dataInicio:'',dataFim:''}:{tipo:'',etapaId:'',entregavelId:'',ocorrenciaId:'',responsavel:'',comEvidencias:'',comExecucao:''})}))}>Limpar</button><button type="button" data-pi-acao="primaria" className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green" disabled={Boolean(edicaoFiltros.dataInicio&&edicaoFiltros.dataFim&&edicaoFiltros.dataInicio>edicaoFiltros.dataFim)} onClick={()=>{setFiltros(v=>({...edicaoFiltros,status:v.status}));setPagina(1);setPainelFiltros(null);}}>Concluir</button></div></div></ModalEtapa>,document.body)}
    {intervaloInvalido && <p role="alert" className="text-xs text-error-text">A data inicial não pode ser posterior à data final.</p>}
    <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-xs text-foreground/65"><span>{intervaloInvalido?'Intervalo inválido':`${total} ${total===1?'atividade encontrada':'atividades encontradas'}`}</span>{temFiltros&&<button type="button" onClick={limpar} className="pi-link-contextual font-medium">Limpar filtros</button>}</div>
    {intervaloInvalido ? <p role="status" className="rounded-lg border border-dashed border-brand-green/20 p-5 text-sm text-foreground/65">Corrija o intervalo para consultar as atividades.</p>
      : loading && !atividades.length ? <p role="status" className="text-sm text-foreground/70">Carregando atividades...</p>
      : erro ? <p role="alert" className="text-sm text-error-text">Não foi possível consultar as atividades deste contrato.</p>
      : atividades.length === 0 ? <p className="py-4 text-sm text-foreground/65">Nenhuma atividade encontrada.</p>
      : <div data-pi-linha-tempo className="space-y-4">{agruparDiario(atividades,ordem).map(grupo=><section key={grupo.chave} aria-label={grupo.rotulo} className="space-y-2">
        <h4 className="text-xs font-semibold text-foreground/65">{grupo.rotulo}</h4>
        <ol className="pi-lista-registros-contrato">{grupo.itens.map(atividade=><li key={atividade.id} className="min-w-0">
          <CartaoAtividade contratoId={contratoId} atividade={atividade} permissoes={permissoesDaLista} compacto diario onAbrirEntregavel={onAbrirEntregavel} onAbrirOcorrencia={onAbrirOcorrencia} dentroEntregavel={fixo} estadosEntregaveis={estadoPorEntregavel} etapasPorId={etapasPorId} onAtualizada={() => { void atualizar(); }} />
          {atividade.atividadeCompartilhadaId && <ProgressoAtividadeCompartilhada grupoId={atividade.atividadeCompartilhadaId} onAtualizada={() => { void atualizar(); }} />}
        </li>)}</ol></section>)}</div>}
    <div className="pi-rodape-lista"><SeletorOrdenacao<OrdemDiario> valor={ordem} onChange={v=>{setOrdem(v);setPagina(1);}} rotulo="Ordenar atividades" rotuloLista="Ordem das atividades" alinhamento="inicio" opcoes={[{valor:'recentes',texto:'Mais recentes'},{valor:'antigas',texto:'Mais antigas'},{valor:'duracao-desc',texto:'Maior duração'},{valor:'duracao-asc',texto:'Menor duração'}]}/>
    {totalPaginas > 1 && !loading && !erro && !intervaloInvalido &&
      <nav aria-label="Paginação das atividades" className="flex flex-wrap items-center justify-end gap-3 text-xs">
        <button type="button" disabled={pagina === 1} onClick={() => setPagina(p => Math.max(1, p - 1))}
          className="rounded-lg border border-brand-green/30 px-3 py-2 disabled:opacity-40">Anterior</button>
        <span className="text-foreground/65">Página {pagina} de {totalPaginas}</span>
        <button type="button" disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
          className="rounded-lg border border-brand-green/30 px-3 py-2 disabled:opacity-40">Próxima</button>
      </nav>}</div>
    {cadastroAberto && <ModalCadastroAtividade estadoContextual={estadoPai} contratoId={contratoId} entregavelId={entregavelId || (selecionadoAberto ? filtros.entregavelId : '')} origem={gatilhoCadastro}
      onFechar={() => setCadastroAberto(false)} onSalvo={async () => { setPagina(1); await atualizar(); }} />}
  </section>;
}

/** Preserva testes isolados sem provider, sem ativar consultas privadas no contexto inexistente. */
export function AtividadesVinculadas({ contratoId, entregavelId, somenteLeitura = false, ocultarAcessoDiario: _ocultarAcessoDiario = false, estadoContextual, visivel = true, ocultarCadastro = false, listaCompacta=false, onAbrirEntregavel,onAbrirOcorrencia }: { contratoId: string; entregavelId?: string; somenteLeitura?: boolean; ocultarAcessoDiario?: boolean; estadoContextual?: EstadoContextual; visivel?: boolean; ocultarCadastro?:boolean; listaCompacta?:boolean; onAbrirEntregavel?:(id:string,origem?:HTMLElement)=>void; onAbrirOcorrencia?:(id:string)=>void }) {

  const repositorio = useRepositorioConsultasOpcional();
  if (!repositorio) return null;
  return <ListaAtividadesVinculadas key={`${contratoId}:${entregavelId ?? ''}`} contratoId={contratoId} entregavelId={entregavelId} somenteLeitura={somenteLeitura} estadoContextual={estadoContextual} visivel={visivel} listaCompacta={listaCompacta} ocultarCadastro={ocultarCadastro || Boolean(entregavelId && _ocultarAcessoDiario)} onAbrirEntregavel={onAbrirEntregavel} onAbrirOcorrencia={onAbrirOcorrencia} />;
}
