import {
  Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Req,
  UsePipes, ValidationPipe,
} from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { AtualizarEtapaDto } from './dto/atualizar-etapa.dto.js';
import { CriarEtapaDto } from './dto/criar-etapa.dto.js';
import { ReordenarEtapasDto } from './dto/reordenar-etapas.dto.js';
import { EtapasService } from './etapas.service.js';

/** HU06-02 — APIs reais; a AutorizacaoGuard global controla a sessão e o escopo. */
@Controller('contratos/:contratoId/etapas')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class EtapasController {
  constructor(private readonly etapas: EtapasService) {}

  @Get()
  @ExigirPoliticaOperacional('etapas:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listar(@Param('contratoId') contratoId: string) {
    return this.etapas.listar(contratoId);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('etapas:criar', { tipo: 'contrato', parametro: 'contratoId' })
  criar(@Param('contratoId') contratoId: string, @Body() dto: CriarEtapaDto, @Req() req: RequisicaoAutorizada) {
    return this.etapas.criar(contratoId, dto, req.usuarioDominio!);
  }

  // Declarar reordenação antes da rota dinâmica :etapaId.
  @Patch('reordenar')
  @ExigirPoliticaOperacional('etapas:reordenar', { tipo: 'contrato', parametro: 'contratoId' })
  reordenar(@Param('contratoId') contratoId: string, @Body() dto: ReordenarEtapasDto, @Req() req: RequisicaoAutorizada) {
    return this.etapas.reordenar(contratoId, dto, req.usuarioDominio!);
  }

  @Get(':etapaId')
  @ExigirPoliticaOperacional('etapas:visualizar', {
    tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId',
  })
  detalhar(@Param('contratoId') contratoId: string, @Param('etapaId') etapaId: string) {
    return this.etapas.detalhar(contratoId, etapaId);
  }

  @Patch(':etapaId')
  @ExigirPoliticaOperacional('etapas:editar', {
    tipo: 'recurso', recurso: 'etapa', parametro: 'etapaId', parametroContratoPai: 'contratoId',
  })
  editar(
    @Param('contratoId') contratoId: string,
    @Param('etapaId') etapaId: string,
    @Body() dto: AtualizarEtapaDto,
    @Req() req: RequisicaoAutorizada,
  ) {
    return this.etapas.editar(contratoId, etapaId, dto, req.usuarioDominio!);
  }
}
