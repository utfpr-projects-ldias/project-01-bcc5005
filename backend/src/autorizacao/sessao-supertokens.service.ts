import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Error as SuperTokensError } from 'supertokens-node';
import Session from 'supertokens-node/recipe/session';

/** Único ponto de validação de sessão: SDK oficial (cookies, anti-CSRF e tokens). */
@Injectable()
export class SessaoSuperTokensService {
  async identificar(req: Request, res: Response): Promise<string> {
    try {
      const session = await Session.getSession(req, res, { sessionRequired: true });
      if (!session) throw new UnauthorizedException('Sessão obrigatória');
      return session.getUserId();
    } catch (error: unknown) {
      if (error instanceof UnauthorizedException) throw error;
      if (SuperTokensError.isErrorFromSuperTokens(error)) {
        if (error.type === 'UNAUTHORISED' || error.type === 'TRY_REFRESH_TOKEN') {
          throw new UnauthorizedException('Sessão ausente, inválida ou expirada');
        }
        if (error.type === 'INVALID_CLAIMS') {
          throw new ForbiddenException('Requisitos de sessão não atendidos');
        }
      }
      throw error; // falhas de infraestrutura não são disfarçadas de 401
    }
  }
}
