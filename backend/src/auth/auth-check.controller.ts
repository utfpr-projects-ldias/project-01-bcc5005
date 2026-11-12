import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
} from '@nestjs/common';

import type { SessionRequest } from 'supertokens-node/framework/express';

@Controller('protected')
export class AuthCheckController {
  @Get('ping')
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
