import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AtividadesService } from './atividades.service.js';
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';

/** Rotas aninhadas: o guard resolve o contrato da URL ou da atividade persistida. */
@Controller('contratos/:contratoId/atividades')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AtividadesController {
  constructor(private readonly atividades: AtividadesService) {}

  @Post()
  @ExigirPoliticaOperacional('atividades:registrar', { tipo: 'contrato', parametro: 'contratoId' })
  criar(@Param('contratoId') contratoId: string, @Body() dto: CreateAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.create(contratoId, dto, req.usuarioDominio!);
  }

  @Get()
  @ExigirPoliticaOperacional('atividades:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listar(@Param('contratoId') contratoId: string, @Query() query: Record<string, string>) {
    return this.atividades.findAllPaginated(contratoId, query);
  }

  @Get(':id')
  @ExigirPoliticaOperacional('atividades:visualizar', {
    tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId',
  })
  detalhar(@Param('contratoId') contratoId: string, @Param('id') id: string) {
    return this.atividades.findOne(contratoId, id);
  }

  @Patch(':id')
  @ExigirPoliticaOperacional('atividades:editar', {
    tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId',
  })
  editar(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: UpdateAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.update(contratoId, id, dto, req.usuarioDominio!);
  }
}
