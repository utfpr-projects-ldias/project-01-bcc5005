import {
  Body, Controller, Get, HttpCode, HttpStatus, Post, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';

/** Sessão, identidade ativa e perfil ADMINISTRADOR validados pelo guard global. */
@Controller('admin/usuarios')
@ExigirPolitica('usuarios:administrar')
export class AdministracaoUsuariosController {
  constructor(private readonly administracao: AdministracaoUsuariosService) {}

  @Get()
  listar() {
    return this.administracao.listar();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  criar(@Body() dto: CriarFuncionarioDto) {
    return this.administracao.criar(dto);
  }
}
