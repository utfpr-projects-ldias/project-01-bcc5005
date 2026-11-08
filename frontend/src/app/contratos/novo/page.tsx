'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMeuPerfil } from '@/hooks/use-meu-perfil';
import { useResponsaveis, useMutacoesContrato } from '@/hooks/use-contratos';
import { type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { FormularioContrato } from '../components/formulario-contrato';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';

export default function NovoContratoPage() {
  const router = useRouter();
  const { dados: perfil, erro: erroPerfil, carregando: perfilCarregando } = useMeuPerfil();
  const autorizado = !!perfil?.ativo && perfil.perfil === 'ADMINISTRADOR';
  const responsaveisQuery = useResponsaveis(autorizado);
  const { criar } = useMutacoesContrato();
  const verificando = perfilCarregando || (autorizado && responsaveisQuery.carregando);
  const responsaveis = responsaveisQuery.dados?.usuarios ?? [];
  const listaIncompleta = !!responsaveisQuery.dados?.incompleta;
  const erroAcesso = erroPerfil || responsaveisQuery.erro ? (erroPerfil instanceof Error ? erroPerfil.message : responsaveisQuery.erro instanceof Error ? responsaveisQuery.erro.message : 'Falha ao consultar autorização.') : '';
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState<DadosContrato | null>(null);
  async function confirmarCadastro() {
    if (!pendente || salvando) return;
    setErro(''); setSalvando(true);
    try {
      const criado = await criar(pendente);
      setPendente(null);
      router.push(`/contratos/${encodeURIComponent(criado.id)}`);
    } catch (e) {
      setPendente(null);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.');
    } finally { setSalvando(false); }
  }
  return <AreaContratos titulo="Cadastrar contrato">
    <LinkVoltar href="/contratos">Voltar aos contratos</LinkVoltar>
    {verificando ? <Aviso>Verificando sua autorização...</Aviso> : !autorizado || erroAcesso ? <><h2 className="text-lg font-semibold">Acesso restrito</h2><Aviso erro>{erroAcesso || "Acesso restrito ao Administrador."}</Aviso></> : <>
      {listaIncompleta && <Aviso>A lista de responsáveis foi limitada. Use apenas usuários ativos encontrados ou deixe o vínculo em branco.</Aviso>}
      {erro && <Aviso erro>{erro}</Aviso>}
      <FormularioContrato responsaveis={responsaveis} onSalvar={async dados => { setErro(''); setPendente(dados); }} salvando={salvando} />
      {pendente && <ConfirmacaoSimples
        titulo="Confirmar cadastro?"
        descricao={`Cadastrar o contrato ${pendente.numeroContrato}? Os dados serão gravados no sistema.`}
        confirmar="Confirmar cadastro"
        ocupado={salvando}
        onCancelar={() => setPendente(null)}
        onConfirmar={() => void confirmarCadastro()}
      />}
    </>}
  </AreaContratos>;
}
