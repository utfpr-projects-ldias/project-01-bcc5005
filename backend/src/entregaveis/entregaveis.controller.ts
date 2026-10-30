import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put,
  Query, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import {
  CriarEntregavelDto, EditarEntregavelDto, ListarEntregaveisDto, SubstituirChecklistDto,
} from './dto/planejamento-entregavel.dto.js';
import { EntregaveisService } from './entregaveis.service.js';

@Controller('contratos/:contratoId/entregaveis')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class EntregaveisController {
  constructor(private readonly service: EntregaveisService) {}

  @Get()
  @ExigirPoliticaOperacional('entregaveis:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listar(@Param('contratoId') contratoId: string, @Query() query: ListarEntregaveisDto) {
    return this.service.listar(contratoId, query.etapaId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('entregaveis:criar', { tipo: 'contrato', parametro: 'contratoId' })
  criar(@Param('contratoId') contratoId: string, @Body() dto: CriarEntregavelDto, @Req() req: RequisicaoAutorizada) {
    return this.service.criar(contratoId, dto, req.usuarioDominio!);
  }

  /** Somente perfis com permissão de planejamento podem pesquisar funcionários ativos. */
  @Get('responsaveis')
  @ExigirPoliticaOperacional('entregaveis:criar', { tipo: 'contrato', parametro: 'contratoId' })
  consultarResponsaveis(@Query('busca') busca?: string, @Query('pagina') pagina?: string) {
    const numero = pagina === undefined ? 1 : Number(pagina);
    if (!Number.isInteger(numero) || numero < 1 || numero > 1000) {
      throw new BadRequestException('Página inválida');
    }
    return this.service.consultarResponsaveis(busca, numero);
  }

  @Get(':entregavelId')
  @ExigirPoliticaOperacional('entregaveis:visualizar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  detalhar(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string) {
    return this.service.detalhar(contratoId, entregavelId);
  }

  @Patch(':entregavelId')
  @ExigirPoliticaOperacional('entregaveis:editar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  editar(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string,
    @Body() dto: EditarEntregavelDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editar(contratoId, entregavelId, dto, req.usuarioDominio!);
  }

  /** PUT atômico: lista completa. Omissão de itens existentes remove-os do checklist. */
  @Put(':entregavelId/evidencias-esperadas')
  @ExigirPoliticaOperacional('entregaveis:editar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  atualizarChecklist(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string,
    @Body() dto: SubstituirChecklistDto, @Req() req: RequisicaoAutorizada) {
    return this.service.substituirChecklist(contratoId, entregavelId, dto, req.usuarioDominio!);
  }
}
