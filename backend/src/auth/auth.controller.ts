import {
  Body, Controller, ForbiddenException, Get, HttpCode, HttpStatus,
  Post, Req, Res, UsePipes, ValidationPipe,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import Session from 'supertokens-node/recipe/session';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
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
  @ExigirPolitica('perfil:proprio')
  getMe(@Req() request: RequisicaoAutorizada) {
    // O guard confere a sessão E o domínio ativo; nunca retornar o role legado.
    return request.usuarioDominio;
  }
}
