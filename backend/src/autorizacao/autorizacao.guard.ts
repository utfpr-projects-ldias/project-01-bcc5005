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
import { politicaOperacional } from './politicas-operacionais.js';
import { ResolverEscopoContratoService } from './resolver-escopo-contrato.service.js';
import { SessaoSuperTokensService } from './sessao-supertokens.service.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';

/** Guard global fail-closed: a autorização real sempre ocorre no backend. */
@Injectable()
export class AutorizacaoGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessoes: SessaoSuperTokensService,
    private readonly usuarios: UsuariosService,
    private readonly politicaAcesso: PoliticaAcessoService,
    private readonly escopos: ResolverEscopoContratoService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const req = context.switchToHttp().getRequest<RequisicaoAutorizada>();
    const res = context.switchToHttp().getResponse<Response>();
    const politica = this.reflector.getAllAndOverride<Politica>(CHAVE_POLITICA, [
      context.getHandler(), context.getClass(),
    ]);
    const publica = /^\/$/i.test(req.path) || /^\/auth(?!\/me(?:\/|$))(?:\/|$)/i.test(req.path) || /^\/protected\/ping(?:\/|$)/i.test(req.path);
    if (!politica && publica) return true;

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

    const operacao = politicaOperacional(politica.acao);
    if (operacao) {
      const escopo = politica.escopoOperacional;
      // Rota operativa sem escopo válido ou com recurso incompatível: fechada.
      if (!escopo || escopo.tipo !== operacao.escopo ||
        (escopo.tipo === 'recurso' && escopo.recurso !== operacao.recurso)) {
        throw new ForbiddenException('Política operacional inválida');
      }
      const contratoRaiz = await this.escopos.resolver(escopo, req.params ?? {});
      if (!contratoRaiz) throw new NotFoundException('Recurso não encontrado');
      const permitido = await this.politicaAcesso.permitido(req.usuarioDominio, politica, contratoRaiz);
      if (!permitido) throw new NotFoundException('Recurso não encontrado');
      return true;
    }

    // Compatibilidade com as operações de Contratos/Usuários já implementadas.
    const valorContrato = politica.parametroContrato
      ? req.params?.[politica.parametroContrato]
      : undefined;
    const contratoId = typeof valorContrato === 'string' ? valorContrato : undefined;
    const permitido = await this.politicaAcesso.permitido(req.usuarioDominio, politica, contratoId);
    if (!permitido) {
      if (politica.acao === 'contratos:visualizar' || politica.acao === 'contratos:editar') {
        throw new NotFoundException('Contrato não encontrado');
      }
      throw new ForbiddenException('Operação não autorizada');
    }
    return true;
  }
}
