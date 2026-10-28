'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { consultarMeuPerfil, type UsuarioPublico } from '@/lib/admin-usuarios';
import { criarContrato, listarResponsaveis, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../components/area-contratos';
import { FormularioContrato } from '../components/formulario-contrato';

export default function NovoContratoPage() {
  const router = useRouter();
  const [verificando, setVerificando] = useState(true);
  const [autorizado, setAutorizado] = useState(false);
  const [responsaveis, setResponsaveis] = useState<UsuarioPublico[]>([]);
  const [listaIncompleta, setListaIncompleta] = useState(false);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
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
  async function salvar(dados: DadosContrato) {
    setErro(''); setSalvando(true);
    try { const criado = await criarContrato(dados); router.push(`/contratos/${encodeURIComponent(criado.id)}`); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Não foi possível salvar o contrato.'); }
    finally { setSalvando(false); }
  }
  return <AreaContratos titulo="Cadastrar contrato">
    <Link href="/contratos" className="text-sm text-brand-neon underline">Voltar à lista</Link>
    {verificando ? <Aviso>Verificando sua autorização...</Aviso> : !autorizado ? <><h2 className="text-lg font-semibold">Acesso restrito</h2><Aviso erro>{erro}</Aviso></> : <>
      {listaIncompleta && <Aviso>A lista de responsáveis foi limitada. Use apenas usuários ativos encontrados ou deixe o vínculo em branco.</Aviso>}
      {erro && <Aviso erro>{erro}</Aviso>}
      <FormularioContrato responsaveis={responsaveis} onSalvar={salvar} salvando={salvando} />
    </>}
  </AreaContratos>;
}
