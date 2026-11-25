import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { SessionRequest } from 'supertokens-node/framework/express';

@Controller('protected')
export class AuthCheckController {
  @Get('ping')
  @ExigirPolitica('perfil:proprio')
  check(@Req() request: SessionRequest) {
    const session = request.session;

    if (!session) {
      throw new UnauthorizedException('Sessão obrigatória');
    }

    return {
      ok: true,
      userId: session.getUserId(),
    };
  }
}
