'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useContrato, useAcessoContrato, useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { ConfirmacaoVigenciaNecessaria, prepararEdicaoContrato, type DadosContrato, type Contrato } from '@/lib/contratos';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';
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
  const [impacto, setImpacto] = useState<ConfirmacaoVigenciaNecessaria | null>(null);
  const autorizado = !!perfil?.ativo && !!(acessoQuery.dados?.permissoes?.editarContrato ?? acessoQuery.dados?.podeEditar) && !erroConsulta &&
    !contratoQuery.dados?.arquivadoEm && !contratoQuery.dados?.conclusaoSolicitadaEm && !contratoQuery.dados?.encerramentoSolicitado &&
    !['CONCLUIDO','CONCLUIDO_PARCIALMENTE','ENCERRADO','FINALIZADO','SUSPENSO','CANCELADO'].includes(contratoQuery.dados?.status ?? '');
  const contrato = autorizado ? contratoQuery.dados : undefined;
  const responsaveis = [
    ...(admin && perfil ? [{ ...perfil, criadoEm: '' }] : []),
    ...(responsaveisQuery.dados?.usuarios ?? []),
  ].filter((u,indice,todos)=>todos.findIndex(v=>v.id===u.id)===indice);
  async function persistir(dados: Partial<DadosContrato>, confirmacao?: string) {
    if (salvando) return;
    setSalvando(true); setErro('');
    try {
      const atualizado = await editar(id, dados, confirmacao);
      setImpacto(null);
      router.push(`/contratos/${encodeURIComponent(atualizado.id)}`);
    } catch (e) {
      if (e instanceof ConfirmacaoVigenciaNecessaria) setImpacto(e);
      else { setImpacto(null); setErro(e instanceof Error ? e.message : 'Falha ao salvar alterações.'); }
    } finally { setSalvando(false); }
  }
  async function salvar(dados: DadosContrato, base: Contrato = contrato!) {
    if (!base || !autorizado) return;
    const alteracoes = prepararEdicaoContrato(base, dados);
    if (!Object.keys(alteracoes).length) { router.push(`/contratos/${encodeURIComponent(id)}`); return; }
    await persistir(alteracoes);
  }
  return <AreaContratos titulo="Editar contrato">
    <LinkVoltar href={`/contratos/${encodeURIComponent(id)}`}>Voltar aos detalhes</LinkVoltar>
    {carregando ? <Aviso>Verificando permissão de edição...</Aviso> : !autorizado ? <Aviso erro>{erro || (erroConsulta instanceof Error ? erroConsulta.message : 'Edição não permitida.')}</Aviso> : contrato ? <>
      {erro && <Aviso erro>{erro}</Aviso>}
      <FormularioContrato key={contrato.id} inicial={contrato} responsaveis={responsaveis} onSalvar={salvar} onSalvarComBase={salvar} salvando={salvando} podeDefinirResponsavel={admin} />
    </> : <Aviso erro>Contrato indisponível.</Aviso>}
    {impacto && <ConfirmacaoSimples titulo="Confirmar alteração da vigência?"
      descricao={`${impacto.impacto.total} ocorrência(s) e ${impacto.impacto.planos} planejamento(s) serão preservados; ${impacto.impacto.preservadasFora} registro(s) históricos ficarão fora da nova vigência.`}
      confirmar="Confirmar vigência" ocupado={salvando} onCancelar={() => setImpacto(null)}
      onConfirmar={() => void persistir(impacto.dados, impacto.impacto.confirmacao)} />}
  </AreaContratos>;
}
