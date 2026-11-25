import { ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import { permissoesEfetivas, type ChavePermissao } from './permissoes-granulares.js';
import type { UsuarioAutenticado } from './usuario-autenticado.js';

/** Revalidação sob lock, antes da raiz e de qualquer escrita. */
export async function bloquearIdentidade(m: EntityManager, ator: UsuarioAutenticado): Promise<Usuario> {
  const usuario = await m.getRepository(Usuario).findOne({ where: { id: ator.id }, lock: { mode: 'pessimistic_read' } });
  if (!usuario?.ativo || usuario.bloqueioSessoesId || usuario.perfil !== ator.perfil || usuario.supertokensUserId !== ator.supertokensUserId)
    throw new ForbiddenException('Usuário indisponível para esta operação');
  return usuario;
}

export async function bloquearIdentidadeEAcl(m: EntityManager, contratoId: string,
  ator: UsuarioAutenticado): Promise<Record<ChavePermissao, boolean>> {
  const usuario = await bloquearIdentidade(m, ator);
  if (usuario.perfil === 'ADMINISTRADOR') return permissoesEfetivas(usuario.perfil, true, null);
  const vinculo = await m.getRepository(PermissaoContrato).findOne({ where: { contratoId, usuarioId: ator.id }, lock: { mode: 'pessimistic_read' } });
  if (!vinculo) throw new ForbiddenException('Sem permissão para esta operação');
  return permissoesEfetivas(usuario.perfil, vinculo.podeEditar, vinculo.permissoesDetalhadas);
}

export async function exigirPermissaoTransacional(m: EntityManager, contratoId: string,
  ator: UsuarioAutenticado, chave: ChavePermissao): Promise<void> {
  if (!(await bloquearIdentidadeEAcl(m, contratoId, ator))[chave])
    throw new ForbiddenException('Sem permissão para esta operação');
}
