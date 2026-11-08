import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Put,
  Query, Req, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { JustificativaDecisaoDto } from '../contratos/dto/justificativa-decisao.dto.js';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import {
  CriarEntregavelDto, EditarEntregavelDto, ListarEntregaveisDto, SubstituirChecklistDto,
} from './dto/planejamento-entregavel.dto.js';
import { EntregaveisService } from './entregaveis.service.js';
import { ArquivamentoPlanejamentoService } from './arquivamento-planejamento.service.js';
import { ExclusaoPlanejamentoService } from './exclusao-planejamento.service.js';

@Controller('contratos/:contratoId/entregaveis')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class EntregaveisController {
  constructor(private readonly service: EntregaveisService, private readonly arquivo: ArquivamentoPlanejamentoService, private readonly exclusao: ExclusaoPlanejamentoService) {}

  @Get()
  @ExigirPoliticaOperacional('entregaveis:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listar(@Param('contratoId') contratoId: string, @Query() query: ListarEntregaveisDto) {
    return this.service.listar(contratoId, query.etapaId);
  }

  @Get('resumo-documental')
  @ExigirPoliticaOperacional('entregaveis:listar', { tipo: 'contrato', parametro: 'contratoId' })
  resumoDocumental(@Param('contratoId') contratoId: string) {
    return this.service.resumoDocumental(contratoId);
  }

  @Get('arquivados')
  @ExigirPoliticaOperacional('entregaveis:arquivados', { tipo: 'contrato', parametro: 'contratoId' })
  arquivados(@Param('contratoId') contratoId: string, @Query() query: ListarEntregaveisDto) {
    return this.service.listar(contratoId, query.etapaId, true);
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
  detalhar(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string, @Req() req: RequisicaoAutorizada) {
    return this.service.detalhar(contratoId, entregavelId, req.usuarioDominio!);
  }

  @Get(':entregavelId/historico')
  @ExigirPoliticaOperacional('entregaveis:visualizar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  historico(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string, @Req() req: RequisicaoAutorizada) {
    return this.service.historico(contratoId, entregavelId, req.usuarioDominio!);
  }

  @Patch(':entregavelId')
  @ExigirPoliticaOperacional('entregaveis:editar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  editar(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string,
    @Body() dto: EditarEntregavelDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editar(contratoId, entregavelId, dto, req.usuarioDominio!);
  }

  @Patch(':entregavelId/concluir')
  @ExigirPoliticaOperacional('entregaveis:concluir', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  concluir(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string, @Req() req: RequisicaoAutorizada) {
    return this.service.concluir(contratoId, entregavelId, req.usuarioDominio!);
  }

  @Patch(':entregavelId/reabrir')
  @ExigirPoliticaOperacional('entregaveis:reabrir', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  reabrir(@Param('contratoId') c: string, @Param('entregavelId') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.service.reabrir(c, id, req.usuarioDominio!, dto.motivo);
  }

  @Patch(':entregavelId/arquivar')
  @ExigirPoliticaOperacional('entregaveis:arquivar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  arquivar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.arquivo.alterarEntregavel(contratoId, id, true, req.usuarioDominio!);
  }

  @Patch(':entregavelId/reativar')
  @ExigirPoliticaOperacional('entregaveis:reativar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  reativar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.arquivo.alterarEntregavel(contratoId, id, false, req.usuarioDominio!, dto.motivo);
  }

  @Post(':entregavelId/excluir')
  @ExigirPoliticaOperacional('entregaveis:excluir', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  excluir(@Param('contratoId') c: string, @Param('entregavelId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.exclusao.excluir('entregavel', c, id, req.usuarioDominio!);
  }

  /** Checklist: remoções diretas por PUT são rejeitadas; arquivar e excluir depois. */
  @Put(':entregavelId/evidencias-esperadas')
  @ExigirPoliticaOperacional('entregaveis:editar', {
    tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId',
  })
  atualizarChecklist(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string,
    @Body() dto: SubstituirChecklistDto, @Req() req: RequisicaoAutorizada) {
    return this.service.substituirChecklist(contratoId, entregavelId, dto, req.usuarioDominio!);
  }
}
