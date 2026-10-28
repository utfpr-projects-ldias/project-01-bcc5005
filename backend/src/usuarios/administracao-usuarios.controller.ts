import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto.js';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';

const validacao = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

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
  @UsePipes(validacao)
  criar(@Body() dto: CriarFuncionarioDto) {
    return this.administracao.criar(dto);
  }

  @Patch(':id')
  @UsePipes(validacao)
  atualizar(
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AtualizarFuncionarioDto,
    @Req() requisicao: RequisicaoAutorizada,
  ) {
    return this.administracao.atualizar(id, dto, requisicao.usuarioDominio!);
  }
}
