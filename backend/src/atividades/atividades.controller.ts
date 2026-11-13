import {
  Body, Controller, Get, Param, Patch, Post, Query, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AtividadesService } from './atividades.service.js';
import { AtividadeComprovantesService } from './atividade-comprovantes.service.js';
import { IsUUID } from 'class-validator';

class VincularComprovanteDto { @IsUUID() comprovanteId!: string; }
import { CreateAtividadeDto } from './dto/create-atividade.dto.js';
import { UpdateAtividadeDto } from './dto/update-atividade.dto.js';
import { TransicaoAtividadeDto } from './dto/transicao-atividade.dto.js';

/** Rotas aninhadas: o guard resolve o contrato da URL ou da atividade persistida. */
@Controller('contratos/:contratoId/atividades')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class AtividadesController {
  constructor(private readonly atividades: AtividadesService, private readonly comprovantes: AtividadeComprovantesService) {}

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

  @Get(':id/evidencias')
  @ExigirPoliticaOperacional('atividades:visualizar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  listarComprovantes(@Param('contratoId') contratoId: string, @Param('id') id: string) {
    return this.comprovantes.listar(contratoId, id);
  }

  @Post(':id/evidencias')
  @ExigirPoliticaOperacional('atividades:editar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  vincularComprovante(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: VincularComprovanteDto, @Req() req: RequisicaoAutorizada) {
    return this.comprovantes.vincular(contratoId, id, dto.comprovanteId, req.usuarioDominio!);
  }

  @Patch(':id')
  @ExigirPoliticaOperacional('atividades:editar', {
    tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId',
  })
  editar(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: UpdateAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.update(contratoId, id, dto, req.usuarioDominio!);
  }

  @Post(':id/solicitar-conclusao')
  @ExigirPoliticaOperacional('atividades:editar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  solicitarConclusao(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Req() req: RequisicaoAutorizada) {
    return this.atividades.solicitarConclusao(contratoId, id, req.usuarioDominio!);
  }

  @Post(':id/cancelar-solicitacao')
  @ExigirPoliticaOperacional('atividades:editar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  cancelarSolicitacao(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.cancelarSolicitacao(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/aprovar-conclusao')
  @ExigirPoliticaOperacional('atividades:verificar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  aprovarConclusao(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.verificar(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/verificar')
  @ExigirPoliticaOperacional('atividades:verificar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  verificar(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.verificar(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/reabrir')
  @ExigirPoliticaOperacional('atividades:reabrir', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  reabrir(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.reabrir(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/arquivar')
  @ExigirPoliticaOperacional('atividades:arquivar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  arquivar(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.arquivar(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/excluir')
  @ExigirPoliticaOperacional('atividades:excluir', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  excluir(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.excluir(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }

  @Post(':id/reativar')
  @ExigirPoliticaOperacional('atividades:reativar', { tipo: 'recurso', recurso: 'atividade', parametro: 'id', parametroContratoPai: 'contratoId' })
  reativar(@Param('contratoId') contratoId: string, @Param('id') id: string,
    @Body() dto: TransicaoAtividadeDto, @Req() req: RequisicaoAutorizada) {
    return this.atividades.reativar(contratoId, id, req.usuarioDominio!, dto.justificativa ?? '');
  }
}
