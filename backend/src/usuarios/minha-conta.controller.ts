import { Body, Controller, HttpCode, HttpStatus, Patch, Put, Req, UsePipes, ValidationPipe } from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AlterarMeuEmailDto, AlterarMeuNomeDto, AlterarMinhaSenhaDto } from './dto/minha-conta.dto.js';
import { MinhaContaService } from './minha-conta.service.js';

/** A identidade do alvo vem SOMENTE do guard, jamais de parâmetros do cliente. */
@Controller('usuarios/me')
@ExigirPolitica('perfil:proprio')
export class MinhaContaController {
  constructor(private readonly minhaConta: MinhaContaService) {}

  @Patch('nome')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  alterarMeuNome(@Body() dto: AlterarMeuNomeDto, @Req() req: RequisicaoAutorizada) {
    return this.minhaConta.alterarNome(dto.nome, req.usuarioDominio!);
  }

  @Patch('email')
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  alterarMeuEmail(@Body() dto: AlterarMeuEmailDto, @Req() req: RequisicaoAutorizada) {
    return this.minhaConta.alterarEmail(dto.email, dto.senhaAtual, req.usuarioDominio!);
  }

  @Put('senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }))
  alterarMinhaSenha(@Body() dto: AlterarMinhaSenhaDto, @Req() req: RequisicaoAutorizada) {
    return this.minhaConta.alterarSenha(dto.senhaAtual, dto.novaSenha, req.usuarioDominio!);
  }
}
