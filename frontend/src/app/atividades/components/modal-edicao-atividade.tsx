'use client';
import { CampoDuracao } from './campo-duracao';
import { CampoDataCivil } from '@/app/components/campo-data-civil';
import { useState, useCallback, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { SeletorVinculosMultiplos } from './seletor-vinculos-multiplos';
import { SeletorOcorrencia } from './seletor-ocorrencia';
import { useOcorrencias } from '@/hooks/use-ocorrencias';
import {type MedicaoDireta} from './medicoes-diretas';
import {EditorContribuicaoAtividadeDestino,temOcorrenciaVinculada,resumoDireto,resumoOcorrencia,modoContribuicaoAtividade,type AlvoContribuicaoAtividade} from './editor-contribuicao-atividade-destino';
import {useAcessoContrato} from '@/hooks/use-contratos';
import {useMeuPerfil} from '@/hooks/use-meu-perfil';
import {valorContribuicaoValido} from '@/lib/validacao-contribuicao';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { useEntregaveis } from '@/hooks/use-entregaveis';
import { SeletorResponsavel, type OpcaoResponsavel } from '@/app/contratos/components/seletor-responsavel';
import { editarAtividadeApi, pesquisarResponsaveisAtividade, type Atividade } from '@/hooks/use-atividades';
import { atividadeSchema, TIPOS_ATIVIDADE, type FormularioAtividade } from '@/lib/validacao-atividade';
import { estadoDoObjeto } from '@/lib/identidade-operacional';

const CAMPO = 'mt-1 w-full min-w-0 rounded-xl border border-brand-green/25 bg-background/80 px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-brand-neon';
function dataLocal(data: string): string {
  const instante = new Date(data);
  if (Number.isNaN(instante.getTime())) return '';
  const ajuste = new Date(instante.getTime() - instante.getTimezoneOffset() * 60000);
  return ajuste.toISOString().slice(0, 16);
}
export function ModalEdicaoAtividade({ atividade, contratoId, origem, onFechar, onSalvo }: {
  atividade: Atividade; contratoId: string; origem?: HTMLElement | null;
  onFechar: () => void; onSalvo?: () => void;
}) {
  const entregaveis = useEntregaveis(contratoId);
  const agenda = useOcorrencias(contratoId);
  const [form, setForm] = useState<FormularioAtividade>(() => ({
    titulo: atividade.titulo, dataHora: dataLocal(atividade.dataHora), descricao: atividade.descricao,
    tipo: TIPOS_ATIVIDADE.find(x => x === atividade.tipo) ?? 'Outro',
    responsavel: atividade.responsavel ?? '', duracao: atividade.duracao ?? '',
    participantes: (atividade.participantes ?? []).join(', '), local: atividade.local ?? '',
    observacoes: atividade.observacoes ?? '', ocorrenciaId: atividade.ocorrenciaId,
    ocorrenciaIds: atividade.ocorrencias?.map(o => o.id) ?? (atividade.ocorrenciaId ? [atividade.ocorrenciaId] : []),
    quantidadeExecucao: atividade.quantidadeExecucao ?? null,
    medicoes: atividade.medicoes ?? (atividade.ocorrenciaId && atividade.quantidadeExecucao != null
      ? [{ ocorrenciaId: atividade.ocorrenciaId, quantidade: atividade.quantidadeExecucao }] : []), entregavelIds: atividade.entregaveis.map(x => x.id),
  }));
  const acesso=useAcessoContrato(contratoId),perfil=useMeuPerfil();
  const [responsavelEscolhido,setResponsavelEscolhido]=useState<OpcaoResponsavel|null>(atividade.responsavelId?{id:atividade.responsavelId,email:atividade.responsavel??'',nome:atividade.responsavel}:null);
  const [responsavelAlterado,setResponsavelAlterado]=useState(false);
  const buscarResponsavel=useCallback((termo:string,signal:AbortSignal)=>pesquisarResponsaveisAtividade(contratoId,termo,signal),[contratoId]);
  const podeMedirOcorrencia=Boolean(perfil.dados?.ativo&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.registrarExecucaoOcorrencia));
  const podeContribuir=Boolean(perfil.dados?.ativo&&(perfil.dados.perfil==='ADMINISTRADOR'||acesso.dados?.permissoes?.editarExecucaoFisica));
  const [diretas,setDiretas]=useState<MedicaoDireta[]>(atividade.medicoesDiretas??[]);
  const [parcelas,setParcelas]=useState(atividade.parcelasPercentuais??[]);
  const [alvo,setAlvo]=useState<AlvoContribuicaoAtividade|null>(null);
  const eAlvo=entregaveis.dados?.find(e=>e.id===alvo?.entregavelId);
  const oAlvo=agenda.ocorrencias.find(o=>o.id===alvo?.ocorrenciaId);
  const selecionada = agenda.ocorrencias.find(o => o.id === form.ocorrenciaId);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const [errosCampos, setErrosCampos] = useState<Record<string, string>>({});
  const [confirmouRevisaoMedicoes, setConfirmouRevisaoMedicoes] = useState(false);
  const originaisMedicoes = atividade.medicoes ?? (atividade.ocorrenciaId && atividade.quantidadeExecucao != null
    ? [{ ocorrenciaId: atividade.ocorrenciaId, quantidade: atividade.quantidadeExecucao }] : []);
  const medidasRetiradas = originaisMedicoes.filter(m => !(form.medicoes ?? []).some(n => n.ocorrenciaId === m.ocorrenciaId));
  const trocaDePrincipalMedida = atividade.quantidadeExecucao != null && form.ocorrenciaId !== atividade.ocorrenciaId;
  const exigeRevisaoMedicoes = medidasRetiradas.length > 0 || trocaDePrincipalMedida;
  const campo = <K extends keyof FormularioAtividade>(chave: K, valor: FormularioAtividade[K]) => {
    setConfirmouRevisaoMedicoes(false);
    setForm(anterior => ({ ...anterior, [chave]: valor }));
  };
  async function salvar(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault(); if (salvando) return;
    setErro(''); setErrosCampos({});
    if (atividade.status !== 'REGISTRADA') { setErro('Esta atividade não está aberta para edição.'); return; }
    if (exigeRevisaoMedicoes && !confirmouRevisaoMedicoes) {
      setErro('Confirme a revisão das medições antes de salvar alterações que retiram quantidades da apuração.'); return;
    }
    // Campos legados maiores que os limites atuais não devem impedir outra edição.
    const textoOriginal = {
      titulo: atividade.titulo, descricao: atividade.descricao,
      responsavel: atividade.responsavel ?? '', duracao: atividade.duracao ?? '',
      participantes: (atividade.participantes ?? []).join(', '),
      local: atividade.local ?? '', observacoes: atividade.observacoes ?? '',
    };
    const limites = { titulo: 50, descricao: 500, responsavel: 25,
      duracao: 25, participantes: 500, local: 50, observacoes: 200 } as const;
    const validarTexto = { ...form };
    for (const chave of Object.keys(limites) as Array<keyof typeof limites>) {
      if (form[chave].length > limites[chave] && form[chave] === textoOriginal[chave]) {
        (validarTexto as Record<string, unknown>)[chave] = form[chave].slice(0, limites[chave]);
      }
    }
    if(form.participantes===textoOriginal.participantes) validarTexto.participantes='';
    const validado = atividadeSchema.safeParse(validarTexto);
    if (!validado.success) {
      const erros: Record<string, string> = {};
      validado.error.issues.forEach(issue => { erros[String(issue.path[0])] ??= issue.message; });
      setErrosCampos(erros); setErro('Confira os campos destacados.'); return;
    }
    const validos = new Set((entregaveis.dados ?? []).filter(e => !e.arquivadoEm && !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao ?? '')).map(e => e.id));
    if (validado.data.entregavelIds.some(id => !validos.has(id))) {
      setErro('Vincule somente entregáveis abertos e disponíveis para edição.'); return;
    }
    if(parcelas.some(p=>!valorContribuicaoValido(p.percentual,false,10000)||!form.entregavelIds.includes(p.entregavelId)||(p.ocorrenciaId&&!(form.ocorrenciaIds??[]).includes(p.ocorrenciaId)))||diretas.some(d=>!form.entregavelIds.includes(d.entregavelId)||!(Number(d.quantidade)>0))){setErro('Confira os valores e vínculos das contribuições.');return;}
    setSalvando(true);
    try {
      const normalizados = {
        ...validado.data, dataHora: form.dataHora === dataLocal(atividade.dataHora) ? new Date(atividade.dataHora).toISOString() : new Date(validado.data.dataHora).toISOString(),
        participantes: form.participantes===textoOriginal.participantes ? (atividade.participantes??[]) : form.participantes.split(',').map(x => x.trim()).filter(Boolean),
      };
      const anteriores = {
        titulo: atividade.titulo, dataHora: new Date(atividade.dataHora).toISOString(),
        descricao: atividade.descricao, tipo: atividade.tipo,
        responsavel: atividade.responsavel ?? '', duracao: atividade.duracao ?? '',
        participantes: atividade.participantes ?? [], local: atividade.local ?? '',
        observacoes: atividade.observacoes ?? '',
        ocorrenciaId: atividade.ocorrenciaId ?? null,
        ocorrenciaIds: atividade.ocorrencias?.map(o => o.id) ?? (atividade.ocorrenciaId ? [atividade.ocorrenciaId] : []),
        quantidadeExecucao: atividade.quantidadeExecucao ?? null,
        medicoes: atividade.medicoes ?? (atividade.ocorrenciaId && atividade.quantidadeExecucao != null
          ? [{ ocorrenciaId: atividade.ocorrenciaId, quantidade: atividade.quantidadeExecucao }] : []),
        entregavelIds: atividade.entregaveis.map(e => e.id),
      };
      const alteracoes: Record<string, unknown> = {};
      for (const chave of Object.keys(normalizados) as Array<keyof typeof normalizados>) {
        const novoComparacao = chave in textoOriginal
          ? form[chave as keyof typeof textoOriginal]
          : normalizados[chave];
        const anterior = anteriores[chave];
        const igual = Array.isArray(anterior)
          ? JSON.stringify(anterior) === JSON.stringify(normalizados[chave])
          : (novoComparacao ?? null) === (anterior ?? null);
        if (!igual) alteracoes[chave] = normalizados[chave];
      }
      if(responsavelAlterado){alteracoes.responsavelId=responsavelEscolhido?.id??null;delete alteracoes.responsavel;}
      if(JSON.stringify(diretas)!==JSON.stringify(atividade.medicoesDiretas??[]))alteracoes.medicoesDiretas=diretas;
      if(JSON.stringify(parcelas)!==JSON.stringify(atividade.parcelasPercentuais??[]))alteracoes.parcelasPercentuais=parcelas.map(p=>({...p,percentual:p.percentual.replace(',','.')}));
      if (Object.keys(alteracoes).length) await editarAtividadeApi(contratoId, atividade.id, alteracoes as Partial<Omit<import('@/hooks/use-atividades').DadosAtividade, 'contratoId'>>);
      onFechar(); await Promise.resolve().then(()=>onSalvo?.()).catch(() => {});
    } catch (falha) { setErro(falha instanceof Error ? falha.message : 'Não foi possível editar a atividade.'); }
    finally { setSalvando(false); }
  }
  return createPortal(<ModalEtapa titulo="Editar atividade" contexto={atividade.titulo} estadoContextual={estadoDoObjeto({objeto: 'atividade', status: atividade.status})}
    ocupado={salvando} larguraFormulario="atividade" formularioHorizontal cabecalhoUmaLinha camada="edicao" focoRetorno={origem} onFechar={onFechar} rotuloFechar="Fechar edição da atividade">
    <form aria-label="Formulário de edição da atividade" onSubmit={salvar} noValidate className="pi-form-atividade space-y-3">
      <p className="text-xs text-foreground/70">Campos com * são obrigatórios. As alterações ficam registradas na rastreabilidade.</p>
      {erro && <p role="alert" className="rounded-lg border border-error-text/35 p-3 text-sm text-error-text">{erro}</p>}
      <div className="pi-form-colunas"><section className="min-w-0 space-y-3">
      <div className="grid min-w-0 items-start gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,.55fr)]"><label className="block min-w-0 text-sm font-medium">Título *
        <input required maxLength={50} className={CAMPO} value={form.titulo} onChange={e => campo('titulo', e.target.value)} aria-invalid={Boolean(errosCampos.titulo)} /><span className="block text-right text-[11px] text-foreground/55">{form.titulo.length}/50</span>
      {errosCampos.titulo && <span className="block text-xs text-error-text">{errosCampos.titulo}</span>}</label>
        <label className="block text-sm font-medium">Tipo *
          <select className={`${CAMPO} pi-select pr-10`} value={form.tipo} onChange={e => campo('tipo', e.target.value as FormularioAtividade['tipo'])}>
            {TIPOS_ATIVIDADE.map(x => <option key={x}>{x}</option>)}</select></label>
      </div>
      <div className="pi-atividade-tempo"><label className="block min-w-0 text-sm font-medium">Data da atividade *<CampoDataCivil required className={`${CAMPO} tec08-data-hora`} value={form.dataHora.split('T')[0]??''} onChange={e=>campo('dataHora',`${e.target.value}T${form.dataHora.split('T')[1]??''}`)} aria-invalid={Boolean(errosCampos.dataHora)}/></label><label className="block min-w-0 text-sm font-medium">Horário *<input type="time" required className={`${CAMPO} tec08-data-hora`} value={form.dataHora.split('T')[1]??''} onChange={e=>campo('dataHora',`${form.dataHora.split('T')[0]??''}T${e.target.value}`)} aria-invalid={Boolean(errosCampos.dataHora)}/></label>
        <label className="block min-w-0 text-sm font-medium">Duração<CampoDuracao className={CAMPO} valor={form.duracao} onValor={v=>campo('duracao',v)} /></label>
      </div>
      {errosCampos.dataHora && <p className="text-xs text-error-text">{errosCampos.dataHora}</p>}
      <label className="block min-w-0 text-sm font-medium">Descrição *
        <textarea required rows={2} maxLength={500} className={CAMPO} value={form.descricao} onChange={e => campo('descricao', e.target.value)} /><span className="block text-right text-[11px] text-foreground/55">{form.descricao.length}/500</span></label>
      {errosCampos.descricao && <p className="text-xs text-error-text">{errosCampos.descricao}</p>}
      <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-2">
        <div><SeletorResponsavel semprePesquisar rotulo="Responsável" valor={responsavelEscolhido?.id??null} selecionado={responsavelEscolhido} pesquisar={buscarResponsavel} desabilitado={salvando} onChange={(_,u)=>{setResponsavelEscolhido(u??null);setResponsavelAlterado(true);}}/>
          {!responsavelAlterado&&!responsavelEscolhido&&atividade.responsavel&&<p className="text-xs text-foreground/65">Responsável registrado: {atividade.responsavel}</p>}
          {(responsavelEscolhido||(!responsavelAlterado&&atividade.responsavel))&&<button type="button" className="text-xs underline" onClick={()=>{setResponsavelEscolhido(null);setResponsavelAlterado(true);}}>Remover atribuição</button>}</div>
        <label className="block text-sm font-medium">Participantes
          <input maxLength={500} className={CAMPO} value={form.participantes} onChange={e => campo('participantes', e.target.value)} /></label>
        <label className="block text-sm font-medium">Local
          <input maxLength={50} className={CAMPO} value={form.local} onChange={e => campo('local', e.target.value)} /></label>
      </div>
      <label className="block text-sm font-medium">Observações
        <textarea rows={2} maxLength={Math.max(200, atividade.observacoes?.length ?? 0)} className={CAMPO} value={form.observacoes} onChange={e => campo('observacoes', e.target.value)} /><span className="block text-right text-[11px] text-foreground/55">{form.observacoes.length}/200 {form.observacoes.length > 200 && form.observacoes === (atividade.observacoes ?? '') ? '(texto legado preservado)' : ''}</span></label>
      </section><section className="min-w-0 space-y-3" aria-label="Vínculos e contribuição de execução"><h3 className="text-sm font-semibold text-foreground">Vínculos e contribuição de execução</h3>
      <fieldset className="space-y-2 rounded-lg border border-brand-green/25 p-3"><legend className="px-1 text-sm font-semibold">Vincular ao(s) entregável(is) *</legend>
        {entregaveis.carregando ? <p role="status" className="text-sm">Carregando entregáveis...</p> : entregaveis.erro ?
          <p role="alert" className="text-sm text-error-text">Não foi possível consultar entregáveis.</p> :
          <SeletorVinculosMultiplos rotulo="Pesquisar entregáveis para vínculo" placeholder="Localizar entregável…" itens={(entregaveis.dados??[]).filter(e=>!e.arquivadoEm&&!['CONCLUIDO','CONCLUIDO_PARCIALMENTE','FINALIZADO','PENDENTE_CONCLUSAO','PENDENTE_CONCLUSAO_PARCIAL','PENDENTE_ENCERRAMENTO'].includes(e.statusExecucao??'')).map(e=>({id:e.id,nome:e.nome,contribuicao:resumoDireto(e.id,e.unidadeMedida,diretas,parcelas),configuravel:!temOcorrenciaVinculada(e.id,agenda.ocorrencias,form.ocorrenciaIds??[])&&Boolean(modoContribuicaoAtividade(e,undefined,agenda.ocorrencias,!agenda.loading&&!agenda.erro,podeContribuir,false))}))} onConfigurar={id=>setAlvo({entregavelId:id})} valores={form.entregavelIds} onChange={ids=>{setConfirmouRevisaoMedicoes(false);const validas=new Set(agenda.ocorrencias.filter(o=>ids.includes(o.entregavelId)).map(o=>o.id));setForm(prev=>({...prev,entregavelIds:ids,ocorrenciaIds:(prev.ocorrenciaIds??[]).filter(id=>validas.has(id)),medicoes:(prev.medicoes??[]).filter(m=>validas.has(m.ocorrenciaId)),ocorrenciaId:validas.has(prev.ocorrenciaId??'')?prev.ocorrenciaId:null,quantidadeExecucao:validas.has(prev.ocorrenciaId??'')?prev.quantidadeExecucao:null}));}}/>}

        {errosCampos.entregavelIds && <p className="text-xs text-error-text">{errosCampos.entregavelIds}</p>}
      </fieldset>
      {selecionada && (selecionada.modoRegistro === 'DESCRITIVO' || (selecionada.modoRegistro !== 'QUANTITATIVO' && selecionada.metaQuantidade == null)) && <p role="status" className="rounded-lg border border-current/20 bg-background/35 p-3 text-xs text-foreground/70">Esta ocorrência é descritiva: registre o que foi realizado no campo Descrição, sem informar uma quantidade.</p>}
      <SeletorOcorrencia somenteVinculos onConfigurar={id=>{const o=agenda.ocorrencias.find(o=>o.id===id);if(o)setAlvo({entregavelId:o.entregavelId,ocorrenciaId:id});}} configuravel={id=>{const o=agenda.ocorrencias.find(o=>o.id===id),e=entregaveis.dados?.find(e=>e.id===o?.entregavelId);return !!(e&&o&&modoContribuicaoAtividade(e,o,agenda.ocorrencias,true,podeContribuir,podeMedirOcorrencia));}} resumoContribuicao={id=>resumoOcorrencia(id,entregaveis.dados?.find(e=>e.id===agenda.ocorrencias.find(o=>o.id===id)?.entregavelId)?.unidadeMedida,form.medicoes??[],parcelas)} contratoId={contratoId} entregavelIds={form.entregavelIds}
        valor={form.ocorrenciaId} valores={form.ocorrenciaIds ?? []} medicoes={form.medicoes ?? []}
        unidades={Object.fromEntries((entregaveis.dados ?? []).map(ent => [ent.id, ent.unidadeMedida?.trim() || 'unidades']))}
        onMedicoesChange={medicoes => { setConfirmouRevisaoMedicoes(false); setForm(anterior => ({...anterior, medicoes})); }}
        onChangeMultiplas={ids => { setConfirmouRevisaoMedicoes(false); setForm(anterior => ({...anterior,
          ocorrenciaIds: ids,
          medicoes: (anterior.medicoes ?? []).filter(m => ids.includes(m.ocorrenciaId)),
          ocorrenciaId: ids.includes(anterior.ocorrenciaId ?? '') ? anterior.ocorrenciaId : null,
          quantidadeExecucao: ids.includes(anterior.ocorrenciaId ?? '') ? anterior.quantidadeExecucao : null,
        })); }}
        onChange={v => { campo('ocorrenciaId', v); campo('quantidadeExecucao', null); }} />
      {exigeRevisaoMedicoes && <label className="flex items-start gap-3 rounded-xl border border-amber-500/45 bg-amber-500/10 p-3 text-xs text-foreground">
        <input type="checkbox" className="mt-0.5 accent-amber-600" checked={confirmouRevisaoMedicoes}
          onChange={e => setConfirmouRevisaoMedicoes(e.target.checked)} />
        <span>Confirmo a retirada ou transferência de quantidades vinculadas a esta atividade.
          {medidasRetiradas.length > 0 ? ` ${medidasRetiradas.length} medição(ões) deixará(ão) de compor as ocorrências removidas.` : ''}
          {' '}O histórico anterior e posterior será registrado na auditoria.</span>
      </label>}
      </section></div>
      {eAlvo&&(!alvo?.ocorrenciaId||oAlvo)&&<EditorContribuicaoAtividadeDestino item={eAlvo} ocorrencia={oAlvo} agenda={agenda.ocorrencias} agendaPronta={!agenda.loading&&!agenda.erro} podePercentual={podeContribuir} podeMedir={podeMedirOcorrencia} diretas={diretas} medicoes={form.medicoes??[]} parcelas={parcelas} onDiretas={setDiretas} onMedicoes={medicoes=>{setConfirmouRevisaoMedicoes(false);setForm(prev=>({...prev,medicoes}));}} onParcelas={setParcelas} fechar={()=>setAlvo(null)} origemId={atividade.id}/>}
      <footer className="flex flex-wrap justify-end gap-2 border-t border-brand-green/20 pt-4">
        <button type="button" className="rounded-lg border border-red-500/50 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300" onClick={onFechar} disabled={salvando}>Cancelar</button>
        <button type="submit" aria-busy={salvando} disabled={salvando || entregaveis.carregando || Boolean(entregaveis.erro)}
          className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green">{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
      </footer>
    </form>
  </ModalEtapa>, document.body);
}
