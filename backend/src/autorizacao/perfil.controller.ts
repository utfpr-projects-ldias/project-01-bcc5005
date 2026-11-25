import { createHash } from 'node:crypto';
import { Controller, ForbiddenException, Get, Req } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Contrato } from '../contratos/contrato.entity.js';
import { Usuario } from '../usuarios/usuario.entity.js';
import { PerfilUsuario } from '../usuarios/perfil-usuario.enum.js';
import { PermissaoContrato } from './permissao-contrato.entity.js';
import { permissoesEfetivas } from './permissoes-granulares.js';
import { ExigirPolitica } from './politica.decorator.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';

@Controller('usuarios')
export class PerfilController {
  constructor(private readonly db: DataSource) {}

  @Get('me')
  @ExigirPolitica('perfil:proprio')
  obterPerfil(@Req() req: RequisicaoAutorizada) {
    const sessao = req.usuarioDominio!;
    return this.db.transaction('REPEATABLE READ', async m => {
      const usuario = await m.getRepository(Usuario).findOneBy({ id: sessao.id });
      if (!usuario?.ativo || usuario.bloqueioSessoesId || usuario.supertokensUserId !== sessao.supertokensUserId)
        throw new ForbiddenException('Conta indisponível');
      // O hash não concede acesso: é apenas uma versão opaca para descartar telas
      // e rascunhos protegidos quando a ACL real mudar, inclusive acesso por responsabilidade.
      const escopo = usuario.perfil === PerfilUsuario.ADMINISTRADOR ? [] : await Promise.all([
        m.getRepository(PermissaoContrato).find({ where: { usuarioId: usuario.id }, order: { contratoId: 'ASC' } }),
        m.getRepository(Contrato).find({ where: { responsavelInternoId: usuario.id }, select: { id: true }, order: { id: 'ASC' } }),
      ]).then(([vinculos, contratos]) => [vinculos.map(v => [v.contratoId, permissoesEfetivas(usuario.perfil, v.podeEditar, v.permissoesDetalhadas)]), contratos.map(c => c.id)]);
      const versaoAcesso = createHash('sha256').update(JSON.stringify([usuario.perfil, escopo])).digest('hex');
      return { id: usuario.id, nome: usuario.nome ?? null, email: usuario.email, perfil: usuario.perfil, ativo: true, versaoAcesso };
    });
  }
}
