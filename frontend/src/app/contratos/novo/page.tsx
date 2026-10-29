'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { consultarMeuPerfil, type UsuarioPublico } from '@/lib/admin-usuarios';
import { criarContrato, listarResponsaveis, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { FormularioContrato } from '../components/formulario-contrato';
import { ConfirmacaoSimples } from '@/app/components/confirmacao-simples';

export default function NovoContratoPage() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [responsaveis, setResponsaveis] = useState<UsuarioPublico[]>([]);
  const [listaIncompleta, setListaIncompleta] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [pendente, setPendente] = useState<DadosContrato | null>(null);
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const usuario = await consultarMeuPerfil();
        if (!usuario.ativo || usuario.perfil !== 'ADMINISTRADOR') { if (vivo) setErro('Acesso restrito ao Administrador.'); return; }
        const lista = await listarResponsaveis();
        if (vivo) { setResponsaveis(lista.usuarios); setListaIncompleta(lista.incompleta); setAutorizado(true); }
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível validar a sessão.'); }
      finally { if (vivo) setVerificando(false); }
    })();
    return () => { vivo = false; };
  }, []);
  async function confirmarCadastro() {
    if (!pendente || salvando) return;
    setErro(''); setSalvando(true);
    try {
      const criado = await criarContrato(pendente);
      setPendente(null);
      router.push(`/contratos/${encodeURIComponent(criado.id)}`);
    } catch (e) {
      setPendente(null);
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.');
    } finally { setSalvando(false); }
  }
  return <AreaContratos titulo="Cadastrar contrato">
    <LinkVoltar href="/contratos">Voltar aos contratos</LinkVoltar>
    {verificando ? <Aviso>Verificando sua autorização...</Aviso> : !autorizado ? <><h2 className="text-lg font-semibold">Acesso restrito</h2><Aviso erro>{erro}</Aviso></> : <>
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
