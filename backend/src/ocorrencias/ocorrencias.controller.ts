import {
  Body,
  Delete,
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
import { ReplanejamentoService } from './replanejamento.service.js';
import { ReplanejarOcorrenciasDto } from './dto/replanejar-ocorrencias.dto.js';
import { OcorrenciasService } from './ocorrencias.service.js';
import { GerarOcorrenciasDto } from './dto/gerar-ocorrencias.dto.js';
import { CriarOcorrenciaManualDto } from './dto/criar-ocorrencia-manual.dto.js';
import { AtualizarOcorrenciaDto } from './dto/atualizar-ocorrencia.dto.js';
import { EditarMetaOcorrenciaDto } from './dto/editar-meta-ocorrencia.dto.js';
import { JustificativaDecisaoDto } from '../contratos/dto/justificativa-decisao.dto.js';
import { ReabrirOcorrenciaDto } from './dto/reabrir-ocorrencia.dto.js';
import { CriarLancamentoOcorrenciaDto, CorrigirLancamentoOcorrenciaDto, BloquearLancamentoOcorrenciaDto, ExcluirLancamentoOcorrenciaDto, VincularComprovanteOcorrenciaDto } from './dto/lancamento-ocorrencia.dto.js';

@Controller('contratos/:contratoId')
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class OcorrenciasController {
  constructor(private readonly ocorrenciasService: OcorrenciasService, private readonly replanejamento: ReplanejamentoService) {}

  @Post('entregaveis/:entregavelId/ocorrencias/replanejar')
  @ExigirPoliticaOperacional('ocorrencias:replanejar', { tipo: 'recurso', recurso: 'entregavel', parametro: 'entregavelId', parametroContratoPai: 'contratoId' })
  replanejar(@Param('contratoId') contratoId: string, @Param('entregavelId') id: string, @Body() dto: ReplanejarOcorrenciasDto, @Req() req: RequisicaoAutorizada) {
    return this.replanejamento.executar(contratoId, id, dto, req.usuarioDominio!);
  }

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
      dto,
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

  @Post('ocorrencias/iniciar-previstas')
  @ExigirPoliticaOperacional('ocorrencias:editar',{tipo:'contrato',parametro:'contratoId'})
  iniciarPrevistas(@Param('contratoId') contratoId:string,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.iniciarPrevistas(contratoId,req.usuarioDominio!);
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


  @Get('ocorrencias/:ocorrenciaId/lancamentos')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  lancamentos(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string) {
    return this.ocorrenciasService.listarLancamentos(contratoId,id);
  }
  @Post('ocorrencias/:ocorrenciaId/lancamentos')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  registrarLancamento(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Body() dto:CriarLancamentoOcorrenciaDto,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.registrarLancamento(contratoId,id,dto.id,dto.quantidade,dto.justificativa,req.usuarioDominio!);
  }
  @Patch('ocorrencias/:ocorrenciaId/lancamentos/:lancamentoId')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  corrigirLancamento(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Param('lancamentoId') lancamentoId:string,@Body() dto:CorrigirLancamentoOcorrenciaDto,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.corrigirLancamento(contratoId,id,lancamentoId,dto.quantidade,dto.justificativa,req.usuarioDominio!);
  }
  @Patch('ocorrencias/:ocorrenciaId/lancamentos/:lancamentoId/bloqueio')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  bloquearLancamento(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Param('lancamentoId') lancamentoId:string,@Body() dto:BloquearLancamentoOcorrenciaDto,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.alterarBloqueioLancamento(contratoId,id,lancamentoId,dto.bloqueado,req.usuarioDominio!);
  }
  @Delete('ocorrencias/:ocorrenciaId/lancamentos/:lancamentoId')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  excluirLancamento(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Param('lancamentoId') lancamentoId:string,@Body() dto:ExcluirLancamentoOcorrenciaDto,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.excluirLancamento(contratoId,id,lancamentoId,dto.justificativa,req.usuarioDominio!);
  }
  @Get('ocorrencias/:ocorrenciaId/evidencias')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  listarComprovantes(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string) {
    return this.ocorrenciasService.listarComprovantes(contratoId,id);
  }
  @Post('ocorrencias/:ocorrenciaId/evidencias')
  @ExigirPoliticaOperacional('ocorrencias:vincular-evidencia',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  vincularComprovante(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Body() dto:VincularComprovanteOcorrenciaDto,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.vincularComprovante(contratoId,id,dto.comprovanteId,req.usuarioDominio!);
  }
  @Delete('ocorrencias/:ocorrenciaId/evidencias/:comprovanteId')
  @ExigirPoliticaOperacional('ocorrencias:vincular-evidencia',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  desvincularComprovante(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string,
    @Param('comprovanteId') comprovanteId:string,@Req() req:RequisicaoAutorizada) {
    return this.ocorrenciasService.desvincularComprovante(contratoId,id,comprovanteId,req.usuarioDominio!);
  }
  @Get('ocorrencias/:ocorrenciaId/historico')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  historico(@Param('contratoId') contratoId:string,@Param('ocorrenciaId') id:string) {
    return this.ocorrenciasService.historico(contratoId,id);
  }
  @Patch('ocorrencias/:ocorrenciaId/exigencias')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  atualizarExigencias(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string,
    @Body() dto: AtualizarOcorrenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.atualizar(contratoId,id,dto,req.usuarioDominio!,'EXIGENCIAS');
  }

  @Patch('ocorrencias/:ocorrenciaId/meta')
  @ExigirPoliticaOperacional('ocorrencias:editar-meta', {
    tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId',
  })
  editarMeta(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string,
    @Body() dto: EditarMetaOcorrenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.atualizar(contratoId, id,
      { metaQuantidade: dto.metaQuantidade }, req.usuarioDominio!, 'META', dto.justificativa);
  }

  @Patch('ocorrencias/:ocorrenciaId/peso')
  @ExigirPoliticaOperacional('ocorrencias:visualizar',{tipo:'recurso',recurso:'ocorrencia',parametro:'ocorrenciaId',parametroContratoPai:'contratoId'})
  atualizarPeso(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string,
    @Body() dto: AtualizarOcorrenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.atualizar(contratoId,id,dto,req.usuarioDominio!,'PESO');
  }

  @Post('ocorrencias/:ocorrenciaId/iniciar')
  @ExigirPoliticaOperacional('ocorrencias:editar', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  iniciar(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.iniciar(contratoId, id, req.usuarioDominio!);
  }

  @Post('ocorrencias/:ocorrenciaId/solicitar-conclusao')
  @ExigirPoliticaOperacional('ocorrencias:editar', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  solicitarConclusao(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.solicitarConclusao(contratoId, id, req.usuarioDominio!);
  }

  @Post('ocorrencias/:ocorrenciaId/concluir')
  @ExigirPoliticaOperacional('ocorrencias:concluir', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  concluir(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.concluir(contratoId, id, req.usuarioDominio!);
  }

  @Post('ocorrencias/:ocorrenciaId/solicitar-encerramento')
  @ExigirPoliticaOperacional('ocorrencias:editar', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  solicitarEncerramento(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string,
    @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.solicitarEncerramento(contratoId, id, dto.motivo, req.usuarioDominio!);
  }

  @Post('ocorrencias/:ocorrenciaId/aprovar-encerramento')
  @ExigirPoliticaOperacional('ocorrencias:concluir', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  aprovarEncerramento(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.aprovarEncerramento(contratoId, id, req.usuarioDominio!);
  }

  @Post('ocorrencias/:ocorrenciaId/reabrir')
  @ExigirPoliticaOperacional('ocorrencias:reabrir', { tipo: 'recurso', recurso: 'ocorrencia', parametro: 'ocorrenciaId', parametroContratoPai: 'contratoId' })
  reabrir(@Param('contratoId') contratoId: string, @Param('ocorrenciaId') id: string, @Body() dto: ReabrirOcorrenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.ocorrenciasService.reabrir(contratoId, id, dto.justificativa ?? '', req.usuarioDominio!);
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
