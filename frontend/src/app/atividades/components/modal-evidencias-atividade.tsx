'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ModalEtapa } from '@/app/contratos/components/modal-etapa';
import { listarEvidenciasAtividade, vincularEvidenciaAtividade, type ComprovanteAtividade } from '@/hooks/use-atividades';

/** O vínculo reutiliza comprovantes atuais, pendentes ou verificados. Não duplica arquivos nem verifica automaticamente. */
export function ModalEvidenciasAtividade({ contratoId, atividadeId, atividadeTitulo, podeVincular, onFechar, onVinculado }: {
  contratoId: string; atividadeId: string; atividadeTitulo: string; podeVincular: boolean;
  onFechar: () => void; onVinculado?: () => void;
}) {
  const [vinculadas, setVinculadas] = useState<ComprovanteAtividade[]>([]);
  const [disponiveis, setDisponiveis] = useState<ComprovanteAtividade[]>([]);
  const [selecionada, setSelecionada] = useState('');
  const [pesquisa, setPesquisa] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let ativo = true;
    listarEvidenciasAtividade(contratoId, atividadeId).then(dados => {
      if (!ativo) return;
      setVinculadas(dados.vinculadas);
      setDisponiveis(dados.disponiveis);
    }).catch(e => { if (ativo) setErro(e instanceof Error ? e.message : 'Falha ao consultar evidências.'); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [atividadeId, contratoId]);
  async function confirmar() {
    if (!selecionada || salvando || !podeVincular) return;
    setSalvando(true); setErro('');
    try {
      await vincularEvidenciaAtividade(contratoId, atividadeId, selecionada);
      const vinculada = disponiveis.find(item => item.id === selecionada);
      if (vinculada) setVinculadas(atual => [...atual, { ...vinculada, vinculado: true }]);
      setDisponiveis(atual => atual.filter(item => item.id !== selecionada));
      setSelecionada(''); onVinculado?.();
    } catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível vincular a evidência.'); }
    finally { setSalvando(false); }
  }
  const filtradas = disponiveis.filter(item => `${item.tipoEvidencia} ${item.nomeOriginal}`.toLocaleLowerCase('pt-BR')
    .includes(pesquisa.trim().toLocaleLowerCase('pt-BR')));
  return createPortal(<ModalEtapa titulo="Vincular evidência" contexto={atividadeTitulo} camada="edicao" larguraFormulario="evidencia"
    estadoContextual="normal" ocupado={salvando} onFechar={onFechar} rotuloFechar="Fechar vinculação de evidências">
    <div className="pi-vincular-evidencia-v19 space-y-3 text-sm">
      <p className="text-foreground/75">Selecione uma evidência vinculável. A verificação permanece independente do vínculo.</p>
      {carregando && <p role="status">Consultando evidências...</p>}
      {erro && <p role="alert" className="rounded-lg border border-error-text/40 p-3 text-error-text">{erro}</p>}
      {!!vinculadas.length && <div className="space-y-2"><h3 className="font-semibold">Já vinculadas</h3>
        <ul className="space-y-1">{vinculadas.map(c => <li key={c.id} className="min-w-0 break-words rounded-lg border border-current/25 p-2">{c.nomeOriginal} · {c.status==='VERIFICADA'?'Verificada':c.status==='REJEITADA'?'Em revisão':'Pendente de verificação'}</li>)}</ul>
      </div>}
      {podeVincular && <>
        <label className="block text-sm font-medium">Pesquisar comprovante
          <input className="mt-1 w-full min-w-0 rounded-lg border border-current/30 bg-background px-3 py-2 text-sm" type="search" maxLength={120}
            placeholder="Nome do arquivo ou tipo de evidência" value={pesquisa} onChange={e => setPesquisa(e.target.value)} />
        </label>
        <div className="max-h-48 space-y-1 overflow-auto rounded-lg border border-current/25 p-2" role="radiogroup" aria-label="Comprovantes disponíveis">
          {filtradas.map(c => <label key={c.id} className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-current/10">
            <input type="radio" name="comprovante-atividade" checked={selecionada === c.id} onChange={() => setSelecionada(c.id)} />
            <span className="min-w-0 flex-1"><strong className="block truncate" title={c.nomeOriginal}>{c.nomeOriginal}</strong><span className="text-xs text-foreground/70">{c.tipoEvidencia}</span></span><span className="shrink-0 text-xs" data-status={c.status}>{c.status==='VERIFICADA'?'Verificada':'Pendente de verificação'}</span>
          </label>)}
          {!carregando && filtradas.length === 0 && <p className="p-2 text-xs text-foreground/70">Nenhuma evidência disponível para vinculação.</p>}
        </div>
      </>}
      <div className="flex flex-wrap justify-end gap-2 pt-3">
        <button type="button" onClick={onFechar} disabled={salvando} className="rounded-lg border border-red-500/60 bg-red-500/10 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-500/20 dark:text-red-300">Cancelar</button>
        {podeVincular && <button type="button" onClick={() => void confirmar()} disabled={!selecionada || salvando}
          className="pi-vinculo-acao rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-40">
          {salvando ? 'Vinculando...' : 'Confirmar vínculo'}</button>}
      </div>
    </div>
  </ModalEtapa>, document.body);
}
