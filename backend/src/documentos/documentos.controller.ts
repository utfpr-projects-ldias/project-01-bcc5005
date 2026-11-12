import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Patch, Query,
  Req, Res, UploadedFile, UseInterceptors, UsePipes, ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ExigirPoliticaOperacional } from '../autorizacao/politica.decorator.js';
import type { RequisicaoAutorizada } from '../autorizacao/usuario-autenticado.js';
import { lerInteiroPositivo, POLITICA_PROVISORIA } from '../armazenamento/politica-arquivos.js';
import { CriarDocumentoDto, EditarDocumentoDto, ListarDocumentosDto } from './dto/documentos.dto.js';
import { DocumentosService, type ArquivoRecebido } from './documentos.service.js';
import { JustificativaDecisaoDto } from '../contratos/dto/justificativa-decisao.dto.js';

const limiteArquivo = lerInteiroPositivo(process.env.ARQUIVOS_MAX_ARQUIVO_BYTES, POLITICA_PROVISORIA.maxArquivoBytes);
const validacao = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });

/** RF-04 / TEC08-02: política aplicada no guard ANTES de processar multipart ou enviar bytes. */
@Controller('contratos/:contratoId/documentos')
@UsePipes(validacao)
export class DocumentosController {
  constructor(private readonly service: DocumentosService) {}

  @Get()
  @ExigirPoliticaOperacional('documentos:listar', { tipo: 'contrato', parametro: 'contratoId' })
  listar(@Param('contratoId') contratoId: string, @Query() query: ListarDocumentosDto) {
    return this.service.listar(contratoId, query.categoria, query.pagina, query.arquivados === 'true', query.situacao);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ExigirPoliticaOperacional('documentos:anexar', { tipo: 'contrato', parametro: 'contratoId' })
  @UseInterceptors(FileInterceptor('arquivo', {
    limits: { fileSize: limiteArquivo, files: 1, fields: 2, parts: 3, fieldNameSize: 64 },
  }))
  anexar(@Param('contratoId') contratoId: string, @Body() dto: CriarDocumentoDto,
    @UploadedFile() arquivo: ArquivoRecebido | undefined, @Req() req: RequisicaoAutorizada) {
    if (!arquivo) throw new BadRequestException('Arquivo obrigatório');
    return this.service.anexar(contratoId, dto, arquivo, req.usuarioDominio!);
  }

  @Patch(':documentoId')
  @ExigirPoliticaOperacional('documentos:editar', {
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  editar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Body() dto: EditarDocumentoDto, @Req() req: RequisicaoAutorizada) {
    return this.service.editar(contratoId, documentoId, dto, req.usuarioDominio!);
  }

  @Patch(':documentoId/verificar')
  @ExigirPoliticaOperacional('documentos:visualizar', { tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId' })
  verificar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string, @Req() req: RequisicaoAutorizada) {
    return this.service.verificar(contratoId, documentoId, req.usuarioDominio!);
  }

  @Patch(':documentoId/reabrir')
  @ExigirPoliticaOperacional('documentos:visualizar', { tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId' })
  reabrir(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.service.reabrir(contratoId, documentoId, req.usuarioDominio!, dto.motivo);
  }

  @Patch(':documentoId/arquivar')
  @ExigirPoliticaOperacional('documentos:visualizar', {
    // O guard valida vínculo/escopo, o serviço valida a permissão correspondente
    // à categoria persistida do documento (anexo ou contrato principal).
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  arquivar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Req() req: RequisicaoAutorizada) {
    return this.service.arquivar(contratoId, documentoId, req.usuarioDominio!);
  }

  @Patch(':documentoId/reativar')
  @ExigirPoliticaOperacional('documentos:visualizar', {
    // O guard valida vínculo/escopo, o serviço valida a permissão correspondente
    // à categoria persistida do documento (anexo ou contrato principal).
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  reativar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Body() dto: JustificativaDecisaoDto, @Req() req: RequisicaoAutorizada) {
    return this.service.reativar(contratoId, documentoId, req.usuarioDominio!, dto.motivo);
  }

  @Post(':documentoId/excluir')
  @ExigirPoliticaOperacional('documentos:visualizar', {
    // O guard valida vínculo/escopo, o serviço valida a permissão correspondente
    // à categoria persistida do documento (anexo ou contrato principal).
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  excluir(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Req() req: RequisicaoAutorizada) {
    return this.service.excluirArquivado(contratoId, documentoId, req.usuarioDominio!);
  }

  @Get(':documentoId/download')
  @ExigirPoliticaOperacional('documentos:baixar', {
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  async baixar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string,
    @Res() res: Response) {
    const { metadados, conteudo } = await this.service.baixar(contratoId, documentoId);
    // filename simples + RFC 5987; nome original já foi validado pelo storage.
    res.setHeader('Content-Disposition', `attachment; filename="documento"; filename*=UTF-8''${encodeURIComponent(metadados.nomeOriginal)}`);
    res.setHeader('Content-Type', metadados.tipoMime);
    res.setHeader('Content-Length', String(conteudo.length));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(HttpStatus.OK).send(conteudo);
  }

  @Get(':documentoId')
  @ExigirPoliticaOperacional('documentos:visualizar', {
    tipo: 'recurso', recurso: 'documento', parametro: 'documentoId', parametroContratoPai: 'contratoId',
  })
  detalhar(@Param('contratoId') contratoId: string, @Param('documentoId') documentoId: string) {
    return this.service.detalhar(contratoId, documentoId);
  }
}
