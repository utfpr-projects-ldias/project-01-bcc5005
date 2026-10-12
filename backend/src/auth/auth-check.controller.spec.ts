import { UnauthorizedException } from '@nestjs/common';
import type { SessionRequest } from 'supertokens-node/framework/express';

import { AuthCheckController } from './auth-check.controller.js';

describe('AuthCheckController', () => {
  const controller = new AuthCheckController();

  it('retorna o ID do usuario quando existe sessao', () => {
    const request = {
      session: {
        getUserId: () => 'usuario-teste',
      },
    } as unknown as SessionRequest;

    expect(controller.check(request)).toEqual({
      ok: true,
      userId: 'usuario-teste',
    });
  });

  it('nega acesso quando nao existe sessao', () => {
    const request = {} as SessionRequest;

    expect(() => controller.check(request)).toThrow(
      UnauthorizedException,
    );
  });
});
