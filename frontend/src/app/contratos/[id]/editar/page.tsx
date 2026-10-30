'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../../components/area-contratos';
import { FormularioContrato } from '../../components/formulario-contrato';

export default function EditarContratoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { dados: perfil, carregando: verificando, erro: erroPerfil } = useMeuPerfil();
  const admin = !!perfil?.ativo && perfil.perfil === 'ADMINISTRADOR';
  const contratoQuery = useContrato(id, !!perfil?.ativo);
  const acessoQuery = useAcessoContrato(id, !!perfil?.ativo);
  // Apenas o Administrador pode gerenciar o responsável interno.
  // A consulta é restrita no backend e somente é feita com permissão efetiva de edição.
  const responsaveisQuery = useResponsaveis(admin && !!acessoQuery.dados?.podeEditar);
  const { editar } = useMutacoesContrato();
  const carregando = verificando || (!!perfil?.ativo && (contratoQuery.carregando || acessoQuery.carregando || (admin && acessoQuery.dados?.podeEditar && responsaveisQuery.carregando)));
  const erroConsulta = erroPerfil || contratoQuery.erro || acessoQuery.erro || responsaveisQuery.erro;
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const autorizado = !!perfil?.ativo && !!acessoQuery.dados?.podeEditar && !erroConsulta;
  const contrato = autorizado ? contratoQuery.dados : undefined;
  const responsaveis = responsaveisQuery.dados?.usuarios ?? [];
  async function salvar(dados: DadosContrato) {
    setSalvando(true); setErro('');
    try {
      // Não-ADMIN/Gestor não pode alterar responsável: a política do servidor autoriza
      // edição do contrato por vínculo, não gestão de carteiras de outros usuários.
      const atualizado = await editar(id, dados);
      router.push(`/contratos/${encodeURIComponent(atualizado.id)}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar alterações.'); }
    finally { setSalvando(false); }
  }
  return <AreaContratos titulo="Editar contrato">
    <LinkVoltar href={`/contratos/${encodeURIComponent(id)}`}>Voltar aos detalhes</LinkVoltar>
    {carregando ? <Aviso>Verificando permissão de edição...</Aviso> : !autorizado ? <Aviso erro>{erro || (erroConsulta instanceof Error ? erroConsulta.message : 'Edição não permitida.')}</Aviso> : contrato ? <>
      {erro && <Aviso erro>{erro}</Aviso>}
      <FormularioContrato inicial={contrato} responsaveis={responsaveis} onSalvar={salvar} salvando={salvando} podeDefinirResponsavel={admin} />
    </> : <Aviso erro>Contrato indisponível.</Aviso>}
  </AreaContratos>;
}
