'use client';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { LinkVoltar } from '@/app/components/link-voltar';
import { AreaContratos, Aviso } from '@/app/contratos/components/area-contratos';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useAcessoContrato } from '@/hooks/use-contratos';
import { FormularioEntregavel } from '@/app/contratos/components/formulario-entregavel';
import { editarEntregavel } from '@/lib/entregaveis';
import type { DadosPlanejamentoEntregavel } from '@/lib/validacao-entregavel';
import { useDetalheEntregavel } from '@/hooks/use-entregaveis';
import { ConteudoEntregavel } from '@/app/contratos/components/conteudo-entregavel';
import { toastSucesso } from '@/app/components/toast-notificacoes';


export default function DetalheEntregavelPage() {
  const { id: contratoId, entregavelId } = useParams<{ id: string; entregavelId: string }>();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const perfil = useMeuPerfil();
  const habilitado = Boolean(perfil.dados?.ativo && !perfil.erro);
  const consulta = useDetalheEntregavel(contratoId, entregavelId, habilitado);
  const acesso = useAcessoContrato(contratoId, habilitado);
  const podeEditar = habilitado && !acesso.erro && !!acesso.dados?.podeEditar &&
    ['ADMINISTRADOR', 'GESTOR'].includes(perfil.dados?.perfil ?? '');
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    await editarEntregavel(contratoId, entregavelId, dados);
    setEditando(false); toastSucesso('Planejamento atualizado.');
    // Revalidar também a lista ao retornar ao contrato, sem confiar em cache antigo.
    void consulta.atualizar().catch(() => {});
  }
  // Nao exibir dados de cache se a identidade perdeu acesso ou se a API negou a consulta.
  const erro = perfil.erro || consulta.erro || acesso.erro;
  const item = !erro && habilitado && consulta.dados?.contratoId === contratoId &&
    consulta.dados?.id === entregavelId ? consulta.dados : undefined;
  return <AreaContratos titulo="Detalhe do entregável">
    <LinkVoltar href={`/contratos/${encodeURIComponent(contratoId)}`}>Voltar ao contrato</LinkVoltar>
    {(perfil.carregando || (habilitado && consulta.carregando && !item)) && <Aviso>Carregando entregável...</Aviso>}
    {Boolean(erro) && <Aviso erro>{erro instanceof Error ? erro.message : 'Falha na consulta do entregável.'}</Aviso>}
    {!perfil.carregando && !erro && !habilitado && <Aviso erro>Conta sem autorização para consultar entregáveis.</Aviso>}
    {!perfil.carregando && habilitado && !consulta.carregando && !erro && !item && <Aviso erro>Entregável não encontrado neste contrato.</Aviso>}
    {item && <h2 className="break-words text-lg font-semibold text-brand-neon">{item.nome}</h2>}

    {item && podeEditar && <div className="flex justify-end"><button type="button" disabled={salvando} aria-expanded={editando}
      aria-controls="edicao-entregavel" onClick={() => { setEditando((anterior) => !anterior); }}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-on-brand-green hover:brightness-110 focus-visible:outline-2 focus-visible:outline-brand-neon disabled:opacity-50">
      {editando ? 'Fechar edição' : 'Editar entregável'}

    </button></div>}
    {item && podeEditar && editando && <div id="edicao-entregavel" className="etapa-form-expandido">
      <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={item.etapaId} inicial={item} onSalvar={salvar}
        onCancelar={() => setEditando(false)} onSalvandoMudou={setSalvando} />
    </div>}
    {item && !editando && <ConteudoEntregavel item={item} podeEditarEsperada={podeEditar} podeVerHistorico
      aoAtualizarEsperada={() => { void consulta.atualizar().catch(() => {}); }} />}
  </AreaContratos>;
}
