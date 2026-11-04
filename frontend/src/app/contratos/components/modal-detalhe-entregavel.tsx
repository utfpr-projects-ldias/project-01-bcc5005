'use client';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { editarEntregavel } from '@/lib/entregaveis';
import { FormularioEntregavel } from './formulario-entregavel';
import { ConteudoEntregavel } from './conteudo-entregavel';
import { ModalEtapa } from './modal-etapa';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';

/** Consulta o detalhe real no backend, sem confiar só na listagem em cache. */
export function ModalDetalheEntregavel({ contratoId, etapaId, entregavelId, podeEditar, focoRetorno, onFechar, atualizar }: {
  contratoId: string; etapaId: string; entregavelId: string; podeEditar: boolean;
  focoRetorno: HTMLElement | null; onFechar: () => void; atualizar: () => Promise<unknown>;
}) {
  const consulta = useDetalheEntregavel(contratoId, entregavelId);
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState('');
  const erro = consulta.erro;
  // Uma resposta em cache de outro contrato/etapa nunca pode ser apresentada.
  const item = !erro && consulta.dados?.id === entregavelId && consulta.dados.contratoId === contratoId &&
    consulta.dados.etapaId === etapaId ? consulta.dados : undefined;
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    await editarEntregavel(contratoId, entregavelId, dados);
    setEditando(false);
    setAviso('Planejamento atualizado com sucesso.');
    void consulta.atualizar().catch(() => {});
    void atualizar().catch(() => {});
  }
  return createPortal(<ModalEtapa contexto="Entregáveis do contrato" titulo={item?.nome ?? 'Detalhes do entregável'}
    rotuloFechar="Fechar detalhes do entregável" ocupado={salvando} focoRetorno={focoRetorno} onFechar={onFechar}>
    <div className="min-w-0 space-y-4" data-testid="modal-detalhe-entregavel">
      {consulta.carregando && !item && <p role="status">Carregando dados do entregável...</p>}
      {Boolean(erro) && <p role="alert" className="text-error-text">{erro instanceof Error ? erro.message : 'Não foi possível consultar o entregável.'}</p>}
      {!consulta.carregando && !erro && !item && <p role="alert">Entregável não encontrado ou sem acesso neste contrato.</p>}
      {item && <>
        {podeEditar && <div className="flex flex-wrap items-center justify-end gap-2 border-b border-brand-green/20 pb-3">
          <button type="button" disabled={salvando} aria-expanded={editando}
            onClick={() => { setEditando(valor => !valor); setAviso(''); }}
            className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
            {editando ? 'Fechar edição' : 'Editar entregável'}
          </button>
        </div>}
        {aviso && <p role="status" className="rounded-lg border border-brand-green/30 p-3 text-sm">{aviso}</p>}
        {editando ? <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={etapaId} inicial={item}
          onSalvar={salvar} onCancelar={() => setEditando(false)} onSalvandoMudou={setSalvando} />
          : <ConteudoEntregavel item={item} onEditarChecklist={podeEditar ? () => { setEditando(true); setAviso(''); } : undefined} />}
      </>}
    </div>
  </ModalEtapa>, document.body);
}
