import {
  Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus,
  Post, Req, Res, UnauthorizedException, UsePipes, ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import Session from 'supertokens-node/recipe/session';
import type { SessionRequest } from 'supertokens-node/framework/express';
import { AuthService } from './auth.service.js';
import { SigninDto } from './dto/signin.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** Compatibilidade: cliente antigo recebe 403, sem criar identidade. */
  @Post('signup')
  @HttpCode(HttpStatus.FORBIDDEN)
  signup(): never {
    throw new ForbiddenException('Cadastro público desabilitado');
  }

  @Post('signin')
  @HttpCode(HttpStatus.OK)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  async signin(
    @Body() dto: SigninDto,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const user = await this.authService.signin(dto);
    await Session.createNewSession(request, response, 'public', user.recipeUserId);
    return response.status(HttpStatus.OK).json({
      id: user.id,
      email: user.email,
      role: user.role, // resposta legada; NUNCA determina permissão de domínio
    });
  }

  @Get('me')
  @HttpCode(HttpStatus.OK)
  async getMe(@Req() request: SessionRequest) {
    const session = request.session;
    if (!session) throw new UnauthorizedException('Sessão obrigatória');
    return this.authService.getMe(session.getUserId());
  }
}
