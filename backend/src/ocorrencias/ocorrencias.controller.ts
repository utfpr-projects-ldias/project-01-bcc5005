import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { OcorrenciasService } from './ocorrencias.service.js';
import { GerarOcorrenciasDto } from './dto/gerar-ocorrencias.dto.js';
import { CriarOcorrenciaManualDto } from './dto/criar-ocorrencia-manual.dto.js';
import { AtualizarOcorrenciaDto } from './dto/atualizar-ocorrencia.dto.js';

@Controller('contratos/:contratoId')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OcorrenciasController {
  constructor(private readonly ocorrenciasService: OcorrenciasService) {}

  @Post('entregaveis/:entregavelId/ocorrencias/gerar')
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('ocorrencias:gerar', {
    tipo: 'contrato',
    parametro: 'contratoId',
  })
  gerarRecorrentes(
    @Param('contratoId') contratoId: string,
    @Param('entregavelId') entregavelId: string,
    @Body() dto: GerarOcorrenciasDto,
    @Req() req: RequisicaoAutorizada,
  ) {
    return this.ocorrenciasService.gerarRecorrentes(
      contratoId,
      entregavelId,
      Boolean(dto.forcarRegeneracaoFuturas),
      req.usuarioDominio!,
    );
  }

  @Post('entregaveis/:entregavelId/ocorrencias')
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('ocorrencias:criar', {
    tipo: 'contrato',
    parametro: 'contratoId',
  })
  criarManual(
    @Param('contratoId') contratoId: string,
    @Param('entregavelId') entregavelId: string,
    @Body() dto: CriarOcorrenciaManualDto,
    @Req() req: RequisicaoAutorizada,
  ) {
    return this.ocorrenciasService.criarManualQuantitativa(
      contratoId,
      entregavelId,
      dto,
      req.usuarioDominio!,
    );
  }

  @Get('ocorrencias')
  @ExigirPoliticaOperacional('ocorrencias:listar', {
    tipo: 'contrato',
    parametro: 'contratoId',
  })
  listar(
    @Param('contratoId') contratoId: string,
    @Query('entregavelId') entregavelId?: string,
  ) {
    return this.ocorrenciasService.listar(contratoId, entregavelId);
  }

  @Get('ocorrencias/:ocorrenciaId')
  @ExigirPoliticaOperacional('ocorrencias:visualizar', {
    tipo: 'recurso',
    recurso: 'ocorrencia',
    parametro: 'ocorrenciaId',
    parametroContratoPai: 'contratoId',
  })
  detalhar(
    @Param('contratoId') contratoId: string,
    @Param('ocorrenciaId') ocorrenciaId: string,
  ) {
    return this.ocorrenciasService.detalhar(contratoId, ocorrenciaId);
  }

  @Patch('ocorrencias/:ocorrenciaId')
  @ExigirPoliticaOperacional('ocorrencias:editar', {
    tipo: 'recurso',
    recurso: 'ocorrencia',
    parametro: 'ocorrenciaId',
    parametroContratoPai: 'contratoId',
  })
  atualizar(
    @Param('contratoId') contratoId: string,
    @Param('ocorrenciaId') ocorrenciaId: string,
    @Body() dto: AtualizarOcorrenciaDto,
    @Req() req: RequisicaoAutorizada,
  ) {
    return this.ocorrenciasService.atualizar(
      contratoId,
      ocorrenciaId,
      dto,
      req.usuarioDominio!,
    );
  }
}
