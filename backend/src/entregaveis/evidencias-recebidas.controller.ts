import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post,
  Req, Res, UploadedFile, UseInterceptors, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JustificativaDecisaoDto } from '../contratos/dto/justificativa-decisao.dto.js';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { lerInteiroPositivo, POLITICA_PROVISORIA } from '../armazenamento/politica-arquivos.js';
import type { ArquivoComprovante } from './evidencias-recebidas.service.js';
import { EvidenciasRecebidasService } from './evidencias-recebidas.service.js';
import { ArquivamentoPlanejamentoService } from './arquivamento-planejamento.service.js';
import { ExclusaoPlanejamentoService } from './exclusao-planejamento.service.js';
import { EditarVinculosEvidenciaDto, EditarContribuicaoEvidenciaDto, EditarEvidenciaEsperadaDto, EnviarComprovanteDto, VerificarComprovanteDto } from './dto/evidencias-recebidas.dto.js';
const maxArquivo = lerInteiroPositivo(process.env.ARQUIVOS_MAX_ARQUIVO_BYTES, POLITICA_PROVISORIA.maxArquivoBytes);
const recurso = { tipo: 'recurso' as const, recurso: 'entregavel' as const, parametro: 'entregavelId', parametroContratoPai: 'contratoId' };

@Controller('contratos/:contratoId/entregaveis/:entregavelId/evidencias-esperadas')
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class EvidenciasRecebidasController {
  constructor(private readonly service: EvidenciasRecebidasService, private readonly arquivo: ArquivamentoPlanejamentoService, private readonly exclusao: ExclusaoPlanejamentoService) {}
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('evidencias:criaresperada', recurso)
  criar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Body() dto: EditarEvidenciaEsperadaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.criarEsperada(c, e, dto, req.usuarioDominio!);
  }

  @Get('arquivadas')
  @ExigirPoliticaOperacional('evidencias:arquivadasesperadas', recurso)
  arquivadas(@Param('contratoId') contratoId: string, @Param('entregavelId') entregavelId: string) {
    return this.arquivo.listarEvidenciasArquivadas(contratoId, entregavelId);
  }

  @Patch(':esperadaId/arquivar')
  @ExigirPoliticaOperacional('evidencias:arquivaresperada', recurso)
  arquivar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.arquivo.alterarEvidencia(c, e, id, true, req.usuarioDominio!);
  }

  @Patch(':esperadaId/reativar')
  @ExigirPoliticaOperacional('evidencias:reativaresperada', recurso)
  reativar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.arquivo.alterarEvidencia(c, e, id, false, req.usuarioDominio!, dto.motivo);
  }

  @Post(':esperadaId/excluir')
  @ExigirPoliticaOperacional('evidencias:excluiresperada', recurso)
  excluir(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Param('esperadaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.exclusao.excluir('evidencia', c, id, req.usuarioDominio!, e);
  }

  @Get('destinos-compartilhamento')
  @ExigirPoliticaOperacional('entregaveis:visualizar', recurso)
  destinos(@Param('contratoId') c: string, @Param('entregavelId') e: string, @Req() req: RequisicaoAutorizada) {
    return this.service.listarDestinos(c,e,req.usuarioDominio!);
  }
  @Get(':esperadaId')
  @ExigirPoliticaOperacional('entregaveis:visualizar', recurso)
  detalhe(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Req() req: RequisicaoAutorizada) {
    return this.service.detalhar(c, e, id, req.usuarioDominio!);
  }
  @Patch(':esperadaId')
  @ExigirPoliticaOperacional('evidencias:editaresperada', recurso)
  editar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Body() dto: EditarEvidenciaEsperadaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editarEsperada(c, e, id, dto, req.usuarioDominio!);
  }
  @Patch(':esperadaId/vinculos')
  @ExigirPoliticaOperacional('evidencias:editaresperada', recurso)
  editarVinculos(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Body() dto: EditarVinculosEvidenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editarVinculos(c,e,id,dto,req.usuarioDominio!);
  }
  @Patch(':esperadaId/contribuicao')
  @ExigirPoliticaOperacional('execucao:atualizar', recurso)
  editarDeclaracao(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Body() dto: EditarContribuicaoEvidenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editarContribuicao(c,e,id,'rascunho',dto,req.usuarioDominio!);
  }
  @Patch(':esperadaId/comprovantes/:comprovanteId/contribuicao')
  @ExigirPoliticaOperacional('execucao:atualizar', recurso)
  editarContribuicao(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Param('comprovanteId') comprovante: string,
    @Body() dto: EditarContribuicaoEvidenciaDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editarContribuicao(c,e,id,comprovante,dto,req.usuarioDominio!);
  }
  @Patch(':esperadaId/reabrir')
  @ExigirPoliticaOperacional('evidencias:reabrir', { tipo: 'contrato', parametro: 'contratoId' })
  reabrir(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.service.reabrir(c, e, id, req.usuarioDominio!, dto.motivo);
  }

  @Post(':esperadaId/comprovantes')
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('evidencias:anexar', { tipo: 'contrato', parametro: 'contratoId' })
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: maxArquivo, files: 1, fields: 12, parts: 13 } }))
  enviar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @UploadedFile() arquivo: ArquivoComprovante | undefined,
    @Body() dto: EnviarComprovanteDto, @Req() req: RequisicaoAutorizada) {
    if (!arquivo) throw new BadRequestException('Selecione um arquivo');
    return this.service.enviar(c, e, id, arquivo, dto, req.usuarioDominio!);
  }
  @Post(':esperadaId/comprovantes/:comprovanteId/verificar')
  @HttpCode(HttpStatus.OK)
  @ExigirPoliticaOperacional('evidencias:verificar', { tipo: 'contrato', parametro: 'contratoId' })
  verificar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Param('comprovanteId') comprovante: string, @Req() req: RequisicaoAutorizada, @Body() dto: VerificarComprovanteDto) {
    return this.service.verificar(c, e, id, comprovante, req.usuarioDominio!, dto);
  }
  @Post(':esperadaId/comprovantes/:comprovanteId/rejeitar')
  @HttpCode(HttpStatus.OK)
  @ExigirPoliticaOperacional('evidencias:verificar', { tipo: 'contrato', parametro: 'contratoId' })
  rejeitar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Param('comprovanteId') comprovante: string,
    @Req() req: RequisicaoAutorizada, @Body() dto: JustificativaDecisaoDto) {
    return this.service.rejeitar(c, e, id, comprovante, dto.motivo, req.usuarioDominio!);
  }
  @Get(':esperadaId/comprovantes/:comprovanteId/download')
  @ExigirPoliticaOperacional('entregaveis:visualizar', recurso)
  async baixar(@Param('contratoId') c: string, @Param('entregavelId') e: string,
    @Param('esperadaId') id: string, @Param('comprovanteId') comprovante: string,
    @Req() req: RequisicaoAutorizada, @Res() res: Response) {
    const arquivo = await this.service.baixar(c, e, id, comprovante, req.usuarioDominio!);
    res.setHeader('Content-Disposition', `attachment; filename="comprovante"; filename*=UTF-8''${encodeURIComponent(arquivo.nomeOriginal)}`);
    res.setHeader('Content-Type', arquivo.tipoMime);
    res.setHeader('Content-Length', String(arquivo.bytes.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(HttpStatus.OK).send(arquivo.bytes);
  }
}
