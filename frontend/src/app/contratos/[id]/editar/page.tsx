'use client';

import { LinkVoltar } from '@/app/components/link-voltar';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { consultarMeuPerfil, type UsuarioPublico } from '@/lib/admin-usuarios';
import { buscarContrato, consultarAcessoContrato, editarContrato, listarResponsaveis, type Contrato, type DadosContrato } from '@/lib/contratos';
import { AreaContratos, Aviso } from '../../components/area-contratos';
import { FormularioContrato } from '../../components/formulario-contrato';

export default function EditarContratoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [contrato, setContrato] = useState<Contrato | null>(null);
  const [responsaveis, setResponsaveis] = useState<UsuarioPublico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [autorizado, setAutorizado] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const perfil = await consultarMeuPerfil();
        if (!perfil.ativo) throw new Error('Conta inativa.');
        const acesso = await consultarAcessoContrato(id);
        if (!acesso.podeEditar) throw new Error('Você não possui permissão para editar este contrato.');
        const c = await buscarContrato(id);
        const lista = perfil.perfil === 'ADMINISTRADOR' ? await listarResponsaveis() : { usuarios: [] };
        if (vivo) { setContrato(c); setResponsaveis(lista.usuarios); setAdmin(perfil.perfil === 'ADMINISTRADOR'); setAutorizado(true); }
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Não foi possível carregar edição.'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [id]);
  async function salvar(dados: DadosContrato) {
    setSalvando(true); setErro('');
    try {
      // Não-ADMIN/Gestor não pode alterar responsável: a política do servidor autoriza
      // edição do contrato por vínculo, não gestão de carteiras de outros usuários.
      const atualizado = await editarContrato(id, dados);
      router.push(`/contratos/${encodeURIComponent(atualizado.id)}`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao salvar alterações.'); }
    finally { setSalvando(false); }
  }
  return <AreaContratos titulo="Editar contrato">
    <LinkVoltar href={`/contratos/${encodeURIComponent(id)}`}>Voltar aos detalhes</LinkVoltar>
    {carregando ? <Aviso>Verificando permissão de edição...</Aviso> : !autorizado ? <Aviso erro>{erro || 'Edição não permitida.'}</Aviso> : contrato ? <>
      {erro && <Aviso erro>{erro}</Aviso>}
      <FormularioContrato inicial={contrato} responsaveis={responsaveis} onSalvar={salvar} salvando={salvando} podeDefinirResponsavel={admin} />
    </> : <Aviso erro>Contrato indisponível.</Aviso>}
  </AreaContratos>;
}
