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
import { dataPlanejada, ROTULOS_PERIODICIDADE, ROTULOS_TIPO, type Entregavel } from '@/lib/entregaveis';

type Campo = [nome: string, valor: string | null | undefined];
function Quadro({ titulo, campos }: { titulo: string; campos: Campo[] }) {
  return <section className="min-w-0 space-y-3 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
    <h2 className="text-lg font-semibold text-brand-neon">{titulo}</h2>
    <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
      {campos.map(([nome, valor]) => <div key={nome} className="min-w-0"><dt className="text-xs text-foreground/60">{nome}</dt>
        <dd className="mt-1 whitespace-pre-wrap break-words">{valor?.trim() || 'Não informado'}</dd></div>)}
    </dl>
  </section>;
}
export function ConteudoEntregavel({ item }: { item: Entregavel }) {
  const campos: Campo[] = [
    ['Código', item.codigo], ['Tipo', ROTULOS_TIPO[item.tipo]],
    ['Início previsto', dataPlanejada(item.inicioPrevisto)], ['Término previsto', dataPlanejada(item.terminoPrevisto)],
    ['Responsável cadastral', item.responsavel ? `${item.responsavel.nome || 'Nome não informado'} — ${item.responsavel.email}` : item.responsavelId ? 'Responsável atribuído' : null],
    ...(item.tipo === 'QUANTITATIVO' ? [
      ['Quantidade prevista', item.quantidadePrevista], ['Unidade de medida', item.unidadeMedida],
    ] as Campo[] : []),
    ...(item.tipo === 'RECORRENTE' ? [
      ['Periodicidade', item.periodicidade ? ROTULOS_PERIODICIDADE[item.periodicidade] : null],
      ['Configuração de recorrência', item.configuracaoPeriodicidade ? `Versão ${item.configuracaoPeriodicidade.versao}` : null],
    ] as Campo[] : []),
    ['Peso operacional', item.peso === null ? null : `${item.peso}%`],
    ['Observações', item.observacoes],
  ];
  return <div className="min-w-0 space-y-5">
    <header className="min-w-0 space-y-2">
      <p className="text-xs uppercase tracking-wide text-foreground/65">Entregável planejado · {ROTULOS_TIPO[item.tipo]}</p>
      <h1 className="break-words text-2xl font-bold text-brand-neon">{item.nome}</h1>
      {item.descricao && <p className="whitespace-pre-wrap break-words text-sm text-foreground/75">{item.descricao}</p>}
    </header>
    <Quadro titulo="Identificação e planejamento" campos={campos} />
    <section className="space-y-2 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <h2 className="text-lg font-semibold text-brand-neon">Critério de conclusão</h2>
      <p className="whitespace-pre-wrap break-words text-sm">{item.criterioConclusao?.trim() || 'Critério não informado no planejamento.'}</p>
      <p className="text-xs text-foreground/65">O acompanhamento da execução e a conclusão serão disponibilizados com o motor TEC09. Nenhum progresso foi presumido.</p>
    </section>
    <section className="space-y-3 rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6">
      <h2 className="text-lg font-semibold text-brand-neon">Evidências esperadas</h2>
      <p className="text-sm text-foreground/70">Checklist de documentos ou provas previstos no planejamento; não são evidências enviadas nem situação de comprovação.</p>
      {item.evidenciasEsperadas.length === 0 ? <p className="text-sm">Nenhuma evidência esperada configurada.</p> :
        <ul aria-label="Checklist de evidências esperadas" className="space-y-2">{item.evidenciasEsperadas.map((e) =>
          <li key={e.id} className="min-w-0 rounded-lg border border-brand-green/20 bg-background/60 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <span className="break-words font-medium">{e.tipoEvidencia}</span>
              <span className="rounded-full border border-brand-green/30 px-2 py-0.5 text-xs">{e.obrigatoria ? 'Obrigatória' : 'Opcional'}</span>
            </div>
            {e.descricao && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-foreground/70">{e.descricao}</p>}
          </li>)}</ul>}
    </section>
    <section className="space-y-2 rounded-2xl border border-dashed border-brand-green/25 p-4 md:p-6">
      <h2 className="text-base font-semibold">Próximas integrações</h2>
      <p className="text-sm text-foreground/70">Ocorrências (HU09), diário de atividades (HU08) e evidências reais (HU10) serão vinculados a este entregável nas respectivas entregas. Nenhuma ação está disponível nesta etapa.</p>
    </section>
  </div>;
}
export default function DetalheEntregavelPage() {
  const { id: contratoId, entregavelId } = useParams<{ id: string; entregavelId: string }>();
  const [editando, setEditando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [sucesso, setSucesso] = useState('');
  const perfil = useMeuPerfil();
  const habilitado = Boolean(perfil.dados?.ativo && !perfil.erro);
  const consulta = useDetalheEntregavel(contratoId, entregavelId, habilitado);
  const acesso = useAcessoContrato(contratoId, habilitado);
  const podeEditar = habilitado && !acesso.erro && !!acesso.dados?.podeEditar &&
    ['ADMINISTRADOR', 'GESTOR'].includes(perfil.dados?.perfil ?? '');
  async function salvar(dados: DadosPlanejamentoEntregavel) {
    await editarEntregavel(contratoId, entregavelId, dados);
    setEditando(false); setSucesso('Planejamento atualizado com sucesso.');
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
    {sucesso && <p role="status" className="rounded-lg border border-brand-green/40 p-3 text-sm text-brand-neon">{sucesso}</p>}
    {item && podeEditar && <button type="button" disabled={salvando} aria-expanded={editando}
      aria-controls="edicao-entregavel" onClick={() => { setEditando((anterior) => !anterior); setSucesso(''); }}
      className="inline-flex items-center gap-2 rounded-lg border border-brand-green/50 px-4 py-2 text-sm font-semibold text-brand-neon disabled:opacity-50">
      {editando ? 'Editando entregável' : 'Editar entregável'}
      <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8"
        className={`h-4 w-4 transition-transform duration-300 motion-reduce:transition-none ${editando ? 'rotate-180' : ''}`}>
        <path d="m5 7.5 5 5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
    </button>}
    {item && podeEditar && editando && <div id="edicao-entregavel" className="etapa-form-expandido">
      <FormularioEntregavel key={item.id} contratoId={contratoId} etapaId={item.etapaId} inicial={item} onSalvar={salvar}
        onCancelar={() => setEditando(false)} onSalvandoMudou={setSalvando} />
    </div>}
    {item && !editando && <ConteudoEntregavel item={item} />}
  </AreaContratos>;
}
