import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe,
  Put, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPolitica } from './politica.decorator.js';
import type { RequisicaoAutorizada } from './usuario-autenticado.js';
import { GestaoPermissoesService } from './gestao-permissoes.service.js';
import { ConcederPermissaoDto } from './dto/conceder-permissao.dto.js';

@Controller('admin/usuarios/:usuarioId/permissoes')
@ExigirPolitica('usuarios:administrar')
export class GestaoPermissoesController {
  constructor(private readonly gestao: GestaoPermissoesService) {}

  @Get()
  listar(@Param('usuarioId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Req() req: RequisicaoAutorizada) {
    return this.gestao.listar(id, req.usuarioDominio!);
  }

  @Put()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
  conceder(@Param('usuarioId', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() dto: ConcederPermissaoDto, @Req() req: RequisicaoAutorizada) {
    return this.gestao.conceder(id, dto, req.usuarioDominio!);
  }

  @Delete(':contratoId')
  @HttpCode(HttpStatus.NO_CONTENT)
  revogar(@Param('usuarioId', new ParseUUIDPipe({ version: '4' })) usuarioId: string,
    @Param('contratoId', new ParseUUIDPipe({ version: '4' })) contratoId: string,
    @Req() req: RequisicaoAutorizada) {
    return this.gestao.revogar(usuarioId, contratoId, req.usuarioDominio!);
  }
}
