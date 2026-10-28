import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Patch, Post, Put, Query, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPolitica } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AdministracaoUsuariosService } from './administracao-usuarios.service.js';
import { AtualizarFuncionarioDto } from './dto/atualizar-funcionario.dto.js';
import { CriarFuncionarioDto } from './dto/criar-funcionario.dto.js';
import { ConsultarFuncionariosDto } from './dto/consultar-funcionarios.dto.js';
import { AlterarEmailDto, RedefinirSenhaDto } from './dto/credenciais-funcionario.dto.js';

const validacao = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

@Controller('admin/usuarios')
@ExigirPolitica('usuarios:administrar')
export class AdministracaoUsuariosController {
  constructor(private readonly administracao: AdministracaoUsuariosService) {}

  @Get()
  listar() {
    return this.administracao.listar();
  }

  @Get('consulta')
  @UsePipes(validacao)
  consultar(@Query() filtros: ConsultarFuncionariosDto) {
    return this.administracao.consultar(filtros);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UsePipes(validacao)
  criar(@Body() dto: CriarFuncionarioDto, @Req() requisicao: RequisicaoAutorizada) {
    return this.administracao.criar(dto, requisicao.usuarioDominio!);
  }

  @Patch(':id/email')
  @UsePipes(validacao)
  alterarEmail(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: AlterarEmailDto, @Req() req: RequisicaoAutorizada) {
    return this.administracao.alterarEmail(id, dto.email, req.usuarioDominio!);
  }

  @Put(':id/senha')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UsePipes(validacao)
  redefinirSenha(@Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: RedefinirSenhaDto, @Req() req: RequisicaoAutorizada) {
    return this.administracao.redefinirSenha(id, dto.novaSenha, req.usuarioDominio!);
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
