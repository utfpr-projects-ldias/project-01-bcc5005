'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato } from '@/hooks/use-contratos';
import { dataCivil, MODOS, STATUS } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { PainelEtapas } from '../components/painel-etapas';

type Par = [titulo: string, valor: string | null | undefined];
function dataBR(valor: string | null | undefined): string {
  const data = dataCivil(valor);
  return /^\d{4}-\d{2}-\d{2}$/.test(data) ? data.split('-').reverse().join('/') : 'Não informado';
}
function GrupoDados({ titulo, descricao, campos }: { titulo: string; descricao?: string; campos: Par[] }) {
  return <section className="rounded-2xl border border-brand-green/25 bg-brand-darkgreen/10 p-4 md:p-6 space-y-4">
    <div><h3 className="text-lg font-semibold text-brand-neon">{titulo}</h3>
      {descricao && <p className="mt-1 text-sm text-foreground/65">{descricao}</p>}</div>
    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">{campos.map(([rotulo, valor]) => <div key={rotulo} className="min-w-0">
      <dt className="text-xs font-medium text-foreground/55">{rotulo}</dt>
      <dd className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere] text-sm">{valor?.trim() || 'Não informado'}</dd>
    </div>)}</dl>
  </section>;
}

export default function DetalheContratoPage() {
  const { id } = useParams<{ id: string }>();
  const { dados: perfil, carregando: verificando, erro: erroPerfil } = useMeuPerfil();
  const contratoQuery = useContrato(id, !!perfil?.ativo);
  const acessoQuery = useAcessoContrato(id, !!perfil?.ativo);
  const erroConsulta = erroPerfil || contratoQuery.erro || acessoQuery.erro;
  const erro = erroConsulta instanceof Error ? erroConsulta.message : erroConsulta ? 'Não foi possível consultar o contrato.' : '';
  const carregando = verificando || (!!perfil?.ativo && (contratoQuery.carregando || acessoQuery.carregando));
  const contrato = !erroConsulta && perfil?.ativo ? contratoQuery.dados : undefined;
  const podeEditar = !erroConsulta && !!acessoQuery.dados?.podeEditar;
  return <AreaContratos titulo="Detalhes do contrato">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <LinkVoltar href="/contratos">Voltar aos contratos</LinkVoltar>
      {podeEditar && contrato && <Link href={`/contratos/${encodeURIComponent(contrato.id)}/editar`}
        className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-background">Editar contrato</Link>}
    </div>
    {carregando ? <Aviso>Carregando contrato...</Aviso> : erro ? <Aviso erro>{erro}</Aviso> : contrato ? <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 w-full"><h2 title={contrato.numeroContrato} className="line-clamp-2 max-w-full [overflow-wrap:anywhere] text-2xl font-bold leading-snug text-brand-neon">{contrato.numeroContrato}</h2>
          <p className="mt-1 max-w-full [overflow-wrap:anywhere] text-sm text-foreground/70">{contrato.orgaoContratante}</p></div>
        <span className="rounded-full border border-brand-green/30 bg-brand-green/10 px-3 py-1.5 text-xs font-medium">{STATUS[contrato.status]}</span>
      </div>
      <GrupoDados titulo="Identificação" campos={[
        ['Objeto contratual', contrato.objeto], ['Número do contrato', contrato.numeroContrato],
        ['Órgão contratante', contrato.orgaoContratante], ['Processo administrativo', contrato.processoAdministrativo],
        ['Unidade responsável', contrato.unidadeResponsavel], ['Descrição', contrato.descricao],
      ]} />
      <GrupoDados titulo="Vigência e execução" descricao="O avanço físico depende dos entregáveis vinculados ao contrato."
        campos={[
          ['Início da vigência', dataBR(contrato.inicioVigencia)], ['Término da vigência', dataBR(contrato.terminoVigencia)],
          ['Data de assinatura', dataBR(contrato.dataAssinatura)], ['Status operacional', STATUS[contrato.status]],
          ['Modo de cálculo', MODOS[contrato.modoCalculo]],
        ]} />
      <GrupoDados titulo="Responsáveis e observações" descricao="O responsável interno é uma referência administrativa; acessos por contrato são concedidos na Administração."
        campos={[
          ['Responsável interno (identificador)', contrato.responsavelInternoId],
          ['Fiscal/gestor público (informativo)', contrato.fiscalGestor], ['Observações', contrato.observacoes],
        ]} />
      <PainelEtapas key={contrato.id} contratoId={contrato.id} habilitado={!!perfil?.ativo}
        podeGerenciar={(perfil?.perfil === 'ADMINISTRADOR' || perfil?.perfil === 'GESTOR') && podeEditar} />
      <Aviso>Os documentos deste contrato ainda não estão disponíveis nesta área.</Aviso>
    </> : <Aviso erro>Contrato não encontrado.</Aviso>}
  </AreaContratos>;
}
