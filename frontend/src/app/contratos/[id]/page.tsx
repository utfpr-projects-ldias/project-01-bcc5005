'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { consultarMeuPerfil } from '@/lib/admin-usuarios';
import { buscarContrato, consultarAcessoContrato, dataCivil, MODOS, STATUS, type Contrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';

export default function DetalheContratoPage() {
  const { id } = useParams<{ id: string }>();
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const perfil = await consultarMeuPerfil();
        if (!perfil.ativo) throw new Error('Conta inativa');
        const [c, acesso] = await Promise.all([buscarContrato(id), consultarAcessoContrato(id)]);
        if (vivo) { setContrato(c); setPodeEditar(acesso.podeEditar); }
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível consultar o contrato.'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [id]);
  const campos = contrato ? [
    ['Número', contrato.numeroContrato], ['Órgão', contrato.orgaoContratante], ['Objeto', contrato.objeto],
    ['Início de vigência', dataCivil(contrato.inicioVigencia)], ['Término de vigência', dataCivil(contrato.terminoVigencia)],
    ['Status', STATUS[contrato.status]], ['Cálculo físico', MODOS[contrato.modoCalculo]],
    ['Processo administrativo', contrato.processoAdministrativo], ['Unidade responsável', contrato.unidadeResponsavel],
    ['Descrição', contrato.descricao], ['Data da assinatura', dataCivil(contrato.dataAssinatura)],
    ['Responsável interno (UUID)', contrato.responsavelInternoId], ['Fiscal/gestor público', contrato.fiscalGestor],
    ['Observações', contrato.observacoes],
  ] : [];
  return <AreaContratos titulo="Detalhes do contrato">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/contratos" className="text-sm text-brand-neon underline">Voltar à lista</Link>
      {podeEditar && contrato && <Link href={`/contratos/${encodeURIComponent(contrato.id)}/editar`} className="rounded-lg bg-brand-green px-4 py-2 text-sm font-semibold text-background">Editar contrato</Link>}
    </div>
    {carregando ? <Aviso>Carregando contrato...</Aviso> : erro ? <Aviso erro>{erro}</Aviso> : contrato ? <>
      <h2 className="text-xl font-semibold text-brand-neon">{contrato.numeroContrato}</h2>
      <dl className="grid gap-3 md:grid-cols-2">{campos.map(([titulo, valor]) => <div key={titulo} className="min-w-0 rounded-xl border border-brand-green/20 p-4">
        <dt className="text-xs font-semibold text-foreground/55">{titulo}</dt><dd className="mt-2 break-words text-sm">{valor || 'Não informado'}</dd>
      </div>)}</dl>
      <Aviso>Documentos contratuais protegidos serão vinculados na TEC08. Esta tela não afirma que há PDF armazenado.</Aviso>
    </> : <Aviso erro>Contrato não encontrado.</Aviso>}
  </AreaContratos>;
}
