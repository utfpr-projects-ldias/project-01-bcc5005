import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';

import { UsuariosService } from '../usuarios/usuarios.service.js';
import { CHAVE_POLITICA, type Politica } from './politica.decorator.js';
import { PoliticaAcessoService } from './politica-acesso.service.js';
import { SessaoSuperTokensService } from './sessao-supertokens.service.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';

/**
 * Global: políticas explícitas em rotas de domínio + default-deny para namespaces
 * reservados. /auth continua na TEC07-04; /protected/ping permanece técnico.
 */
@Injectable()
export class AutorizacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessoes: SessaoSuperTokensService,
    private readonly usuarios: UsuariosService,
    private readonly politicaAcesso: PoliticaAcessoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<RequisicaoAutorizada>();
    const res = context.switchToHttp().getResponse<Response>();
    const politica = this.reflector.getAllAndOverride<Politica>(CHAVE_POLITICA, [
      context.getHandler(), context.getClass(),
    ]);
    // Nenhum controller sob /contratos ou /admin/usuarios fica público por omissão.
    const publica = /^\/$/i.test(req.path) || /^\/auth(?!\/me(?:\/|$))(?:\/|$)/i.test(req.path) || /^\/protected\/ping(?:\/|$)/i.test(req.path);
    if (!politica && publica) return true;
    // Todo novo controller (etapas, evidências, documentos etc.) é fechado por padrão.
    // Mesmo uma rota interna sem decorator precisa de sessão ativa e falha 403.


    const supertokensUserId = await this.sessoes.identificar(req, res);
    const usuario = await this.usuarios.buscarAtivoPorSupertokensId(supertokensUserId);
    if (!usuario) throw new ForbiddenException('Usuário não provisionado ou inativo');
    req.usuarioDominio = {
      id: usuario.id,
      supertokensUserId: usuario.supertokensUserId,
      email: usuario.email,
      nome: usuario.nome ?? null,
      perfil: usuario.perfil,
    };

    if (!politica) throw new ForbiddenException('Rota interna sem política de autorização');

    // ID obrigatoriamente obtido de parâmetro de rota, nunca do body/query.
    const valorContrato = politica.parametroContrato
      ? req.params?.[politica.parametroContrato]
      : undefined;
    const contratoId = typeof valorContrato === 'string'
      ? valorContrato
      : undefined;
    const permitido = await this.politicaAcesso.permitido(req.usuarioDominio, politica, contratoId);
    if (!permitido) {
      if (politica.acao === 'contratos:visualizar' || politica.acao === 'contratos:editar') {
        // Evita confirmar a existência de ID de contrato alheio (RNF-02).
        throw new NotFoundException('Contrato não encontrado');
      }
      throw new ForbiddenException('Operação não autorizada');
    }
    return true;
  }
}
