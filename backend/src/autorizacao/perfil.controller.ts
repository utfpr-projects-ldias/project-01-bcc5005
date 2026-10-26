import { Controller, Get, Req } from '@nestjs/common';
import { ExigirPolitica } from './politica.decorator.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';

@Controller('usuarios')
export class PerfilController {
  @Get('me')
  @ExigirPolitica('perfil:proprio')
  obterPerfil(@Req() req: RequisicaoAutorizada) {
    // Atribuído somente pelo guard global após verificar sessão e banco.
    const usuario = req.usuarioDominio!;
    return { id: usuario.id, email: usuario.email, perfil: usuario.perfil, ativo: true };
  }
}
